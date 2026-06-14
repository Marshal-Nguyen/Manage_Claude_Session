#!/usr/bin/env bash
# macOS: tạo "Claude Tree.app" trong ~/Applications với icon riêng (Dock icon thật).
# Double-click file này một lần để cài. Gỡ: xóa ~/Applications/Claude Tree.app
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
APPDIR="$HOME/Applications/Claude Tree.app"
rm -rf "$APPDIR"
mkdir -p "$APPDIR/Contents/MacOS" "$APPDIR/Contents/Resources"
cp "$DIR/docs/icon.icns" "$APPDIR/Contents/Resources/icon.icns"

cat > "$APPDIR/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Claude Tree</string>
  <key>CFBundleDisplayName</key><string>Claude Tree</string>
  <key>CFBundleIdentifier</key><string>io.claudetree.app</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>claude-tree</string>
  <key>CFBundleIconFile</key><string>icon</string>
</dict></plist>
PLIST

cat > "$APPDIR/Contents/MacOS/claude-tree" <<LAUNCH
#!/usr/bin/env bash
exec "$DIR/scripts/claude-tree-app.command"
LAUNCH
chmod +x "$APPDIR/Contents/MacOS/claude-tree"
touch "$APPDIR"
echo "✓ Đã tạo: $APPDIR"
echo "  → Mở Launchpad/Applications tìm 'Claude Tree', hoặc kéo vào Dock."
