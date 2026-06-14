# Cài launcher Claude Tree cho Windows: tạo shortcut ở Desktop + Start Menu.
# Chạy: powershell -ExecutionPolicy Bypass -File scripts\install-launcher.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root 'scripts\claude-tree-app.cmd'

# Icon cây-fork riêng của app (.ico tạo sẵn trong docs/)
$icon = Join-Path $root 'docs\icon.ico'
if (-not (Test-Path $icon)) { $icon = $null }

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
