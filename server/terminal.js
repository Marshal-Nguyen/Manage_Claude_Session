// Mở một cửa sổ terminal chạy lệnh (detached — sống độc lập với server).
// Ưu tiên env CLAUDE_TREE_TERMINAL, sau đó dò các emulator phổ biến.
import { spawn, spawnSync } from 'node:child_process';

const CANDIDATES = [
  { bin: 'kitty', args: (cwd, cmd) => ['--directory', cwd, ...cmd] },
  { bin: 'gnome-terminal', args: (cwd, cmd) => [`--working-directory=${cwd}`, '--', ...cmd] },
  { bin: 'konsole', args: (cwd, cmd) => ['--workdir', cwd, '-e', ...cmd] },
  { bin: 'alacritty', args: (cwd, cmd) => ['--working-directory', cwd, '-e', ...cmd] },
  { bin: 'wezterm', args: (cwd, cmd) => ['start', '--cwd', cwd, '--', ...cmd] },
  { bin: 'xterm', args: (_cwd, cmd) => ['-e', ...cmd] },
];

export function openInTerminal(cmd, cwd) {
  const pref = process.env.CLAUDE_TREE_TERMINAL;
  const list = pref ? [...CANDIDATES.filter((c) => c.bin === pref), ...CANDIDATES] : CANDIDATES;
  for (const c of list) {
    if (spawnSync('which', [c.bin], { stdio: 'ignore' }).status !== 0) continue;
    const child = spawn(c.bin, c.args(cwd, cmd), { cwd, detached: true, stdio: 'ignore' });
    child.unref();
    return c.bin;
  }
  const err = new Error(
    'Không tìm thấy terminal emulator (kitty/gnome-terminal/konsole/alacritty/wezterm/xterm). Đặt env CLAUDE_TREE_TERMINAL.',
  );
  err.status = 500;
  throw err;
}
