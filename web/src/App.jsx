import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useNodesInitialized,
} from '@xyflow/react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import lottie from 'lottie-web';
import treeAnim from './tree-lottie.json';
import SessionNode from './nodes.jsx';
import { layout } from './layout.js';
import { getForest, getConversation, rename, delSession, exportUrl, stream } from './api.js';

gsap.registerPlugin(useGSAP);

const nodeTypes = { session: SessionNode };

// Empty state: cây Lottie tự vẽ nhánh (loop)
function EmptyState() {
  const ref = useRef(null);
  useEffect(() => {
    const anim = lottie.loadAnimation({
      container: ref.current,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: treeAnim,
    });
    return () => anim.destroy();
  }, []);
  return (
    <div className="empty">
      <div className="empty-inner">
        <div className="empty-lottie" ref={ref} />
        <div className="empty-title">Chọn một phiên để xem cây nhánh</div>
        <div className="empty-sub">Fork từ bất kỳ phiên nào — phiên gốc luôn nguyên vẹn</div>
      </div>
    </div>
  );
}

// Tự fit canvas khi cây đổi (đợi elk layout đo xong node mới fit).
function AutoFit({ dep }) {
  const { fitView } = useReactFlow();
  const inited = useNodesInitialized();
  useEffect(() => {
    if (inited) fitView({ padding: 0.3, maxZoom: 1, duration: 250 });
  }, [inited, dep, fitView]);
  return null;
}
const PALETTE = ['#5b8def', '#e0598b', '#3fb68b', '#e0a23f', '#9b7ede', '#48b5c4', '#d96f5e', '#7aa93f'];
const colorOf = (sid, map) => {
  if (!map.has(sid)) map.set(sid, PALETTE[map.size % PALETTE.length]);
  return map.get(sid);
};
const base = (p) => (p || '').split('/').filter(Boolean).pop() || p;
function ago(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'vừa xong';
  if (s < 3600) return Math.floor(s / 60) + ' phút';
  if (s < 86400) return Math.floor(s / 3600) + ' giờ';
  return Math.floor(s / 86400) + ' ngày';
}

export default function App() {
  const [forest, setForest] = useState([]);
  const [proj, setProj] = useState('all');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(null);
  const [conv, setConv] = useState(null);
  const [showInherited, setShowInherited] = useState(false);
  const convRef = useRef(null);
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const [composer, setComposer] = useState(null);
  const colorMap = useRef(new Map());
  const rfRef = useRef(null);
  const appRef = useRef(null);
  const canvasRef = useRef(null);
  const panelRef = useRef(null);
  const composerRef = useRef(null);

  // sidebar items trượt vào khi load lần đầu
  useGSAP(
    () => {
      if (!forest.length) return;
      gsap.from('.root-item', { opacity: 0, x: -14, duration: 0.4, ease: 'power3.out', stagger: 0.012 });
    },
    { scope: appRef, dependencies: [forest.length > 0] },
  );

  // node session pop-in stagger khi đổi họ fork (không replay khi kéo node).
  // React Flow mount node sau 1 frame -> đợi double-rAF rồi animate (contextSafe để cleanup đúng).
  const animKey = (sel?.root || '') + ':' + rfNodes.length;
  useGSAP(
    (_ctx, contextSafe) => {
      if (!rfNodes.length) return;
      const run = contextSafe(() => {
        const cards = canvasRef.current?.querySelectorAll('.snode');
        if (!cards?.length) return;
        gsap.from(cards, { opacity: 0, y: 18, scale: 0.92, duration: 0.5, ease: 'power3.out', stagger: 0.08 });
        const paths = canvasRef.current?.querySelectorAll('.react-flow__edge-path');
        if (paths?.length) gsap.from(paths, { opacity: 0, duration: 0.6, ease: 'power2.out', delay: 0.25 });
      });
      const id = requestAnimationFrame(() => requestAnimationFrame(run));
      return () => cancelAnimationFrame(id);
    },
    { scope: canvasRef, dependencies: [animKey] },
  );

  // panel trượt vào khi đổi phiên
  useGSAP(
    () => {
      if (!panelRef.current) return;
      gsap.from(panelRef.current, { x: 36, opacity: 0, duration: 0.45, ease: 'power3.out' });
    },
    { dependencies: [sel?.sessionId] },
  );

  // tin nhắn hội thoại stagger khi nạp xong (amount = tổng thời gian, không phình theo số message)
  useGSAP(
    () => {
      const msgs = panelRef.current?.querySelectorAll('.msg');
      if (!msgs?.length) return;
      gsap.from(msgs, { opacity: 0, y: 10, duration: 0.35, ease: 'power2.out', stagger: { amount: 0.35 } });
    },
    { dependencies: [conv] },
  );

  // hội thoại nạp xong -> cuộn xuống cuối (tin mới nhất), không bắt user kéo
  useEffect(() => {
    if (conv && convRef.current) convRef.current.scrollTop = convRef.current.scrollHeight;
  }, [conv]);
  // mở phần kế thừa -> cuộn lên đầu để đọc; ẩn -> về cuối
  useEffect(() => {
    if (convRef.current) convRef.current.scrollTop = showInherited ? 0 : convRef.current.scrollHeight;
  }, [showInherited]);

  const inheritedMsgs = useMemo(() => (conv || []).filter((m) => m.inherited), [conv]);
  const ownMsgs = useMemo(() => (conv || []).filter((m) => !m.inherited), [conv]);

  // composer scale-in
  useGSAP(
    () => {
      if (!composerRef.current) return;
      gsap.from(composerRef.current, { scale: 0.94, y: 10, opacity: 0, duration: 0.35, ease: 'power3.out' });
    },
    { dependencies: [!!composer] },
  );

  const loadForest = useCallback(async () => {
    const f = await getForest('all');
    setForest(f.nodes || []);
    return f.nodes || [];
  }, []);
  useEffect(() => {
    loadForest();
  }, [loadForest]);

  const byId = useMemo(() => new Map(forest.map((n) => [n.sessionId, n])), [forest]);
  const childCount = useMemo(() => {
    const c = {};
    for (const n of forest) if (n.parent) c[n.parent] = (c[n.parent] || 0) + 1;
    return c;
  }, [forest]);

  const selectSession = useCallback(async (node) => {
    setSel(node);
    setConv(null);
    setShowInherited(false);
    const c = await getConversation(node.sessionId, node.project, node.parent);
    setConv(c.messages || []);
  }, []);

  // layout HỌ fork của phiên đang chọn
  useEffect(() => {
    if (!sel || !forest.length) {
      setRfNodes([]);
      setRfEdges([]);
      return;
    }
    const fam = forest.filter((n) => n.root === sel.root);
    const nodes = fam.map((n) => ({
      id: n.sessionId,
      type: 'session',
      position: { x: 0, y: 0 },
      selected: n.sessionId === sel.sessionId,
      data: {
        title: n.title,
        turns: n.turns,
        forks: childCount[n.sessionId] || 0,
        isRoot: !n.parent,
        color: colorOf(n.root, colorMap.current),
      },
    }));
    const edges = fam
      .filter((n) => n.parent)
      .map((n) => ({ id: n.parent + '>' + n.sessionId, source: n.parent, target: n.sessionId }));
    layout(nodes, edges).then((laid) => {
      setRfNodes(laid);
      setRfEdges(edges);
      setTimeout(() => rfRef.current?.fitView({ padding: 0.3, maxZoom: 1, duration: 250 }), 130);
    });
  }, [forest, sel?.root, sel?.sessionId, childCount, setRfNodes, setRfEdges]);

  const onNodeClick = useCallback(
    (_e, node) => {
      const n = byId.get(node.id);
      if (n) selectSession(n);
    },
    [byId, selectSession],
  );

  const send = useCallback(async () => {
    if (!composer?.text.trim() || composer.busy) return;
    const path = composer.mode === 'fork' ? 'fork' : 'chat';
    const body =
      composer.mode === 'fork'
        ? { uuid: sel.leaf, project: sel.project, cwd: sel.cwd }
        : { sessionId: sel.sessionId, cwd: sel.cwd };
    body.prompt = composer.text;
    setComposer((c) => ({ ...c, busy: true, live: '' }));
    let newSid = sel.sessionId;
    await stream(path, body, (ev, data) => {
      if (ev === 'delta') setComposer((c) => ({ ...c, live: (c.live || '') + data.text }));
      else if (data.sessionId) newSid = data.sessionId;
    });
    const nodes = await loadForest();
    const target = nodes.find((n) => n.sessionId === newSid) || nodes.find((n) => n.sessionId === sel.sessionId);
    setComposer(null);
    if (target) selectSession(target);
  }, [composer, sel, loadForest, selectSession]);

  const doRename = async () => {
    const name = prompt('Tên phiên:', sel.title);
    if (name === null) return;
    await rename(sel.sessionId, name);
    const nodes = await loadForest();
    setSel(nodes.find((n) => n.sessionId === sel.sessionId) || sel);
  };
  const doDelete = async () => {
    if (!confirm('Chuyển phiên "' + sel.title + '" vào thùng rác?')) return;
    await delSession(sel.sessionId, sel.project);
    setSel(null);
    setConv(null);
    loadForest();
  };

  const cwds = useMemo(() => [...new Set(forest.map((s) => s.cwd))].filter(Boolean), [forest]);
  const shown = forest
    .filter((s) => proj === 'all' || s.cwd === proj)
    .filter((s) => !query || s.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.mtime - a.mtime);

  return (
    <div className="app" ref={appRef}>
      <aside className="sidebar">
        <div className="brand">🌳 Claude Tree</div>
        <select className="search" value={proj} onChange={(e) => setProj(e.target.value)}>
          <option value="all">Tất cả project ({forest.length})</option>
          {cwds.map((c) => (
            <option key={c} value={c}>
              {base(c)} ({forest.filter((s) => s.cwd === c).length})
            </option>
          ))}
        </select>
        <input className="search" placeholder="Tìm phiên…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="root-list">
          {shown.map((s) => (
            <button
              key={s.sessionId}
              className={'root-item' + (sel?.sessionId === s.sessionId ? ' active' : '')}
              onClick={() => selectSession(s)}
              title={s.cwd}
            >
              <span className="root-dot" style={{ background: colorOf(s.root, colorMap.current) }} />
              <span className="root-text">
                <span className="root-label">
                  {s.parent ? '⑂ ' : ''}
                  {s.title}
                </span>
                <span className="root-sub">
                  {base(s.cwd)} · {ago(s.mtime)}
                  {childCount[s.sessionId] ? ` · ${childCount[s.sessionId]} nhánh` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="legend">{shown.length} phiên · 🌳 gốc · ⑂ nhánh fork</div>
      </aside>

      <main className="canvas" ref={canvasRef}>
        {!sel && <EmptyState />}
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onInit={(inst) => (rfRef.current = inst)}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <AutoFit dep={(sel?.root || '') + ':' + rfNodes.length} />
          <Background gap={22} color="#222a3a" />
          <MiniMap pannable zoomable nodeColor={(n) => n.data?.color || '#888'} maskColor="rgba(10,14,22,.7)" />
          <Controls />
        </ReactFlow>
      </main>

      {sel && (
        <aside className="panel" ref={panelRef}>
          <div className="panel-head">
            <span className="panel-title">{sel.parent ? '⑂ ' : '🌳 '}{sel.title}</span>
            <button className="x" onClick={() => setSel(null)}>✕</button>
          </div>
          <div className="conv" ref={convRef}>
            {conv === null && <div className="muted">Đang tải hội thoại…</div>}
            {conv && inheritedMsgs.length > 0 && (
              <button className="inherit-toggle" onClick={() => setShowInherited((v) => !v)}>
                ⑂ {inheritedMsgs.length} tin nhắn kế thừa từ phiên cha — {showInherited ? 'ẩn đi' : 'bấm để xem'}
              </button>
            )}
            {conv &&
              showInherited &&
              inheritedMsgs.map((m) => (
                <div key={m.uuid} className={'msg inherited ' + m.role}>
                  <div className="msg-role">{m.role === 'user' ? '🧑 You' : '🤖 Claude'}</div>
                  <div className="msg-text">{m.text}</div>
                </div>
              ))}
            {conv &&
              ownMsgs.map((m) => (
                <div key={m.uuid} className={'msg ' + m.role}>
                  <div className="msg-role">{m.role === 'user' ? '🧑 You' : '🤖 Claude'}</div>
                  <div className="msg-text">{m.text}</div>
                </div>
              ))}
            {conv && conv.length === 0 && <div className="muted">(phiên trống)</div>}
          </div>
          <div className="panel-actions">
            <button className="btn primary" onClick={() => setComposer({ mode: 'fork', text: '' })}>
              ⑂ Fork nhánh mới
            </button>
            <button className="btn" onClick={() => setComposer({ mode: 'continue', text: '' })}>↳ Chat tiếp</button>
            <button className="btn" onClick={doRename}>✎ Đặt tên</button>
            <a className="btn" href={exportUrl(sel.sessionId, sel.project)} target="_blank" rel="noreferrer">⤓ Export</a>
            <button className="btn danger" onClick={doDelete}>🗑 Xóa</button>
          </div>
        </aside>
      )}

      {composer && (
        <div className="composer-overlay" onClick={(e) => e.target === e.currentTarget && !composer.busy && setComposer(null)}>
          <div className="composer" ref={composerRef}>
            <div className="composer-head">
              {composer.mode === 'fork' ? `⑂ Fork nhánh mới từ "${sel.title}"` : `↳ Chat tiếp trong "${sel.title}"`}
            </div>
            {composer.busy && <div className="composer-live">{composer.live || '…'}<span className="cursor">▌</span></div>}
            <textarea
              autoFocus
              placeholder="Nhập câu hỏi…"
              value={composer.text}
              disabled={composer.busy}
              onChange={(e) => setComposer((c) => ({ ...c, text: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
              }}
            />
            <div className="composer-foot">
              <span className="hint">⌘/Ctrl + Enter để gửi</span>
              <div>
                <button className="btn" disabled={composer.busy} onClick={() => setComposer(null)}>Hủy</button>
                <button className="btn primary" disabled={composer.busy} onClick={send}>
                  {composer.busy ? 'Đang chạy…' : 'Gửi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
