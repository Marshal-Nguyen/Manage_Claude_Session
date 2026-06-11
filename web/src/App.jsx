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
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import treeAnim from './tree-lottie.json';
import SessionNode from './nodes.jsx';
import { layout } from './layout.js';
import {
  getForest,
  getConversation,
  searchContent,
  rename,
  delSession,
  exportUrl,
  stream,
  openTerminal,
  forkTerminal,
} from './api.js';

gsap.registerPlugin(useGSAP);

const nodeTypes = { session: SessionNode };
const PALETTE = ['#5b8def', '#e0598b', '#3fb68b', '#e0a23f', '#9b7ede', '#48b5c4', '#d96f5e', '#7aa93f'];
const colorOf = (sid, map) => {
  if (!map.has(sid)) map.set(sid, PALETTE[map.size % PALETTE.length]);
  return map.get(sid);
};
const base = (p) => (p || '').split('/').filter(Boolean).pop() || p;

// ── i18n ──
const T = {
  vi: {
    allProjects: (n) => `Tất cả project (${n})`,
    searchPh: 'Tìm tiêu đề hoặc nội dung…',
    contentHits: (n) => `Trong nội dung hội thoại (${n})`,
    searching: 'Đang tìm trong nội dung…',
    noResult: 'Không tìm thấy phiên nào',
    legend: (n, hidden) => `${n} phiên · 🌳 gốc · ⑂ fork${hidden ? ` · ${hidden} phiên rác đã ẩn` : ''}`,
    branches: (n) => `${n} nhánh`,
    emptyTitle: 'Chọn một phiên để xem cây nhánh',
    emptySub: 'Fork từ bất kỳ phiên nào — phiên gốc luôn nguyên vẹn',
    loadingConv: 'Đang tải hội thoại…',
    emptyConv: '(phiên trống)',
    inherited: (n, shown) => `⑂ ${n} tin nhắn kế thừa từ phiên cha — ${shown ? 'ẩn đi' : 'bấm để xem'}`,
    older: (n) => `↑ Hiện ${n} tin cũ hơn`,
    turns: (n) => `${n} lượt`,
    you: '🧑 You',
    claude: '🤖 Claude',
    copy: 'Copy nội dung',
    copied: '✓ Đã copy',
    forkHere: 'Fork từ tin nhắn này',
    forkBtn: '⑂ Fork → Terminal',
    openTerm: '▸ Terminal',
    continueBtn: '⚡ Chat nhanh',
    termOpened: (term) => `Đã mở ${term} — chat bên đó xong quay lại đây, cây tự cập nhật`,
    renameBtn: '✎ Đặt tên',
    deleteBtn: '🗑 Xóa',
    exportMd: '⤓ MD',
    exportJson: '⤓ JSON',
    composerFork: (t) => `⑂ Fork nhánh mới từ "${t}"`,
    composerForkMsg: '⑂ Fork từ tin nhắn này',
    composerCont: (t) => `↳ Chat tiếp trong "${t}"`,
    composerPh: 'Nhập câu hỏi…',
    thinking: '⏳ Claude đang suy nghĩ…',
    hint: '⌘/Ctrl + Enter để gửi',
    send: 'Gửi',
    cancel: 'Hủy',
    running: 'Đang chạy…',
    renamePrompt: 'Tên phiên (để trống = quay về tên tự động):',
    renameConfirm: (t) => `Xóa tên tùy chỉnh "${t}" và quay về tên tự động?`,
    deleteConfirm: (t) => `Chuyển phiên "${t}" vào thùng rác?`,
    backendDown: 'Không kết nối được backend (:4799). Chạy ./start.sh rồi bấm thử lại.',
    retry: 'Thử lại',
    ago: { now: 'vừa xong', m: ' phút', h: ' giờ', d: ' ngày' },
  },
  en: {
    allProjects: (n) => `All projects (${n})`,
    searchPh: 'Search title or content…',
    contentHits: (n) => `In conversation content (${n})`,
    searching: 'Searching content…',
    noResult: 'No sessions found',
    legend: (n, hidden) => `${n} sessions · 🌳 root · ⑂ fork${hidden ? ` · ${hidden} junk hidden` : ''}`,
    branches: (n) => `${n} branches`,
    emptyTitle: 'Pick a session to view its branch tree',
    emptySub: 'Fork from any session — the original stays untouched',
    loadingConv: 'Loading conversation…',
    emptyConv: '(empty session)',
    inherited: (n, shown) => `⑂ ${n} messages inherited from parent — ${shown ? 'hide' : 'show'}`,
    older: (n) => `↑ Show ${n} older messages`,
    turns: (n) => `${n} turns`,
    you: '🧑 You',
    claude: '🤖 Claude',
    copy: 'Copy message',
    copied: '✓ Copied',
    forkHere: 'Fork from this message',
    forkBtn: '⑂ Fork → Terminal',
    openTerm: '▸ Terminal',
    continueBtn: '⚡ Quick chat',
    termOpened: (term) => `Opened ${term} — chat there, the tree refreshes when you come back`,
    renameBtn: '✎ Rename',
    deleteBtn: '🗑 Delete',
    exportMd: '⤓ MD',
    exportJson: '⤓ JSON',
    composerFork: (t) => `⑂ Fork new branch from "${t}"`,
    composerForkMsg: '⑂ Fork from this message',
    composerCont: (t) => `↳ Continue in "${t}"`,
    composerPh: 'Type your prompt…',
    thinking: '⏳ Claude is thinking…',
    hint: '⌘/Ctrl + Enter to send',
    send: 'Send',
    cancel: 'Cancel',
    running: 'Running…',
    renamePrompt: 'Session name (empty = revert to auto title):',
    renameConfirm: (t) => `Remove custom name "${t}" and revert to auto title?`,
    deleteConfirm: (t) => `Move session "${t}" to trash?`,
    backendDown: 'Cannot reach backend (:4799). Run ./start.sh then retry.',
    retry: 'Retry',
    ago: { now: 'now', m: 'm', h: 'h', d: 'd' },
  },
};

function ago(ms, t) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return t.ago.now;
  if (s < 3600) return Math.floor(s / 60) + t.ago.m;
  if (s < 86400) return Math.floor(s / 3600) + t.ago.h;
  return Math.floor(s / 86400) + t.ago.d;
}

// 1 bong bóng tin nhắn: markdown + hover actions (copy / fork-từ-đây / giờ)
function Msg({ m, inherited, t, onForkHere }) {
  const [copied, setCopied] = useState(false);
  const time = m.ts ? new Date(m.ts).toLocaleString() : '';
  const doCopy = () => {
    navigator.clipboard.writeText(m.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <div className={'msg ' + m.role + (inherited ? ' inherited' : '')}>
      <div className="msg-role" title={time}>
        {m.role === 'user' ? t.you : t.claude}
        {m.ts && <span className="msg-time"> · {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
      <div className="msg-text">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
      </div>
      <div className="msg-actions">
        <button className="mini" onClick={doCopy} title={t.copy}>{copied ? t.copied : '⧉'}</button>
        <button className="mini" onClick={() => onForkHere(m.uuid)} title={t.forkHere}>⑂</button>
      </div>
    </div>
  );
}

function EmptyState({ t }) {
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
        <div className="empty-title">{t.emptyTitle}</div>
        <div className="empty-sub">{t.emptySub}</div>
      </div>
    </div>
  );
}

const hashOf = (s) => (s ? `#/s/${s.project}/${s.sessionId}` : '#');

export default function App() {
  const [lang, setLang] = useState(() => localStorage.getItem('ct-lang') || 'vi');
  const t = T[lang];
  const [forest, setForest] = useState([]);
  const [error, setError] = useState(null);
  const [proj, setProj] = useState('all');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState(null); // kết quả search nội dung
  const [searching, setSearching] = useState(false);
  const [sel, setSel] = useState(null);
  const selRef = useRef(null);
  useEffect(() => {
    selRef.current = sel;
  }, [sel]);
  const [conv, setConv] = useState(null);
  const [showInherited, setShowInherited] = useState(false);
  const [note, setNote] = useState(null); // toast nhỏ (vd: đã mở terminal)
  const convRef = useRef(null);
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const [composer, setComposer] = useState(null);
  // bề rộng panel: kéo-thả được, lưu localStorage; mặc định 36% màn hình
  const [panelW, setPanelW] = useState(() => {
    const saved = Number(localStorage.getItem('ct-panel-w'));
    return saved >= 380 ? saved : Math.min(620, Math.max(440, Math.round(window.innerWidth * 0.36)));
  });
  const panelWRef = useRef(panelW);
  useEffect(() => {
    panelWRef.current = panelW;
  }, [panelW]);
  const startResize = (e) => {
    e.preventDefault();
    document.body.classList.add('resizing');
    const move = (ev) =>
      setPanelW(Math.min(Math.max(window.innerWidth - ev.clientX - 16, 380), window.innerWidth - 480));
    const up = () => {
      document.body.classList.remove('resizing');
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      localStorage.setItem('ct-panel-w', String(panelWRef.current));
      rfRef.current?.fitView({ padding: 0.3, maxZoom: 1, duration: 200 });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const colorMap = useRef(new Map());
  const rfRef = useRef(null);
  const appRef = useRef(null);
  const canvasRef = useRef(null);
  const panelRef = useRef(null);
  const composerRef = useRef(null);

  const setLanguage = (l) => {
    setLang(l);
    localStorage.setItem('ct-lang', l);
  };

  const loadForest = useCallback(async () => {
    try {
      const f = await getForest('all');
      setError(null);
      setForest(f.nodes || []);
      return f.nodes || [];
    } catch {
      setError(true);
      return [];
    }
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
    history.replaceState(null, '', hashOf(node));
    const c = await getConversation(node.sessionId, node.project, node.parent);
    setConv(c.messages || []);
  }, []);
  const closePanel = useCallback(() => {
    setSel(null);
    history.replaceState(null, '', '#');
  }, []);

  // deep-link: đọc hash khi forest sẵn sàng lần đầu (#/s/<project>/<sessionId>)
  const hashRestored = useRef(false);
  useEffect(() => {
    if (hashRestored.current || !forest.length) return;
    hashRestored.current = true;
    const m = location.hash.match(/^#\/s\/([^/]+)\/([0-9a-f-]+)$/);
    if (!m) return;
    const node = forest.find((n) => n.project === m[1] && n.sessionId === m[2]);
    if (node) selectSession(node);
  }, [forest, selectSession]);

  // search nội dung (debounce 350ms, từ 3 ký tự)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        // proj là cwd -> đổi sang tên thư mục project mà backend hiểu
        const scope = proj === 'all' ? 'all' : forest.find((s) => s.cwd === proj)?.project || 'all';
        const r = await searchContent(q, scope);
        setHits(r.results || []);
      } catch {
        setHits([]);
      }
      setSearching(false);
    }, 350);
    return () => clearTimeout(id);
  }, [query, proj]);

  // GSAP: sidebar trượt vào lần đầu
  useGSAP(
    () => {
      if (!forest.length) return;
      gsap.from('.root-item', { opacity: 0, x: -14, duration: 0.4, ease: 'power3.out', stagger: 0.012 });
    },
    { scope: appRef, dependencies: [forest.length > 0] },
  );

  // GSAP: node pop-in theo họ fork (đợi React Flow commit bằng double-rAF)
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

  // GSAP: panel + messages + composer
  useGSAP(
    () => {
      if (!panelRef.current) return;
      gsap.from(panelRef.current, { x: 36, opacity: 0, duration: 0.45, ease: 'power3.out' });
    },
    { dependencies: [sel?.sessionId] },
  );
  // chỉ animate ~15 tin cuối — hội thoại dài không cần (và không nên) tween hàng trăm node
  useGSAP(
    () => {
      const msgs = panelRef.current?.querySelectorAll('.msg');
      if (!msgs?.length) return;
      const subset = [...msgs].slice(-15);
      gsap.from(subset, { opacity: 0, y: 10, duration: 0.35, ease: 'power2.out', stagger: { amount: 0.25 } });
    },
    { dependencies: [conv] },
  );
  useGSAP(
    () => {
      if (!composerRef.current) return;
      gsap.from(composerRef.current, { scale: 0.94, y: 10, opacity: 0, duration: 0.35, ease: 'power3.out' });
    },
    { dependencies: [!!composer] },
  );

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
        turnsLabel: t.turns(n.turns) + (childCount[n.sessionId] ? ` · ⑂ ${childCount[n.sessionId]}` : ''),
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
  }, [forest, sel?.root, sel?.sessionId, childCount, t, setRfNodes, setRfEdges]);

  const onNodeClick = useCallback(
    (_e, node) => {
      const n = byId.get(node.id);
      if (n) selectSession(n);
    },
    [byId, selectSession],
  );

  // cuộn xuống tin mới nhất. Lặp vài nhịp vì content-visibility làm scrollHeight
  // chỉ là ước lượng lúc đầu, layout nở dần ra sau khi render thật.
  useEffect(() => {
    if (!conv) return;
    const bottom = () => {
      const el = convRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    bottom();
    const ids = [60, 180, 400, 800].map((ms) => setTimeout(bottom, ms));
    return () => ids.forEach(clearTimeout);
  }, [conv]);
  useEffect(() => {
    if (convRef.current) convRef.current.scrollTop = showInherited ? 0 : convRef.current.scrollHeight;
  }, [showInherited]);

  const inheritedMsgs = useMemo(() => (conv || []).filter((m) => m.inherited), [conv]);
  const ownMsgs = useMemo(() => (conv || []).filter((m) => !m.inherited), [conv]);

  // hiệu năng: chỉ render cửa sổ tin mới nhất, bấm nút mới nạp thêm tin cũ
  const [visOwn, setVisOwn] = useState(40);
  const [visInh, setVisInh] = useState(40);
  useEffect(() => {
    setVisOwn(40);
    setVisInh(40);
  }, [sel?.sessionId]);
  const ownShown = ownMsgs.slice(-visOwn);
  const inhShown = inheritedMsgs.slice(-visInh);
  // nạp thêm tin cũ mà không làm nhảy vị trí scroll
  const showOlder = (setter) => {
    const el = convRef.current;
    const keep = el ? el.scrollHeight - el.scrollTop : 0;
    setter((v) => v + 60);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - keep;
      }),
    );
  };

  // panel mở/đóng đổi bề rộng vùng vẽ -> refit
  const panelOpen = !!sel;
  useEffect(() => {
    const id = setTimeout(() => rfRef.current?.fitView({ padding: 0.3, maxZoom: 1, duration: 200 }), 240);
    return () => clearTimeout(id);
  }, [panelOpen]);

  // ESC: composer trước (nếu rảnh), rồi panel
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setComposer((c) => {
        if (c) return c.busy ? c : null;
        closePanel();
        return c;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePanel]);

  const toast = (msg) => {
    setNote(msg);
    setTimeout(() => setNote(null), 4500);
  };

  // quay lại cửa sổ webapp (sau khi chat ở terminal) -> tự refresh cây + hội thoại
  useEffect(() => {
    const onFocus = async () => {
      const nodes = await loadForest();
      const s = selRef.current;
      if (!s) return;
      const fresh = nodes.find((n) => n.sessionId === s.sessionId);
      if (fresh) setSel(fresh);
      const c = await getConversation(s.sessionId, s.project, s.parent);
      setConv((prev) => (prev && c.messages && c.messages.length === prev.length ? prev : c.messages || prev));
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadForest]);

  // fork (từ tip hoặc từ 1 tin nhắn) -> tạo nhánh + mở terminal thật
  const openFork = async (anchorUuid) => {
    const r = await forkTerminal({
      uuid: anchorUuid || sel.leaf,
      project: sel.project,
      cwd: sel.cwd,
      sessionId: sel.sessionId,
      title: sel.title,
    });
    if (r.error) toast('⚠ ' + r.error);
    else {
      toast(t.termOpened(r.terminal));
      setTimeout(loadForest, 2500);
    }
  };
  const doOpenTerminal = async () => {
    const r = await openTerminal(sel.sessionId, sel.cwd);
    if (r.error) toast('⚠ ' + r.error);
    else toast(t.termOpened(r.terminal));
  };

  const send = useCallback(async () => {
    if (!composer?.text.trim() || composer.busy) return;
    const path = composer.mode === 'fork' ? 'fork' : 'chat';
    const body =
      composer.mode === 'fork'
        ? { uuid: composer.anchor || sel.leaf, project: sel.project, cwd: sel.cwd, sessionId: sel.sessionId }
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
    const name = prompt(t.renamePrompt, sel.title);
    if (name === null) return;
    if (name.trim() === '' && !confirm(t.renameConfirm(sel.title))) return;
    await rename(sel.sessionId, name.trim());
    const nodes = await loadForest();
    setSel(nodes.find((n) => n.sessionId === sel.sessionId) || sel);
  };
  const doDelete = async () => {
    if (!confirm(t.deleteConfirm(sel.title))) return;
    await delSession(sel.sessionId, sel.project);
    closePanel();
    setConv(null);
    loadForest();
  };

  const cwds = useMemo(() => [...new Set(forest.map((s) => s.cwd))].filter(Boolean), [forest]);
  const inScope = forest.filter((s) => proj === 'all' || s.cwd === proj);
  const junk = inScope.filter((s) => s.title.trim() === '.').length;
  const shown = inScope
    .filter((s) => s.title.trim() !== '.')
    .filter((s) => !query || s.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.mtime - a.mtime);

  if (error)
    return (
      <div className="loading">
        <div className="err-box">
          <div>⚠ {t.backendDown}</div>
          <button className="btn primary" onClick={loadForest}>{t.retry}</button>
        </div>
      </div>
    );

  return (
    <div className="app" ref={appRef}>
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand">🌳 Claude Tree</div>
          <button className="lang" onClick={() => setLanguage(lang === 'vi' ? 'en' : 'vi')}>
            {lang === 'vi' ? 'EN' : 'VI'}
          </button>
        </div>
        <select className="search" value={proj} onChange={(e) => setProj(e.target.value)}>
          <option value="all">{t.allProjects(forest.length)}</option>
          {cwds.map((c) => (
            <option key={c} value={c}>
              {base(c)} ({forest.filter((s) => s.cwd === c).length})
            </option>
          ))}
        </select>
        <input className="search" placeholder={t.searchPh} value={query} onChange={(e) => setQuery(e.target.value)} />
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
                  {base(s.cwd)} · {ago(s.mtime, t)}
                  {childCount[s.sessionId] ? ` · ${t.branches(childCount[s.sessionId])}` : ''}
                </span>
              </span>
            </button>
          ))}
          {shown.length === 0 && !hits && <div className="muted pad">{t.noResult}</div>}
          {(searching || hits) && (
            <div className="hits">
              <div className="hits-head">{searching ? t.searching : t.contentHits(hits.length)}</div>
              {!searching &&
                hits.map((h) => (
                  <button
                    key={h.sessionId}
                    className="root-item hit"
                    onClick={() => {
                      const node = byId.get(h.sessionId);
                      if (node) selectSession(node);
                    }}
                  >
                    <span className="root-text">
                      <span className="root-label">{h.title}</span>
                      <span className="root-sub">{base(h.cwd)}</span>
                      {h.matches.slice(0, 2).map((m) => (
                        <span key={m.uuid} className="hit-snippet">
                          {m.snippet}
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
        <div className="legend">{t.legend(shown.length, junk)}</div>
      </aside>

      <main className="canvas" ref={canvasRef}>
        {!sel && <EmptyState t={t} />}
        <div className={'rf-wrap' + (sel ? ' with-panel' : '')} style={sel ? { right: panelW + 30 } : undefined}>
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
            <Background gap={22} color="#222a3a" />
            <MiniMap pannable zoomable nodeColor={(n) => n.data?.color || '#888'} maskColor="rgba(10,14,22,.7)" />
            <Controls />
          </ReactFlow>
        </div>
      </main>

      {sel && (
        <aside className="panel" ref={panelRef} style={{ width: panelW }}>
          <div className="panel-resizer" onMouseDown={startResize} title="Kéo để đổi cỡ" />
          <div className="panel-head">
            <span className="panel-title">{sel.parent ? '⑂ ' : '🌳 '}{sel.title}</span>
            <button className="x" onClick={closePanel}>✕</button>
          </div>
          <div className="conv" ref={convRef}>
            {conv === null && <div className="muted">{t.loadingConv}</div>}
            {conv && inheritedMsgs.length > 0 && (
              <button className="inherit-toggle" onClick={() => setShowInherited((v) => !v)}>
                {t.inherited(inheritedMsgs.length, showInherited)}
              </button>
            )}
            {conv && showInherited && inheritedMsgs.length > inhShown.length && (
              <button className="inherit-toggle" onClick={() => showOlder(setVisInh)}>
                {t.older(inheritedMsgs.length - inhShown.length)}
              </button>
            )}
            {conv && showInherited && inhShown.map((m) => <Msg key={m.uuid} m={m} inherited t={t} onForkHere={openFork} />)}
            {conv && ownMsgs.length > ownShown.length && (
              <button className="inherit-toggle" onClick={() => showOlder(setVisOwn)}>
                {t.older(ownMsgs.length - ownShown.length)}
              </button>
            )}
            {conv && ownShown.map((m) => <Msg key={m.uuid} m={m} t={t} onForkHere={openFork} />)}
            {conv && conv.length === 0 && <div className="muted">{t.emptyConv}</div>}
          </div>
          <div className="panel-actions">
            <button className="btn primary" onClick={() => openFork(null)}>{t.forkBtn}</button>
            <button className="btn" onClick={doOpenTerminal}>{t.openTerm}</button>
            <button className="btn" onClick={() => setComposer({ mode: 'continue', text: '' })}>{t.continueBtn}</button>
            <button className="btn" onClick={doRename}>{t.renameBtn}</button>
            <a className="btn" href={exportUrl(sel.sessionId, sel.project, sel.title)} target="_blank" rel="noreferrer">
              {t.exportMd}
            </a>
            <a className="btn" href={exportUrl(sel.sessionId, sel.project, sel.title, 'json')} target="_blank" rel="noreferrer">
              {t.exportJson}
            </a>
            <button className="btn danger" onClick={doDelete}>{t.deleteBtn}</button>
          </div>
        </aside>
      )}

      {note && <div className="toast">{note}</div>}

      {composer && (
        <div className="composer-overlay" onClick={(e) => e.target === e.currentTarget && !composer.busy && setComposer(null)}>
          <div className="composer" ref={composerRef}>
            <div className="composer-head">
              {composer.mode === 'fork'
                ? composer.anchor
                  ? t.composerForkMsg
                  : t.composerFork(sel.title)
                : t.composerCont(sel.title)}
            </div>
            {composer.busy && (
              <div className="composer-live">
                {composer.live || t.thinking}
                <span className="cursor">▌</span>
              </div>
            )}
            <textarea
              autoFocus
              placeholder={t.composerPh}
              value={composer.text}
              disabled={composer.busy}
              onChange={(e) => setComposer((c) => ({ ...c, text: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
              }}
            />
            <div className="composer-foot">
              <span className="hint">{t.hint}</span>
              <div>
                <button className="btn" disabled={composer.busy} onClick={() => setComposer(null)}>{t.cancel}</button>
                <button className="btn primary" disabled={composer.busy} onClick={send}>
                  {composer.busy ? t.running : t.send}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
