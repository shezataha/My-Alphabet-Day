# Builds "My Alphabet Day.html" — one fully offline file for any device.
# Re-run this script after editing index.html, style.css, data.js or game.js.
$root = $PSScriptRoot
if (-not $root) { $root = 'C:\Users\Shiza\Documents\Default Project' }

$html = Get-Content -Raw -Encoding UTF8 -Path (Join-Path $root 'index.html')
$css  = Get-Content -Raw -Encoding UTF8 -Path (Join-Path $root 'style.css')
$data = Get-Content -Raw -Encoding UTF8 -Path (Join-Path $root 'data.js')
$game = Get-Content -Raw -Encoding UTF8 -Path (Join-Path $root 'game.js')

$html = $html.Replace('<link rel="stylesheet" href="style.css">', "<style>`r`n$css`r`n</style>")
$html = $html.Replace('<script src="data.js"></script>',           "<script>`r`n$data`r`n</script>")
$html = $html.Replace('<script src="game.js"></script>',           "<script>`r`n$game`r`n</script>")

if ($html -match 'href="style.css"|src="data.js"|src="game.js"') {
  Write-Error 'Build failed: a source tag was not replaced.'
  exit 1
}

$out = Join-Path $root 'My Alphabet Day.html'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($out, $html, $utf8NoBom)
Write-Output "Built: $out ($([math]::Round((Get-Item $out).Length / 1kb, 1)) KB)"
