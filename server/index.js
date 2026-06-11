// API server cho Claude Tree.
// - GET  /api/tree                 cây lượt thật (nodes/edges/branchPoints) + tên phiên
// - GET  /api/node/:uuid           nội dung đầy đủ 1 lượt
// - POST /api/chat   {sessionId,prompt}   stream trả lời (SSE), append vào tip phiên
// - POST /api/fork   {uuid,prompt}        fork tại node bất kỳ rồi chat (SSE)
// - POST /api/rename {sessionId,name}     đặt tên nhánh (sidecar names.json)
// - DELETE /api/session/:id        chuyển file phiên vào .trash (an toàn, hoàn tác được)
// - GET  /api/export/:id           xuất hội thoại 1 phiên ra markdown
// - GET  /api/search?q=            tìm trong các lượt
import express from 'express';
import cors from 'cors';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import {
  buildTree,
  serializeTree,
  DEFAULT_PROJECT_DIR,
  listSessions,
  buildForest,
  realText,
  PROJECTS_ROOT,
} from './treeBuilder.js';
import { forkAt } from './forker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = DEFAULT_PROJECT_DIR;
const projDir = (p) => (p ? join(PROJECTS_ROOT, p) : DIR);
const NAMES = join(__dirname, 'names.json');
const TRASH = join(__dirname, '.trash');

const loadNames = () => {
  try {
    return JSON.parse(readFileSync(NAMES, 'utf8'));
  } catch {
    return {};
  }
};
const saveNames = (n) => writeFileSync(NAMES, JSON.stringify(n, null, 2));

// Nối content thành text đầy đủ (giữ dấu vết tool gọn gàng)
function fullText(message) {
  const c = message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((b) =>
        b.type === 'text'
          ? b.text
          : b.type === 'tool_use'
            ? `\n⚙ [tool: ${b.name}] ${JSON.stringify(b.input ?? {}).slice(0, 400)}`
            : b.type === 'tool_result'
              ? '\n↳ [tool_result]'
              : '',
      )
      .join('');
  }
  return '';
}

// Tìm 1 message theo uuid (quét file của 1 project, trả nội dung đầy đủ)
function getMessage(uuid, dir = DIR) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      if (!line.includes(uuid)) continue;
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      if (e.uuid === uuid && e.message)
        return { uuid, role: e.type, sessionId: e.sessionId, ts: e.timestamp || '', text: fullText(e.message) };
    }
  }
  return null;
}

// SSE: spawn claude headless stream-json, forward text delta + result.
// cwd phải đúng project thì `claude --resume` mới tìm thấy phiên.
function runClaude(res, { resumeId, prompt, cwd }) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders?.();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const args = ['-p', prompt, '--output-format', 'stream-json', '--include-partial-messages', '--verbose'];
  if (resumeId) args.push('--resume', resumeId);
  send('start', { sessionId: resumeId ?? null });

  const child = spawn('claude', args, { cwd: cwd || homedir(), stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '';
  let session = resumeId ?? null;
  let err = '';

  child.stdout.on('data', (d) => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.session_id) session = ev.session_id;
      if (
        ev.type === 'stream_event' &&
        ev.event?.type === 'content_block_delta' &&
        ev.event.delta?.type === 'text_delta'
      ) {
        send('delta', { text: ev.event.delta.text });
      } else if (ev.type === 'result') {
        send('result', { text: ev.result ?? '', sessionId: session });
      }
    }
  });
  child.stderr.on('data', (d) => (err += d.toString()));
  child.on('close', (code) => {
    send('done', { sessionId: session, code, error: code ? err.slice(0, 600) : undefined });
    res.end();
  });
  res.on('close', () => child.kill());
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Danh sách phiên (mọi project hoặc 1 project), tên đã ghép custom-name sidecar.
app.get('/api/sessions', (req, res) => {
  const scope = req.query.project || 'all';
  const names = loadNames();
  const sessions = listSessions({ scope }).map((s) => ({ ...s, title: names[s.sessionId] || s.title }));
  res.json({ sessions });
});

// Cây SESSION (node = 1 phiên, cạnh = quan hệ fork)
app.get('/api/forest', (req, res) => {
  const names = loadNames();
  const { nodes } = buildForest({ scope: req.query.project || 'all' });
  res.json({ nodes: nodes.map((n) => ({ ...n, title: names[n.sessionId] || n.title })) });
});

// Hội thoại tuyến tính của 1 phiên (cho panel xem nội dung).
// ?parent=<id>: đánh dấu inherited=true cho message copy từ phiên cha (fork
// copy nguyên prefix giữ uuid) để UI gập phần kế thừa lại.
app.get('/api/conversation/:id', (req, res) => {
  const dir = projDir(req.query.project);
  const f = join(dir, `${req.params.id}.jsonl`);
  if (!existsSync(f)) return res.status(404).json({ error: 'not found' });

  let parentUuids = null;
  if (req.query.parent) {
    const pf = join(dir, `${req.query.parent}.jsonl`);
    if (existsSync(pf)) {
      parentUuids = new Set();
      for (const line of readFileSync(pf, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          if (e.uuid) parentUuids.add(e.uuid);
        } catch {
          /* ignore */
        }
      }
    }
  }

  const messages = [];
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if ((e.type === 'user' || e.type === 'assistant') && e.message && e.isSidechain !== true) {
      const text = realText(e.message);
      // bỏ wrapper lệnh local (<command-name>/clear, caveat, stdout...) — không phải hội thoại
      if (text.startsWith('<local-command') || text.startsWith('<command-')) continue;
      if (text)
        messages.push({
          uuid: e.uuid,
          role: e.type,
          text,
          inherited: parentUuids ? parentUuids.has(e.uuid) : false,
        });
    }
  }
  res.json({ messages });
});

app.get('/api/tree', (req, res) => {
  const tree = serializeTree(buildTree(projDir(req.query.project)));
  tree.sessionNames = loadNames();
  res.json(tree);
});

app.get('/api/node/:uuid', (req, res) => {
  const m = getMessage(req.params.uuid, projDir(req.query.project));
  return m ? res.json(m) : res.status(404).json({ error: 'not found' });
});

app.post('/api/chat', (req, res) => {
  const { sessionId, prompt, cwd } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  runClaude(res, { resumeId: sessionId, prompt, cwd });
});

app.post('/api/fork', (req, res) => {
  const { uuid, prompt, project, cwd } = req.body || {};
  if (!uuid || !prompt) return res.status(400).json({ error: 'uuid & prompt required' });
  let forked;
  try {
    forked = forkAt(uuid, projDir(project));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  // Tên nhánh = prompt đầu, tránh hàng loạt fork trùng tên aiTitle của cha
  const names = loadNames();
  names[forked.sessionId] = prompt.trim().slice(0, 60);
  saveNames(names);
  runClaude(res, { resumeId: forked.sessionId, prompt, cwd });
});

app.post('/api/rename', (req, res) => {
  const { sessionId, name } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  const names = loadNames();
  if (name) names[sessionId] = name;
  else delete names[sessionId];
  saveNames(names);
  res.json({ ok: true, sessionNames: names });
});

app.delete('/api/session/:id', (req, res) => {
  const f = join(projDir(req.query.project), `${req.params.id}.jsonl`);
  if (!existsSync(f)) return res.status(404).json({ error: 'not found' });
  if (!existsSync(TRASH)) mkdirSync(TRASH, { recursive: true });
  renameSync(f, join(TRASH, `${req.params.id}.jsonl`));
  res.json({ ok: true, trashed: req.params.id });
});

app.get('/api/export/:id', (req, res) => {
  const f = join(projDir(req.query.project), `${req.params.id}.jsonl`);
  if (!existsSync(f)) return res.status(404).json({ error: 'not found' });
  const out = [`# Session ${req.params.id}\n`];
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if ((e.type === 'user' || e.type === 'assistant') && e.message) {
      const t = fullText(e.message).trim();
      if (t) out.push(`\n## ${e.type === 'user' ? '🧑 User' : '🤖 Claude'}\n\n${t}`);
    }
  }
  res.set('Content-Type', 'text/markdown; charset=utf-8');
  res.send(out.join('\n'));
});

app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toString().toLowerCase();
  if (!q) return res.json({ matches: [] });
  const t = serializeTree(buildTree());
  const matches = t.nodes
    .filter((n) => n.snippet.toLowerCase().includes(q))
    .slice(0, 50)
    .map((n) => ({ uuid: n.uuid, role: n.role, snippet: n.snippet, sessions: n.sessions }));
  res.json({ matches });
});

const PORT = process.env.PORT || 4799;
app.listen(PORT, () => console.log(`claude-tree API on :${PORT}`));
