# ============================================================
# Fix: taalknop toont nu de HUIDIGE actieve taal (SQ/EN/IT)
# in plaats van de volgende taal - dat gaf verwarring omdat
# het label niet overeenkwam met wat er echt op het scherm stond.
# ============================================================

$ProjectPath = "C:\Savoraapp.com"
$PublicDir   = Join-Path $ProjectPath "public"
$target      = Join-Path $PublicDir "partner.html"
$stamp       = Get-Date -Format "yyyyMMdd-HHmmss"

if (-not (Test-Path $target)) {
    Write-Host "FOUT: partner.html niet gevonden op $target" -ForegroundColor Red
    exit 1
}

Copy-Item $target "$target.$stamp.bak" -Force
Write-Host "Backup gemaakt: partner.html.$stamp.bak" -ForegroundColor DarkGray

$c = [System.IO.File]::ReadAllText($target, [System.Text.Encoding]::UTF8)

$old = "if (lb) lb.textContent = (lang==='sq') ? 'EN' : (lang==='en') ? 'IT' : 'SQ';"
$new = "if (lb) lb.textContent = (lang==='sq') ? 'SQ' : (lang==='en') ? 'EN' : 'IT';"

$count = ([regex]::Matches($c, [regex]::Escape($old))).Count
if ($count -ne 1) {
    Write-Host "FOUT: verwachtte de regel exact 1 keer te vinden, maar vond hem $count keer. Niets gewijzigd." -ForegroundColor Red
    exit 1
}

$c2 = $c.Replace($old, $new)

# Ook de statische begintekst van de knop (voor JS laadt) op SQ zetten i.p.v. EN
# (robuuste regex, onafhankelijk van eventuele extra Cloudflare-attributen op de knop)
$c2 = [regex]::Replace($c2, '(id="langBtn"[^>]*>)EN(</button>)', '${1}SQ${2}')

[System.IO.File]::WriteAllText($target, $c2, (New-Object System.Text.UTF8Encoding($false)))

$check = [System.IO.File]::ReadAllText($target, [System.Text.Encoding]::UTF8)
$hasNew = $check.Contains($new)
$hasOld = $check.Contains($old)
Write-Host ""
Write-Host "Controle na wijziging:" -ForegroundColor Cyan
Write-Host "  Nieuwe label-logica aanwezig (verwacht True):  $hasNew"
Write-Host "  Oude label-logica nog aanwezig (verwacht False): $hasOld"
Write-Host ""

if (-not $hasNew -or $hasOld) {
    Write-Host "WAARSCHUWING: controle niet gehaald. NIET deployen." -ForegroundColor Red
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
Write-Host "Klaar. Test https://savoraapp.com/partner.html (Ctrl+Shift+R). De knop moet nu tonen: SQ (start) -> klik -> EN -> klik -> IT -> klik -> SQ, en de tekst op de pagina moet daar steeds mee overeenkomen." -ForegroundColor Cyan