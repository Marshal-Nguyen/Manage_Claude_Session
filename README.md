# 🌳 Claude Tree

**Fork your Claude Code sessions like git branches.**

📖 Đọc bằng [**Tiếng Việt** ↓](#-tiếng-việt)

Turn your Claude Code chat history into an interactive tree — click any session, fork from
any point, and keep chatting in a real terminal. The original session is never touched.

![Claude Tree](docs/screenshot.png)

## Quickstart

> Requires [Node.js ≥ 18](https://nodejs.org) and the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code).

```bash
git clone https://github.com/Marshal-Nguyen/Manage_Claude_Session.git claude-tree
cd claude-tree
npm run setup
npm start        # → http://localhost:4799
```

That's it. Your sessions appear automatically.

## What you can do

- ⑂ **Fork → Terminal** — click fork, a terminal opens on the new branch, chat with the full CLI
- 💬 **Fork from any message** — hover a message, hit ⑂, branch from that exact point
- 🔍 **Search everything** — full-text search across all your conversations
- 📖 **Read comfortably** — markdown rendering, tool noise filtered, parent history collapsed
- ⤓ **Export** — any session to Markdown or JSON

<details>
<summary><b>⚙️ Configuration</b></summary>

| Env var | Default | What it does |
|---|---|---|
| `PORT` | `4799` | App port |
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | Where Claude Code stores sessions |
| `CLAUDE_TREE_TERMINAL` | auto-detect | Force a terminal emulator (e.g. `kitty`) |

Dev mode with hot reload: `./start.sh` (Linux/macOS) — on Windows run
`node server/index.js` and `npm run dev --prefix web` in two terminals.
</details>

<details>
<summary><b>🔒 Is forking safe? Where does my data go?</b></summary>

Forking copies the conversation prefix into a **new** session file — exactly what Claude
Code's native `--fork-session` does. Your original session file is never modified.
Deleting a session moves it to `server/.trash/` (recoverable).

Everything runs **locally**: the server binds to `127.0.0.1` only, no data leaves your
machine. Chat/Fork spawn your own `claude` CLI and use your own API quota.
</details>

<details>
<summary><b>💻 Platforms & troubleshooting</b></summary>

| Platform | Status |
|---|---|
| Linux | ✅ Tested |
| macOS | 🟡 Implemented (Terminal.app) — testers welcome |
| Windows | 🟡 Implemented (Windows Terminal / cmd) — testers welcome |

- **"Cannot reach backend"** → run `npm start`, then retry.
- **Port in use** → `PORT=5000 npm start`.
- **Chat/Fork fails** → check `claude --version` works in your terminal.
- **First search is slow** → it indexes once, then it's fast.

Works down to phone-width screens (sidebar becomes a drawer ☰).
</details>

---

# 🇻🇳 Tiếng Việt

**Quản lý và phân nhánh các phiên chat Claude Code như nhánh Git.**

Bạn từng chat với Claude Code đến một đoạn muốn **thử nhiều hướng cùng lúc** — nhưng hỏi dồn
vào một phiên thì context loãng dần, mà mở phiên mới thì mất sạch ngữ cảnh đã xây? **Claude
Tree** biến toàn bộ lịch sử chat của bạn thành một **cây trực quan**: chọn phiên bất kỳ →
**fork** ra nhánh mới để đi tiếp → một **cửa sổ terminal mở ra** để bạn chat tiếp với đầy đủ
sức mạnh CLI. **Phiên gốc luôn nguyên vẹn**, mọi thứ chạy hoàn toàn trên máy bạn.

## Cài đặt (4 lệnh)

> Cần [Node.js ≥ 18](https://nodejs.org) và [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code).

```bash
git clone https://github.com/Marshal-Nguyen/Manage_Claude_Session.git claude-tree
cd claude-tree
npm run setup
npm start        # → http://localhost:4799
```

Xong. Các phiên chat của bạn hiện ra tự động.

## Làm được gì

- ⑂ **Fork → Terminal** — bấm fork, một terminal mở ra ngay trên nhánh mới, chat với đầy đủ CLI
- 💬 **Fork từ bất kỳ tin nhắn nào** — di chuột lên tin nhắn, bấm ⑂, tách nhánh từ đúng điểm đó
- 🔍 **Tìm kiếm mọi thứ** — tìm full-text xuyên suốt nội dung mọi cuộc hội thoại cũ
- 📖 **Đọc thoải mái** — render markdown, lọc nhiễu tool, gập gọn phần kế thừa từ phiên cha
- ⤓ **Xuất file** — bất kỳ phiên nào ra Markdown hoặc JSON
- 🌐 Đổi ngôn ngữ **VI / EN** ngay trong app (góc trên sidebar)

<details>
<summary><b>⚙️ Cấu hình</b></summary>

| Biến môi trường | Mặc định | Tác dụng |
|---|---|---|
| `PORT` | `4799` | Cổng chạy app |
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | Nơi Claude Code lưu các phiên |
| `CLAUDE_TREE_TERMINAL` | tự dò | Ép dùng một terminal cụ thể (vd `kitty`) |

Chế độ dev (tự reload khi sửa code): `./start.sh` (Linux/macOS) — trên Windows chạy
`node server/index.js` và `npm run dev --prefix web` ở hai cửa sổ terminal.
</details>

<details>
<summary><b>🔒 Fork có an toàn không? Dữ liệu của tôi đi đâu?</b></summary>

Fork sao chép phần đầu hội thoại vào một file phiên **mới** — đúng cơ chế `--fork-session`
gốc của Claude Code. File phiên gốc của bạn **không bao giờ bị sửa**. Xóa một phiên thì nó
được chuyển vào `server/.trash/` (khôi phục được).

Mọi thứ chạy **local**: server chỉ mở ở `127.0.0.1`, không có dữ liệu nào rời khỏi máy bạn.
Chat/Fork dùng chính `claude` CLI và quota API của bạn.
</details>

<details>
<summary><b>💻 Nền tảng & xử lý sự cố</b></summary>

| Nền tảng | Trạng thái |
|---|---|
| Linux | ✅ Đã test |
| macOS | 🟡 Đã viết (Terminal.app) — cần người test thêm |
| Windows | 🟡 Đã viết (Windows Terminal / cmd) — cần người test thêm |

- **"Không kết nối được backend"** → chạy `npm start` rồi thử lại.
- **Cổng đang bị chiếm** → `PORT=5000 npm start`.
- **Chat/Fork lỗi** → kiểm tra `claude --version` chạy được trong terminal.
- **Tìm kiếm lần đầu hơi chậm** → nó quét một lần rồi cache, sau đó nhanh.

Dùng được tới cỡ màn hình điện thoại (sidebar thu thành ngăn kéo ☰).
</details>

---

MIT © 2026 [Giang Nguyen](https://github.com/Marshal-Nguyen)
