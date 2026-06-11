# 🌳 Claude Tree

UI dạng cây node để **xem, rẽ nhánh (fork) và chat tiếp** các phiên Claude Code —
mỗi node là 1 lượt chat, fork từ bất kỳ điểm nào mà không làm loãng phiên gốc.

## Chạy

```bash
cd ~/claude-tree
# lần đầu: cd server && npm i ; cd ../web && npm i
./start.sh
# mở http://localhost:5174
```

Backend đọc trực tiếp các phiên ở `~/.claude/projects/-home-giang-nguyen/*.jsonl`.

## Hoạt động thế nào

- **treeBuilder** gộp mọi file `.jsonl` thành 1 cây theo `uuid`. Vì `--fork-session`
  copy nguyên prefix và **giữ nguyên uuid**, các nhánh tự merge tại điểm fork.
  Đã lọc sidechain (subagent) và tool plumbing để chỉ còn "lượt thật".
- **forker** fork tại 1 message bất kỳ: ghi file JSONL prefix `root→X` (giữ uuid,
  đổi `sessionId`) rồi `claude --resume` — đúng cơ chế native nhưng cắt được giữa hội thoại.
- **API** (Express) stream câu trả lời qua SSE bằng cách spawn
  `claude -p --output-format stream-json --include-partial-messages`.
- **Web** (React + React Flow + elkjs) vẽ cây, click node xem nội dung, nút
  **⑂ Fork từ đây** / **↳ Tiếp tục**, đổi tên / export / xóa, lưu layout vào localStorage.

## UI premium (GSAP + Lottie)

- Motion: **GSAP + @gsap/react** (`useGSAP`) — node pop-in stagger theo họ fork, panel slide-in,
  message stagger, composer scale-in, sidebar trượt vào. Đợi React Flow commit bằng double-rAF + `contextSafe`.
- Empty state: **lottie-web** chạy `src/tree-lottie.json` (cây tự vẽ nhánh, tự viết tay theo skill text-to-lottie).
- Theme: glassmorphism + aurora backdrop + Inter, định nghĩa trong `src/styles.css`.
- Skill đã cài ở `~/.claude/skills/`: 8 skill `gsap-*` (official GreenSock) + `text-to-lottie` (Diffusion Studio).

## Cấu trúc

```
server/  treeBuilder.js · forker.js · index.js   (API :4799)
web/     src/App.jsx · nodes.jsx · layout.js · api.js   (Vite :5174)
```
