#!/usr/bin/env bash
# Cài launcher Claude Tree vào menu ứng dụng (GNOME/KDE/XFCE...).
# Bấm icon = khởi động server (nếu chưa chạy) + mở app. Gỡ: xóa file .desktop.
set -e
DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
APPS="$HOME/.local/share/applications"
mkdir -p "$APPS"
chmod +x "$DIR/scripts/claude-tree-app.sh"

DESKTOP="$APPS/claude-tree.desktop"
cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Claude Tree
GenericName=Claude Code session manager
Comment=Fork & manage your Claude Code sessions
Exec=$DIR/scripts/claude-tree-app.sh
Icon=$DIR/docs/icon.svg
Terminal=false
Categories=Development;
StartupWMClass=ClaudeTree
Keywords=claude;ai;chat;fork;session;tree;
EOF
chmod +x "$DESKTOP"
command -v update-desktop-database >/dev/null && update-desktop-database "$APPS" 2>/dev/null || true

echo "✓ Đã cài 'Claude Tree' vào menu ứng dụng:"
echo "    $DESKTOP"
echo "  → Mở menu app, tìm 'Claude Tree', bấm để chạy (có thể ghim vào dock)."
echo "  → Gỡ cài: rm '$DESKTOP'"
