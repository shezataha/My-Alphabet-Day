# Copies the game into the web root so it runs at http://127.0.0.1:8080/
$src = $PSScriptRoot
if (-not $src) { $src = 'C:\Users\Shiza\Documents\Default Project' }
$dest = 'C:\web\alphabet'

New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($f in @('index.html', 'style.css', 'data.js', 'game.js', 'api.php')) {
  Copy-Item -Path (Join-Path $src $f) -Destination (Join-Path $dest $f) -Force
}
Write-Output "Deployed to $dest - open http://127.0.0.1:8080/index.html"
Write-Output "Make sure MariaDB and PHP server are running (start-server.ps1)"