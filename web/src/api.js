export const getForest = (scope = 'all') =>
  fetch('/api/forest?project=' + encodeURIComponent(scope)).then((r) => r.json());
export const getConversation = (id, project, parent) => {
  const q = new URLSearchParams();
  if (project) q.set('project', project);
  if (parent) q.set('parent', parent);
  const qs = q.toString();
  return fetch('/api/conversation/' + id + (qs ? '?' + qs : '')).then((r) => r.json());
};
export const rename = (sessionId, name) =>
  fetch('/api/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, name }),
  }).then((r) => r.json());
export const delSession = (id, project) =>
  fetch('/api/session/' + id + (project ? '?project=' + encodeURIComponent(project) : ''), {
    method: 'DELETE',
  }).then((r) => r.json());
export const exportUrl = (id, project) =>
  '/api/export/' + id + (project ? '?project=' + encodeURIComponent(project) : '');

// SSE over fetch POST. path = 'chat' | 'fork'. body có thể kèm project/cwd.
export async function stream(path, body, onEvent) {
  const res = await fetch('/api/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let ev = 'message';
      let data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) ev = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) {
        try {
          onEvent(ev, JSON.parse(data));
        } catch {
          /* ignore */
        }
      }
    }
  }
}
