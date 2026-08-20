# ============================================================
# Herstelt partner.html vanuit de laatste SCHONE backup
# (van voor de S/E/P/< -corruptie die rond 15:45 vandaag ontstond)
# ============================================================

$ProjectPath = "C:\Savoraapp.com"
$PublicDir   = Join-Path $ProjectPath "public"
$target      = Join-Path $PublicDir "partner.html"
$goodBackup  = Join-Path $PublicDir "partner.html.20260820-151700.bak"
$stamp       = Get-Date -Format "yyyyMMdd-HHmmss"

if (-not (Test-Path $goodBackup)) {
    Write-Host "FOUT: schone backup niet gevonden op $goodBackup" -ForegroundColor Red
    exit 1
}

# Veiligheidskopie van de huidige (kapotte) versie
Copy-Item $target "$target.KAPOT-$stamp.bak" -Force
Write-Host "Kapotte versie apart bewaard als: partner.html.KAPOT-$stamp.bak" -ForegroundColor DarkGray

# Herstel de schone versie
Copy-Item $goodBackup $target -Force
Write-Host "partner.html hersteld vanuit partner.html.20260820-151700.bak" -ForegroundColor Green

# Verificatie
$content = [System.IO.File]::ReadAllText($target, [System.Text.Encoding]::UTF8)
$hasClean  = $content.Contains("getElementById")
$hasBroken = $content.Contains("get lementById")
$hasName   = $content.Contains("Savoraapp")
Write-Host ""
Write-Host "Controle na herstel:" -ForegroundColor Cyan
Write-Host "  getElementById aanwezig (moet TRUE zijn):  $hasClean"
Write-Host "  get lementById aanwezig (moet FALSE zijn):  $hasBroken"
Write-Host "  Savoraapp aanwezig (moet TRUE zijn):        $hasName"
Write-Host ""

if ($hasBroken -or -not $hasClean) {
    Write-Host "WAARSCHUWING: het herstelde bestand lijkt nog steeds problemen te hebben. NIET deployen." -ForegroundColor Red
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
Write-Host "Klaar. Test https://savoraapp.com/partner.html (Ctrl+Shift+R)." -ForegroundColor Cyan