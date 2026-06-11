// Mở một cửa sổ terminal chạy lệnh (detached — sống độc lập với server).
// Linux: dò emulator phổ biến (ưu tiên env CLAUDE_TREE_TERMINAL).
// macOS: Terminal.app qua osascript. Windows: Windows Terminal (wt) -> cmd start.
import { spawn, spawnSync } from 'node:child_process';

const LINUX_CANDIDATES = [
  { bin: 'kitty', args: (cwd, cmd) => ['--directory', cwd, ...cmd] },
  { bin: 'gnome-terminal', args: (cwd, cmd) => [`--working-directory=${cwd}`, '--', ...cmd] },
  { bin: 'konsole', args: (cwd, cmd) => ['--workdir', cwd, '-e', ...cmd] },
  { bin: 'alacritty', args: (cwd, cmd) => ['--working-directory', cwd, '-e', ...cmd] },
  { bin: 'wezterm', args: (cwd, cmd) => ['start', '--cwd', cwd, '--', ...cmd] },
  { bin: 'xterm', args: (_cwd, cmd) => ['-e', ...cmd] },
];

const exists = (bin) =>
  spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' }).status === 0;

const detach = (bin, args, cwd) => {
  const child = spawn(bin, args, { cwd, detached: true, stdio: 'ignore' });
  child.unref();
  return bin;
};

// escape cho chuỗi trong AppleScript
const aesc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export function openInTerminal(cmd, cwd) {
  if (process.platform === 'darwin') {
    const line = `cd ${JSON.stringify(cwd)} && ${cmd.join(' ')}`;
    return detach('osascript', ['-e', `tell application "Terminal" to do script "${aesc(line)}"`, '-e', 'tell application "Terminal" to activate'], cwd);
  }
  if (process.platform === 'win32') {
    if (exists('wt')) return detach('wt', ['-d', cwd, 'cmd', '/k', ...cmd], cwd);
    return detach('cmd', ['/c', 'start', 'cmd', '/k', ...cmd], cwd);
  }
  const pref = process.env.CLAUDE_TREE_TERMINAL;
  const list = pref ? [...LINUX_CANDIDATES.filter((c) => c.bin === pref), ...LINUX_CANDIDATES] : LINUX_CANDIDATES;
  for (const c of list) {
    if (!exists(c.bin)) continue;
    return detach(c.bin, c.args(cwd, cmd), cwd);
  }
  const err = new Error(
    'Không tìm thấy terminal emulator (kitty/gnome-terminal/konsole/alacritty/wezterm/xterm). Đặt env CLAUDE_TREE_TERMINAL.',
  );
  err.status = 500;
  throw err;
}
