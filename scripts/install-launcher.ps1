# Cài launcher Claude Tree cho Windows: tạo shortcut ở Desktop + Start Menu.
# Chạy: powershell -ExecutionPolicy Bypass -File scripts\install-launcher.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root 'scripts\claude-tree-app.cmd'

# Icon: dùng chrome.exe nếu có (Windows shortcut cần .ico/.exe, không nhận .svg)
$icon = $null
foreach ($p in @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe")) {
  if (Test-Path $p) { $icon = $p; break }
}

$ws = New-Object -ComObject WScript.Shell
$locations = @(
  [Environment]::GetFolderPath('Desktop'),
  (Join-Path $env:AppData 'Microsoft\Windows\Start Menu\Programs')
)
foreach ($dir in $locations) {
  $lnk = $ws.CreateShortcut((Join-Path $dir 'Claude Tree.lnk'))
  $lnk.TargetPath = $target
  $lnk.WorkingDirectory = $root
  $lnk.Description = 'Fork & manage your Claude Code sessions'
  $lnk.WindowStyle = 7  # chạy minimized (server cửa sổ con tự ẩn)
  if ($icon) { $lnk.IconLocation = $icon }
  $lnk.Save()
  Write-Host "OK: $($lnk.FullName)"
}
Write-Host "Da cai 'Claude Tree' vao Desktop + Start Menu. Bam de chay."
