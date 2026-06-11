# 🌳 Claude Tree

**Fork your Claude Code sessions like git branches.**

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

🇻🇳 *Biến lịch sử chat Claude Code thành cây phân nhánh: chọn phiên → fork → terminal mở ra
chat tiếp, phiên gốc nguyên vẹn. Cài bằng 4 lệnh ở trên, đổi ngôn ngữ VI/EN ngay trong app.*

MIT © 2026 [Giang Nguyen](https://github.com/Marshal-Nguyen)
