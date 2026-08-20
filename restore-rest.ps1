# ============================================================
# Herstelt index.html vanuit de laatste SCHONE backup, en
# deployt daarna alles (inclusief de al herstelde terms-of-
# service.html, cookie-policy.html en contact.html).
# ============================================================

$ProjectPath = "C:\Savoraapp.com"
$PublicDir   = Join-Path $ProjectPath "public"
$target      = Join-Path $PublicDir "index.html"
$goodBackup  = Join-Path $PublicDir "index.html.20260820-154505.bak"
$stamp       = Get-Date -Format "yyyyMMdd-HHmmss"

if (-not (Test-Path $goodBackup)) {
    Write-Host "FOUT: schone backup niet gevonden op $goodBackup" -ForegroundColor Red
    exit 1
}

Copy-Item $target "$target.KAPOT-$stamp.bak" -Force
Write-Host "Kapotte versie bewaard als: index.html.KAPOT-$stamp.bak" -ForegroundColor DarkGray

Copy-Item $goodBackup $target -Force
Write-Host "index.html hersteld vanuit index.html.20260820-154505.bak" -ForegroundColor Green

$content = [System.IO.File]::ReadAllText($target, [System.Text.Encoding]::UTF8)
$ok = $content.Contains("<!DOCTYPE")
Write-Host ""
Write-Host "Controle: bevat <!DOCTYPE (moet TRUE zijn): $ok" -ForegroundColor Cyan
Write-Host ""

if (-not $ok) {
    Write-Host "WAARSCHUWING: nog steeds problemen. NIET deployen." -ForegroundColor Red
    exit 1
}

Write-Host "=== Deployen naar Cloudflare Pages ===" -ForegroundColor Cyan
Set-Location $ProjectPath
$wt = Join-Path $ProjectPath "wrangler.toml"
if (Test-Path $wt) { Rename-Item $wt "$wt.bak" -Force }
try {
    npx wrangler pages deploy public --project-name=savoraapp
} finally {
    if (Test-Path "$wt.bak") { Rename-Item "$wt.bak" $wt -Force }
}
Write-Host "Klaar. Controleer savoraapp.com (index, terms, cookie-policy, contact)." -ForegroundColor Cyan