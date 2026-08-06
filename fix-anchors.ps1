# ============================================================
# Savoraapp - twee resterende problemen op partner.html:
#
# 1. De link "Si funksionon" / "How it works" (#flow) werkte
#    niet omdat er nergens een element met id="flow" bestond.
#    Dit script vindt de juiste sectie (de "Hoe het werkt"-
#    sectie, herkenbaar aan de tekst data-en="How it works")
#    en zet daar id="flow" op, zonder de andere sectie met
#    dezelfde CSS-classes per ongeluk te raken.
#
# 2. De header staat "fixed" (zwevend, 80px hoog). Na een
#    anker-sprong (#register, #flow, etc.) verdwijnt de kop
#    van de sectie half achter die header. Dit script voegt
#    een CSS-regel toe (scroll-margin-top) zodat elk anker-
#    doel altijd netjes onder de header landt.
# ============================================================

$ProjectPath = "C:\Savoraapp.com"
$PublicDir   = Join-Path $ProjectPath "public"
$stamp       = Get-Date -Format "yyyyMMdd-HHmmss"
$Utf8NoBom   = New-Object System.Text.UTF8Encoding($false)

function Backup-File($path) {
    if (Test-Path $path) {
        Copy-Item $path "$path.$stamp.bak" -Force
        Write-Host "  Backup: $path.$stamp.bak" -ForegroundColor DarkGray
    }
}

Write-Host "=== Stap 1: id=""flow"" toevoegen aan de juiste sectie ===" -ForegroundColor Cyan
$partnerFile = Join-Path $PublicDir "partner.html"

if (-not (Test-Path $partnerFile)) {
    Write-Host "NIET GEVONDEN: $partnerFile" -ForegroundColor Red
} else {
    $content = [System.IO.File]::ReadAllText($partnerFile, [System.Text.Encoding]::UTF8)

    if ($content -match 'id="flow"') {
        Write-Host "id=""flow"" bestaat al, niets te doen." -ForegroundColor Green
    } else {
        # Zoek de <section class="py-14 sm:py-20 bg-sav-light"> die
        # gevolgd wordt (voor de volgende <section>) door de tekst
        # die uniek is voor de "Hoe het werkt"-sectie.
        $pattern = '<section class="py-14 sm:py-20 bg-sav-light">(?=(?:(?!<section\b).)*?data-en="How it works" data-sq="Si funksionon")'
        $rx = New-Object System.Text.RegularExpressions.Regex($pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
        $matchCount = $rx.Matches($content).Count

        if ($matchCount -eq 1) {
            Backup-File $partnerFile
            $newContent = $rx.Replace($content, '<section id="flow" class="py-14 sm:py-20 bg-sav-light">')
            [System.IO.File]::WriteAllText($partnerFile, $newContent, $Utf8NoBom)
            Write-Host "id=""flow"" toegevoegd aan de juiste sectie." -ForegroundColor Green
        } elseif ($matchCount -eq 0) {
            Write-Host "Sectie niet gevonden - de pagina-structuur is anders dan verwacht. Handmatig controleren." -ForegroundColor Yellow
        } else {
            Write-Host "Meerdere ($matchCount) mogelijke secties gevonden - voor de zekerheid NIET automatisch aangepast. Stuur de pagina-broncode." -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "=== Stap 2: scroll-margin-top toevoegen aan styles.css ===" -ForegroundColor Cyan
$cssFile = Join-Path $PublicDir "css\styles.css"

if (-not (Test-Path $cssFile)) {
    Write-Host "NIET GEVONDEN: $cssFile" -ForegroundColor Red
} else {
    $cssContent = [System.IO.File]::ReadAllText($cssFile, [System.Text.Encoding]::UTF8)
    $marker = "SAVORA-ANCHOR-OFFSET-FIX"
    if ($cssContent.Contains($marker)) {
        Write-Host "CSS-fix staat er al, niets te doen." -ForegroundColor Green
    } else {
        Backup-File $cssFile
        $extra = "`n/* $marker - voorkomt dat ankerlinks (#register, #flow, ...) achter de vaste header landen */`n[id] { scroll-margin-top: 90px; }`n"
        [System.IO.File]::WriteAllText($cssFile, ($cssContent + $extra), $Utf8NoBom)
        Write-Host "scroll-margin-top toegevoegd aan styles.css." -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "=== Stap 3: deployen naar Cloudflare Pages ===" -ForegroundColor Cyan
Set-Location $ProjectPath
$wt = Join-Path $ProjectPath "wrangler.toml"
if (Test-Path $wt) { Rename-Item $wt "$wt.bak" -Force }
try {
    npx wrangler pages deploy public --project-name=savoraapp
} finally {
    if (Test-Path "$wt.bak") { Rename-Item "$wt.bak" $wt -Force }
}

Write-Host ""
Write-Host "Klaar. Test https://savoraapp.com/partner.html - klik op de partner-knop en op Si funksionon." -ForegroundColor Cyan