#!/usr/bin/env bash
# Launcher Claude Tree cho macOS — double-click trong Finder để chạy.
# (Có thể kéo vào Dock; hoặc dùng Automator "Run Shell Script" bọc thành .app.)
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-4799}"
URL="http://localhost:${PORT}"
LOG="/tmp/claude-tree.log"
cd "$DIR" || exit 1

# 1. Server chưa chạy -> khởi động (detached)
if ! curl -fsS "${URL}/" -o /dev/null 2>&1; then
  [ -f web/dist/index.html ] || npm run setup
  PORT="$PORT" nohup node server/index.js >"$LOG" 2>&1 </dev/null &
  for _ in $(seq 1 48); do curl -fsS "${URL}/" -o /dev/null 2>&1 && break; sleep 0.25; done
fi

# 2. Mở dạng app (cửa sổ riêng) — Chrome/Chromium app-mode, fallback trình duyệt mặc định
PROFILE="${HOME}/.config/claude-tree-app"
for APP in "Google Chrome" "Chromium" "Brave Browser"; do
  if [ -d "/Applications/${APP}.app" ]; then
    exec open -na "${APP}" --args --app="$URL" --user-data-dir="$PROFILE" --class=ClaudeTree
  fi
done
exec open "$URL"
