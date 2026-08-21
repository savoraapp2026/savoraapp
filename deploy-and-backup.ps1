# ============================================================
# 1) Deployt de site naar Cloudflare Pages
# 2) Maakt daarna een verse backup (mirror) naar D:\Savoraapp.com en E:\Savoraapp.com
# ============================================================

$ProjectPath = "C:\Savoraapp.com"

Write-Host "=== Deployen naar Cloudflare Pages ===" -ForegroundColor Cyan
Set-Location $ProjectPath
$wt = Join-Path $ProjectPath "wrangler.toml"
if (Test-Path $wt) { Rename-Item $wt "$wt.bak" -Force }
try {
    npx wrangler pages deploy public --project-name=savoraapp
} finally {
    if (Test-Path "$wt.bak") { Rename-Item "$wt.bak" $wt -Force }
}

Write-Host ""
Write-Host "=== Backup maken naar D: en E: ===" -ForegroundColor Cyan

$targets = @("D:\Savoraapp.com", "E:\Savoraapp.com")
$allOk = $true

foreach ($dest in $targets) {
    $drive = $dest.Substring(0,2)
    if (-not (Test-Path $drive)) {
        Write-Host "  Overgeslagen: $drive bestaat niet op dit systeem." -ForegroundColor Yellow
        continue
    }
    Write-Host "  Kopieren naar $dest ..." -ForegroundColor DarkGray
    robocopy $ProjectPath $dest /MIR /XD node_modules .git /R:2 /W:2 /NFL /NDL
    if ($LASTEXITCODE -le 7) {
        Write-Host "  OK: $dest is bijgewerkt." -ForegroundColor Green
    } else {
        Write-Host "  FOUT bij kopieren naar $dest (robocopy exit code $LASTEXITCODE)." -ForegroundColor Red
        $allOk = $false
    }
}

Write-Host ""
if ($allOk) {
    Write-Host "Klaar. Deploy + backups voltooid." -ForegroundColor Cyan
} else {
    Write-Host "Klaar, maar een of meer backups gaven een fout - controleer hierboven." -ForegroundColor Red
}