import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();
export const NODE_W = 240;
export const NODE_H = 66;

// Layout cây từ trên xuống (layered) bằng elkjs.
export async function layout(nodes, edges) {
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '30',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    },
    children: nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const res = await elk.layout(graph);
  const pos = {};
  for (const c of res.children) pos[c.id] = { x: c.x, y: c.y };
  return nodes.map((n) => ({ ...n, position: pos[n.id] || { x: 0, y: 0 } }));
}
