// forker — fork tại 1 message uuid BẤT KỲ (không chỉ tip của phiên).
// Cơ chế: copy prefix theo thứ tự file (root..X), GIỮ NGUYÊN uuid, rewrite
// sessionId sang id mới — đúng như native --fork-session, nhưng cho phép cắt
// tại điểm giữa hội thoại. Vì prefix theo thứ tự thời gian, mọi parentUuid của
// dòng được copy luôn nằm trước nó -> không bao giờ dangling.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_PROJECT_DIR } from './treeBuilder.js';

// Tìm file (và các dòng) chứa message có .uuid === uuid.
// preferSession: thử file phiên đó TRƯỚC — message kế thừa nằm ở cả file cha
// lẫn file con, fork phải cắt từ phiên user đang xem.
function findSession(dir, uuid, preferSession) {
  const files = readdirSync(dir).filter((x) => x.endsWith('.jsonl'));
  if (preferSession) {
    const pf = `${preferSession}.jsonl`;
    const i = files.indexOf(pf);
    if (i > 0) {
      files.splice(i, 1);
      files.unshift(pf);
    }
  }
  for (const f of files) {
    const lines = readFileSync(join(dir, f), 'utf8').split('\n');
    for (const line of lines) {
      if (!line.includes(uuid)) continue;
      try {
        if (JSON.parse(line).uuid === uuid) return { file: f, lines };
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

export function forkAt(uuid, dir = DEFAULT_PROJECT_DIR, preferSession) {
  const found = findSession(dir, uuid, preferSession);
  if (!found) throw new Error(`Không tìm thấy message ${uuid}`);
  const { lines } = found;

  let cut = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    try {
      if (JSON.parse(lines[i]).uuid === uuid) {
        cut = i;
        break;
      }
    } catch {
      /* ignore */
    }
  }
  if (cut < 0) throw new Error('Không định vị được dòng cắt');

  const newId = randomUUID();
  const out = [];
  for (let i = 0; i <= cut; i++) {
    if (!lines[i].trim()) continue;
    let e;
    try {
      e = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (e.sessionId) e.sessionId = newId; // rewrite về phiên mới, giữ nguyên uuid
    out.push(JSON.stringify(e));
  }
  writeFileSync(join(dir, `${newId}.jsonl`), out.join('\n') + '\n');
  return { sessionId: newId, copiedLines: out.length };
}
