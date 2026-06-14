#!/usr/bin/env node
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
import { spawn, spawnSync } from 'node:child_process';
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
import { openInTerminal } from './terminal.js';

// Node >= 18 (fetch, structuredClone...) — báo rõ thay vì chết khó hiểu giữa chừng
const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  console.error(`⚠ Claude Tree cần Node.js >= 18 (bạn đang dùng ${process.versions.node}).`);
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
// Windows: npm cài claude dưới dạng shim .cmd -> spawn cần đúng tên
const CLAUDE_BIN = process.platform === 'win32' ? 'claude.cmd' : 'claude';
const DIR = DEFAULT_PROJECT_DIR;
// project bắt buộc + chống path traversal (tên project không được chứa / hay ..)
const projDir = (p) => {
  if (!p || p.includes('/') || p.includes('..')) {
    const err = new Error('project param required');
    err.status = 400;
    throw err;
  }
  return join(PROJECTS_ROOT, p);
};
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

  // Prompt đi qua STDIN (không phải arg) -> không lo escape ký tự đặc biệt khi
  // qua shell trên Windows, và không đụng giới hạn độ dài dòng lệnh.
  const args = ['-p', '--output-format', 'stream-json', '--include-partial-messages', '--verbose'];
  if (resumeId) args.push('--resume', resumeId);
  send('start', { sessionId: resumeId ?? null });

  const child = spawn(CLAUDE_BIN, args, {
    cwd: cwd || homedir(),
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32', // Windows cần shell để chạy claude.cmd shim
  });
  child.stdin.on('error', () => {}); // tránh EPIPE nếu claude thoát sớm
  child.stdin.write(prompt);
  child.stdin.end();
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
  let ended = false;
  const finish = (payload) => {
    if (ended) return;
    ended = true;
    send('done', payload);
    res.end();
  };
  child.on('error', (e) => finish({ sessionId: session, code: -1, error: 'Không chạy được claude CLI: ' + e.message }));
  child.on('close', (code) => finish({ sessionId: session, code, error: code ? err.slice(0, 600) : undefined }));
  res.on('close', () => child.kill());
}

const app = express();
// API đọc được toàn bộ lịch sử chat -> chỉ cho origin localhost
app.use(cors({ origin: [/^https?:\/\/localhost(:\d+)?$/, /^https?:\/\/127\.0\.0\.1(:\d+)?$/] }));
app.use(express.json({ limit: '1mb' }));

// Serve bản build production nếu có (npm run build trong web/) -> chạy 1 process duy nhất
const DIST = join(__dirname, '../web/dist');
if (existsSync(DIST)) app.use(express.static(DIST));

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
          ts: e.timestamp || null,
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
  const { uuid, prompt, project, cwd, sessionId } = req.body || {};
  if (!uuid || !prompt) return res.status(400).json({ error: 'uuid & prompt required' });
  let forked;
  try {
    forked = forkAt(uuid, projDir(project), sessionId);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  // Tên nhánh = prompt đầu, tránh hàng loạt fork trùng tên aiTitle của cha
  const names = loadNames();
  names[forked.sessionId] = prompt.trim().slice(0, 60);
  saveNames(names);
  runClaude(res, { resumeId: forked.sessionId, prompt, cwd });
});

// Mở terminal thật resume phiên — chat đầy đủ năng lực CLI, webapp chỉ trực quan hóa
app.post('/api/open-terminal', (req, res) => {
  const { sessionId, cwd } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  const term = openInTerminal([CLAUDE_BIN, '--resume', sessionId], cwd || homedir());
  res.json({ ok: true, terminal: term });
});

// Fork tại uuid (không gửi prompt) rồi mở terminal vào nhánh mới
app.post('/api/fork-terminal', (req, res) => {
  const { uuid, project, cwd, sessionId, title } = req.body || {};
  if (!uuid) return res.status(400).json({ error: 'uuid required' });
  let forked;
  try {
    forked = forkAt(uuid, projDir(project), sessionId);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const names = loadNames();
  names[forked.sessionId] = ('⑂ ' + (title || 'fork')).slice(0, 60);
  saveNames(names);
  const term = openInTerminal([CLAUDE_BIN, '--resume', forked.sessionId], cwd || homedir());
  res.json({ ok: true, sessionId: forked.sessionId, terminal: term });
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
  const title = (req.query.name || `session-${req.params.id.slice(0, 8)}`).toString();
  const fname = title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 80) || 'session';
  // header chỉ nhận latin-1 -> ASCII fallback + filename* UTF-8 (RFC 5987)
  const asciiName = fname.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '_');
  const disposition = (ext) =>
    `attachment; filename="${asciiName}.${ext}"; filename*=UTF-8''${encodeURIComponent(fname)}.${ext}`;
  const wantJson = req.query.format === 'json';
  const items = [];
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if ((e.type === 'user' || e.type === 'assistant') && e.message && e.isSidechain !== true) {
      // Khớp với panel hội thoại: chỉ text đọc-được, bỏ tool plumbing + wrapper lệnh
      const t = realText(e.message);
      if (t && !t.startsWith('<local-command') && !t.startsWith('<command-'))
        items.push({ role: e.type, ts: e.timestamp || null, text: t });
    }
  }
  if (wantJson) {
    res.set('Content-Disposition', disposition('json'));
    return res.json({ sessionId: req.params.id, title, messages: items });
  }
  const out = [`# ${title}\n`];
  for (const m of items) out.push(`\n## ${m.role === 'user' ? '🧑 User' : '🤖 Claude'}\n\n${m.text}`);
  res.set('Content-Type', 'text/markdown; charset=utf-8');
  if (req.query.download) res.set('Content-Disposition', disposition('md'));
  res.send(out.join('\n'));
});

// Cache nội dung file cho full-text search (key mtime -> chỉ đọc lại file đã đổi).
// ~vài chục MB RAM cho kho phiên lớn — chấp nhận được cho tool local.
const ftCache = new Map(); // path -> { mtime, raw, lower }
function cachedRead(path, mtime) {
  const hit = ftCache.get(path);
  if (hit && hit.mtime === mtime) return hit;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  const entry = { mtime, raw, lower: raw.toLowerCase() };
  ftCache.set(path, entry);
  return entry;
}

// Full-text search trong NỘI DUNG hội thoại của mọi phiên (mọi project hoặc 1 project)
app.get('/api/search-content', (req, res) => {
  const q = (req.query.q || '').toString().toLowerCase().trim();
  if (q.length < 2) return res.json({ results: [] });
  const scope = req.query.project || 'all';
  const names = loadNames();
  const sessions = listSessions({ scope });
  const results = [];
  for (const s of sessions) {
    const path = join(PROJECTS_ROOT, s.project, s.sessionId + '.jsonl');
    const entry = cachedRead(path, s.mtime);
    if (!entry) continue;
    if (!entry.lower.includes(q)) continue; // lọc thô nhanh trước khi parse
    const matches = [];
    for (const line of entry.raw.split('\n')) {
      if (matches.length >= 3) break;
      if (!line.trim()) continue;
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      if ((e.type !== 'user' && e.type !== 'assistant') || !e.message || e.isSidechain === true) continue;
      const t = realText(e.message);
      const i = t.toLowerCase().indexOf(q);
      if (i < 0) continue;
      const from = Math.max(0, i - 40);
      matches.push({
        uuid: e.uuid,
        role: e.type,
        snippet: (from > 0 ? '…' : '') + t.slice(from, i + q.length + 60).replace(/\s+/g, ' '),
      });
    }
    if (matches.length)
      results.push({
        sessionId: s.sessionId,
        project: s.project,
        title: names[s.sessionId] || s.title,
        cwd: s.cwd,
        matches,
      });
    if (results.length >= 30) break;
  }
  res.json({ results });
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

// projDir() throw có err.status -> trả lỗi gọn thay vì stack 500
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message });
});

const PORT = process.env.PORT || 4799;
// bind localhost-only: API đọc được toàn bộ lịch sử chat, không mở ra LAN
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`claude-tree chạy tại http://localhost:${PORT}`);
  const probe = spawnSync(CLAUDE_BIN, ['--version'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (probe.error || probe.status !== 0) {
    console.log('ℹ  `claude` CLI not found — the app runs fine (view / search / export work).');
    console.log('   Only Chat & Fork need it: https://docs.anthropic.com/en/docs/claude-code');
  } else {
    console.log(`   claude CLI: ${probe.stdout.trim()}`);
  }
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`⚠ Cổng ${PORT} đang bị chiếm. Chạy với cổng khác: PORT=5000 npm start`);
    process.exit(1);
  }
  throw e;
});
