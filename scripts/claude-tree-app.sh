#!/usr/bin/env bash
# Launcher Claude Tree: đảm bảo server chạy rồi mở dạng app (cửa sổ riêng).
# Tự tìm thư mục dự án từ vị trí script -> chạy được dù clone ở đâu.
DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
PORT="${PORT:-4799}"
URL="http://localhost:${PORT}"
LOG="/tmp/claude-tree.log"
cd "$DIR" || exit 1

# 1. Server chưa chạy -> khởi động (detached, sống độc lập với launcher)
if ! curl -fsS "${URL}/" -o /dev/null 2>&1; then
  # Lần đầu chưa build -> setup (mở terminal cho thấy tiến trình)
  if [ ! -f web/dist/index.html ]; then
    if command -v kitty >/dev/null; then
      kitty --hold bash -lc "cd '$DIR' && npm run setup" &
      # đợi build xong (dist xuất hiện)
      for _ in $(seq 1 600); do [ -f web/dist/index.html ] && break; sleep 1; done
    else
      npm run setup
    fi
  fi
  PORT="$PORT" setsid nohup node server/index.js >"$LOG" 2>&1 </dev/null &
  # đợi server lên (tối đa ~12s)
  for _ in $(seq 1 48); do curl -fsS "${URL}/" -o /dev/null 2>&1 && break; sleep 0.25; done
fi

# 2. Mở dạng app (cửa sổ riêng, không thanh địa chỉ) — ưu tiên Chrome/Chromium
PROFILE="${HOME}/.config/claude-tree-app"
for BR in google-chrome google-chrome-stable chromium chromium-browser brave-browser; do
  if command -v "$BR" >/dev/null; then
    exec "$BR" --app="$URL" --user-data-dir="$PROFILE" --class=ClaudeTree --name=ClaudeTree --no-first-run --no-default-browser-check
  fi
done
# Fallback: mở bằng trình duyệt mặc định
exec xdg-open "$URL"
