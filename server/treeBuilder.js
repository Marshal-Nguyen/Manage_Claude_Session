// treeBuilder — quét mọi *.jsonl của 1 project Claude Code và dựng 1 DAG global
// theo message uuid. Vì fork copy nguyên prefix và GIỮ NGUYÊN uuid, các nhánh
// tự merge tại điểm fork: 1 message thuộc >1 phiên = đã bị fork đi tiếp.
//
// Mặc định trả "cây lượt thật" (cleanTurns): bỏ subagent sidechain và các entry
// chỉ chứa tool plumbing, rồi co chuỗi để mỗi node = 1 user prompt hoặc 1 câu
// trả lời text của assistant. Dùng { cleanTurns:false } để lấy DAG thô đầy đủ.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Cho phép trỏ kho phiên khác qua env (mặc định: chuẩn Claude Code)
export const PROJECTS_ROOT = process.env.CLAUDE_PROJECTS_DIR || join(homedir(), '.claude/projects');
// Chỉ dùng cho CLI debug của treeBuilder; mọi API endpoint yêu cầu ?project tường minh
export const DEFAULT_PROJECT_DIR = join(PROJECTS_ROOT, '-home-giang-nguyen');

// Danh sách PHIÊN trung thực như `claude --resume`: 1 dòng = 1 file .jsonl
// tầng trên cùng (subagents/workflows nằm trong subdir nên tự bị loại).
// Tên ưu tiên: aiTitle (entry type "ai-title") -> câu user đầu -> id. Sắp mới nhất.
export function listSessions({ scope = 'all' } = {}) {
  // Thư mục project = thư mục chứa file .jsonl. KHÔNG lọc theo tên bắt đầu '-'
  // (chỉ đúng Linux/macOS; trên Windows thư mục là "C--Users-..." -> bị loại nhầm).
  const hasJsonl = (name) => {
    try {
      return readdirSync(join(PROJECTS_ROOT, name)).some((f) => f.endsWith('.jsonl'));
    } catch {
      return false;
    }
  };
  let projects;
  try {
    projects =
      scope === 'all'
        ? readdirSync(PROJECTS_ROOT, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name)
            .filter(hasJsonl)
        : [scope];
  } catch {
    projects = []; // PROJECTS_ROOT không tồn tại (chưa dùng Claude Code bao giờ)
  }
  const out = [];
  for (const proj of projects) {
    const dir = join(PROJECTS_ROOT, proj);
    let files;
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const file of files) {
      const path = join(dir, file);
      let mtime = 0;
      try {
        mtime = statSync(path).mtimeMs;
      } catch {
        continue;
      }
      let aiTitle = null;
      let firstUser = null;
      let cwd = null;
      let turns = 0;
      let lines;
      try {
        lines = readFileSync(path, 'utf8').split('\n').slice(0, 200);
      } catch {
        continue;
      }
      for (const line of lines) {
        if (!line.trim()) continue;
        let e;
        try {
          e = JSON.parse(line);
        } catch {
          continue;
        }
        if (e.type === 'ai-title' && e.aiTitle) aiTitle = e.aiTitle;
        if (!cwd && e.cwd) cwd = e.cwd;
        if ((e.type === 'user' || e.type === 'assistant') && e.message) {
          turns++;
          if (!firstUser && e.type === 'user' && e.isSidechain !== true) {
            const c = e.message.content;
            const t =
              typeof c === 'string'
                ? c
                : Array.isArray(c)
                  ? c.find((b) => b.type === 'text')?.text || ''
                  : '';
            if (t.trim() && !t.startsWith('<')) firstUser = t.trim().slice(0, 90);
          }
        }
      }
      if (!aiTitle && !firstUser) continue; // bỏ phiên rỗng / không có hội thoại
      out.push({
        sessionId: file.replace(/\.jsonl$/, ''),
        project: proj,
        cwd: cwd || '',
        title: aiTitle || firstUser || file.slice(0, 8),
        aiTitle,
        turns,
        mtime,
      });
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

// Chỉ lấy text người-đọc-được; bỏ tool_use/tool_result plumbing
export function realText(message) {
  const c = message?.content;
  if (typeof c === 'string') return c.trim();
  if (Array.isArray(c))
    return c
      .filter((b) => b.type === 'text' && b.text?.trim())
      .map((b) => b.text.trim())
      .join('\n\n');
  return '';
}

// Tin "đếm được" trong panel: có text thật và không phải wrapper lệnh local
export function isRealTurn(message) {
  const t = realText(message);
  return !!t && !t.startsWith('<local-command') && !t.startsWith('<command-');
}

// Phân loại 1 message: lấy snippet + có phải "lượt thật" (có text người đọc được)
function classify(message) {
  const c = message?.content;
  if (typeof c === 'string') {
    const s = c.trim();
    return { snippet: s.slice(0, 100), keep: s.length > 0 };
  }
  if (Array.isArray(c)) {
    const t = c.find((b) => b.type === 'text' && b.text?.trim());
    if (t) return { snippet: t.text.trim().slice(0, 100), keep: true };
    const tu = c.find((b) => b.type === 'tool_use');
    if (tu) return { snippet: `[tool: ${tu.name}]`, keep: false };
    if (c.some((b) => b.type === 'tool_result')) return { snippet: '[tool_result]', keep: false };
  }
  return { snippet: '', keep: false };
}

export function buildTree(dir = DEFAULT_PROJECT_DIR, { cleanTurns = true } = {}) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  // raw: mọi message entry (user/assistant), gộp theo uuid
  const raw = new Map(); // uuid -> { uuid, parentUuid, role, ts, snippet, sessions:Set, sidechain, keep }
  // parentOf: uuid -> parentUuid cho MỌI loại entry (kể cả attachment/summary/meta)
  // để walk chuỗi cha xuyên qua chúng, không bị đứt giả.
  const parentOf = new Map();

  for (const file of files) {
    const sid = file.replace(/\.jsonl$/, '');
    let text;
    try {
      text = readFileSync(join(dir, file), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      if (e.uuid && !parentOf.has(e.uuid)) parentOf.set(e.uuid, e.parentUuid ?? null);
      if ((e.type !== 'user' && e.type !== 'assistant') || !e.uuid || !e.message) continue;
      let n = raw.get(e.uuid);
      if (!n) {
        const { snippet, keep } = classify(e.message);
        n = {
          uuid: e.uuid,
          parentUuid: e.parentUuid ?? null,
          role: e.type,
          ts: e.timestamp || '',
          snippet,
          sessions: new Set(),
          sidechain: e.isSidechain === true,
          keep,
        };
        raw.set(e.uuid, n);
      }
      n.sessions.add(sid);
      if (!n.parentUuid && e.parentUuid) n.parentUuid = e.parentUuid;
    }
  }

  // Tập node hiển thị
  const display = new Map();
  const isKept = (n) => (cleanTurns ? n.keep && !n.sidechain : true);
  for (const n of raw.values()) if (isKept(n)) display.set(n.uuid, n);

  // Tổ tiên-được-giữ gần nhất: walk parentOf (mọi loại entry), bỏ qua
  // attachment/summary/tool/sidechain, chỉ dừng khi hết chuỗi thật.
  const nearestKept = (uuid) => {
    let p = parentOf.get(uuid);
    while (p) {
      if (display.has(p)) return p;
      if (!parentOf.has(p)) return null; // cha trỏ tới uuid không có trong data -> gốc thật
      p = parentOf.get(p);
    }
    return null;
  };

  const children = new Map(); // displayParent -> [childUuid]
  const nodes = new Map();
  for (const n of display.values()) {
    const dp = nearestKept(n.uuid);
    nodes.set(n.uuid, { ...n, displayParent: dp });
    if (dp) {
      if (!children.has(dp)) children.set(dp, []);
      children.get(dp).push(n.uuid);
    }
  }

  const roots = [...nodes.values()].filter((n) => !n.displayParent).map((n) => n.uuid);
  const branchPoints = [...children.entries()].filter(([, c]) => c.length >= 2).map(([u]) => u);

  return { nodes, children, roots, branchPoints, fileCount: files.length };
}

// buildForest — CÂY SESSION (1 node = 1 phiên/nhánh, không phải 1 lượt).
// Quan hệ fork: phiên fork copy & chia sẻ message uuid với phiên gốc. Cha của S
// = phiên CŨ HƠN chia sẻ NHIỀU uuid nhất với S. root = lần theo cha lên đỉnh.
export function buildForest({ scope = 'all' } = {}) {
  const meta = listSessions({ scope });
  const info = new Map();
  const uuidSessions = new Map(); // uuid -> Set(sessionId)

  for (const m of meta) {
    const path = join(PROJECTS_ROOT, m.project, m.sessionId + '.jsonl');
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    // Tuổi phiên = file mtime. KHÔNG dùng timestamp message đầu vì fork copy
    // nguyên timestamp gốc -> sẽ bằng phiên cha, không phân biệt được cha/con.
    // uuids giữ MỌI message (tín hiệu so khớp fork); realTurns chỉ đếm tin thật
    // để khớp với số tin panel hiển thị.
    const uuids = [];
    let leaf = null;
    let realTurns = 0;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      if ((e.type === 'user' || e.type === 'assistant') && e.uuid && e.message && e.isSidechain !== true) {
        uuids.push(e.uuid);
        leaf = e.uuid;
        if (isRealTurn(e.message)) realTurns++;
        if (!uuidSessions.has(e.uuid)) uuidSessions.set(e.uuid, new Set());
        uuidSessions.get(e.uuid).add(m.sessionId);
      }
    }
    info.set(m.sessionId, { ...m, uuids, leaf, firstTs: m.mtime, turns: realTurns });
  }

  for (const s of info.values()) {
    const overlap = new Map();
    for (const u of s.uuids) {
      const holders = uuidSessions.get(u);
      if (!holders || holders.size < 2) continue;
      for (const h of holders) if (h !== s.sessionId) overlap.set(h, (overlap.get(h) || 0) + 1);
    }
    let parent = null;
    let bestC = 0;
    let bestTs = Infinity;
    for (const [h, c] of overlap) {
      const hi = info.get(h);
      if (!hi || hi.firstTs >= s.firstTs) continue; // chỉ phiên cũ hơn mới là cha
      if (c > bestC || (c === bestC && hi.firstTs < bestTs)) {
        bestC = c;
        bestTs = hi.firstTs;
        parent = h;
      }
    }
    s.parent = parent;
  }

  const rootOf = (sid) => {
    let cur = sid;
    const seen = new Set();
    while (info.get(cur)?.parent && !seen.has(cur)) {
      seen.add(cur);
      cur = info.get(cur).parent;
    }
    return cur;
  };

  const nodes = [...info.values()].map((s) => ({
    sessionId: s.sessionId,
    project: s.project,
    cwd: s.cwd,
    title: s.title,
    turns: s.turns,
    leaf: s.leaf,
    mtime: s.mtime,
    parent: s.parent,
    root: rootOf(s.sessionId),
  }));
  return { nodes };
}

// JSON-serializable (Set -> Array) cho API
export function serializeTree(t) {
  return {
    fileCount: t.fileCount,
    roots: t.roots,
    branchPoints: t.branchPoints,
    nodes: [...t.nodes.values()].map((n) => ({
      uuid: n.uuid,
      parentUuid: n.displayParent ?? null,
      role: n.role,
      ts: n.ts,
      snippet: n.snippet,
      sessions: [...n.sessions],
    })),
    edges: [...t.children.entries()].flatMap(([p, cs]) => cs.map((c) => ({ from: p, to: c }))),
  };
}

// CLI: chạy trực tiếp để kiểm chứng trên data thật
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t = buildTree(process.argv[2]);
  const shared = [...t.nodes.values()].filter((n) => n.sessions.size > 1);
  console.log(
    `Files: ${t.fileCount} | Lượt thật: ${t.nodes.size} | Roots(hội thoại): ${t.roots.length} | Điểm rẽ nhánh: ${t.branchPoints.length}`,
  );
  console.log(`Lượt thuộc >1 phiên (điểm fork thật): ${shared.length}`);
  const short = (u) => u.slice(0, 8);
  for (const bp of t.branchPoints.slice(0, 8)) {
    const n = t.nodes.get(bp);
    console.log(`\n◆ ${n.role}: "${n.snippet}"  [${short(bp)}]`);
    const kids = t.children.get(bp);
    kids.forEach((c, i) => {
      const k = t.nodes.get(c);
      const tick = i === kids.length - 1 ? '└─' : '├─';
      console.log(`  ${tick} ${k.role}: "${k.snippet}"  (phiên: ${[...k.sessions].map(short).join(',')})`);
    });
  }
}
