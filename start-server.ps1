# Start My Alphabet Day (database + web server)
# Run this in PowerShell to start everything.

$mdb = "C:\mariadb"
$dataDir = "C:\mariadb\data"
$webRoot = "C:\web\alphabet"

# Start MariaDB if not running
if (-not (Get-Process -Name "mysqld" -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath "$mdb\bin\mysqld.exe" -ArgumentList "--defaults-file=$dataDir\my.ini" -WindowStyle Hidden
    Start-Sleep -Seconds 4
    Write-Host "MariaDB started."
} else {
    Write-Host "MariaDB already running."
}

# Start PHP server if not running
if (-not (Get-Process -Name "php" -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath "C:\php\php.exe" -ArgumentList "-S 127.0.0.1:8080 -t $webRoot" -WindowStyle Hidden
    Start-Sleep -Seconds 2
    Write-Host "PHP server started."
} else {
    Write-Host "PHP server already running."
}

Write-Host ""
Write-Host "Open in browser: http://127.0.0.1:8080/index.html"
Write-Host "phpMyAdmin: not available (use mysql CLI instead)"
Write-Host ""
Write-Host "To stop: Get-Process mysqld,php | Stop-Process"