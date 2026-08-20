# ============================================================
# Savoraapp - taalcorrecties + technische fixes (aug 2026)
# - Spelfouten/verbeteringen op index, partner, faq, terms
# - Paysera-verwijzingen verwijderd (wordt niet meer gebruikt)
# - "Karriera" footer-item verwijderd (pagina bestaat niet)
# - Lek -> Leke (met trema) op partner/faq
# Alle speciale tekens zijn hex-gecodeerd zodat dit script
# nooit encoding-schade kan veroorzaken.
#
# FIX (v2): de functienaam "H" botste met de ingebouwde
# PowerShell-afkorting "h" (= Get-History), waardoor alle
# hex-aanroepen naar Get-History gingen ipv naar onze eigen
# functie. Daarom nu hernoemd naar "DecodeHex".
#
# FIX (v3): $rx.Replace($c, $repl) op een Regex-object werd
# door PowerShell soms fout geinterpreteerd (probeerde $repl
# als MatchEvaluator-functie te lezen ipv als tekst), met rare
# "evaluator"-fouten tot gevolg. Nu vervangen door de statische
# [regex]::Replace(...) aanroep met expliciete [string]-cast,
# die dit probleem niet heeft.
# ============================================================

$ProjectPath = "C:\Savoraapp.com"
$PublicDir   = Join-Path $ProjectPath "public"
$stamp       = Get-Date -Format "yyyyMMdd-HHmmss"
$Utf8NoBom   = New-Object System.Text.UTF8Encoding($false)

function DecodeHex([string]$hex) {
    $bytes = New-Object byte[] ($hex.Length / 2)
    for ($i = 0; $i -lt $bytes.Length; $i++) {
        $bytes[$i] = [Convert]::ToByte($hex.Substring($i * 2, 2), 16)
    }
    [System.Text.Encoding]::UTF8.GetString($bytes)
}

$Leke = DecodeHex '4c656bc3ab'

function Fix-File {
    param([string]$name, [array]$pairs, [array]$regexes, [bool]$lekFix)
    $path = Join-Path $PublicDir $name
    if (-not (Test-Path $path)) { Write-Host "OVERGESLAGEN (niet gevonden): $name" -ForegroundColor Yellow; return }
    $c = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    $orig = $c
    foreach ($p in $pairs) {
        $old = $p[0]; $new = $p[1]; $label = $p[2]
        if ($c.Contains($old)) {
            $c = $c.Replace($old, $new)
            Write-Host ("  [OK]  {0}: {1}" -f $name, $label) -ForegroundColor Green
        } else {
            Write-Host ("  [--]  {0}: {1} (niet gevonden)" -f $name, $label) -ForegroundColor DarkYellow
        }
    }
    foreach ($r in $regexes) {
        $pattern = [string]$r[0]; $repl = [string]$r[1]; $label = $r[2]
        $opts = [System.Text.RegularExpressions.RegexOptions]::Singleline
        $n = [System.Text.RegularExpressions.Regex]::Matches($c, $pattern, $opts).Count
        if ($n -gt 0) {
            $c = [System.Text.RegularExpressions.Regex]::Replace($c, $pattern, $repl, $opts)
            Write-Host ("  [OK]  {0}: {1} ({2}x)" -f $name, $label, $n) -ForegroundColor Green
        } else {
            Write-Host ("  [--]  {0}: {1} (niet gevonden)" -f $name, $label) -ForegroundColor DarkYellow
        }
    }
    if ($lekFix) {
        $lekPattern = '\bLek\b'
        $n = [System.Text.RegularExpressions.Regex]::Matches($c, $lekPattern).Count
        if ($n -gt 0) {
            $c = [System.Text.RegularExpressions.Regex]::Replace($c, $lekPattern, [string]$Leke)
            Write-Host ("  [OK]  {0}: Lek -> Leke ({1}x)" -f $name, $n) -ForegroundColor Green
        }
    }
    if ($c -ne $orig) {
        Copy-Item $path "$path.$stamp.bak" -Force
        [System.IO.File]::WriteAllText($path, $c, $Utf8NoBom)
        Write-Host ("  OPGESLAGEN: {0} (backup: .{1}.bak)" -f $name, $stamp) -ForegroundColor Cyan
    } else {
        Write-Host ("  Geen wijzigingen in {0}" -f $name) -ForegroundColor DarkGray
    }
    Write-Host ""
}

$rxPayseraAnchor = '<a\b(?:(?!</a>).)*?[Pp]aysera(?:(?!</a>).)*?</a>'
$rxKarrieraLi    = '<li>(?:(?!</li>).)*?Karriera(?:(?!</li>).)*?</li>'
$rxPayseraLi     = '<li>(?:(?!</li>).)*?Paysera(?:(?!</li>).)*?</li>'

Write-Host "=== index.html ===" -ForegroundColor Cyan
Fix-File 'index.html' @(
   @((DecodeHex '46757272612042756bc3ab73'),(DecodeHex '467572726120652062756bc3ab73'),'Furra e bukes')
  ,@((DecodeHex '4d62c3ab73687465746e69204c6f6b616c6574'),(DecodeHex '4d62c3ab73687465746e692076656e6461736974'),'Mbeshtetni vendasit')
  ,@((DecodeHex '536870656a742026616d703b20452054686a65736874c3ab'),(DecodeHex '4520736870656a74c3ab2026616d703b20452074686a65736874c3ab'),'E shpejte + E thjeshte (amp)')
  ,@((DecodeHex '536870656a74202620452054686a65736874c3ab'),(DecodeHex '4520736870656a74c3ab202620452074686a65736874c3ab'),'E shpejte + E thjeshte')
  ,@((DecodeHex '41706c696b6f20736920506172746e6572'),(DecodeHex '41706c696b6f6e692070c3ab72207427752062c3ab72c3ab20706172746e6572'),'Aplikoni per tu bere partner')
  ,@((DecodeHex '73697374656d692069206b726564697665'),(DecodeHex '73697374656d692069206b7265646974657665'),'sistemi i krediteve')
  ,@((DecodeHex '70616b657461206b726564697368'),(DecodeHex '70616b657461206b7265646974657368'),'paketa kreditesh')
  ,@((DecodeHex '616e756c6f'),(DecodeHex '616e756c6c6f'),'anulo -> anullo')
  ,@((DecodeHex '416e756c6f'),(DecodeHex '416e756c6c6f'),'Anulo -> Anullo')
  ,@((DecodeHex '616e756c696d'),(DecodeHex '616e756c6c696d'),'anulim -> anullim')
  ,@((DecodeHex '416e756c696d'),(DecodeHex '416e756c6c696d'),'Anulim -> Anullim')
) @(
   @($rxKarrieraLi, '', 'Karriera footer-item verwijderd')
  ,@($rxPayseraAnchor, '', 'Paysera-link verwijderd')
) $false

Write-Host "=== partner.html ===" -ForegroundColor Cyan
Fix-File 'partner.html' @(
   @((DecodeHex '536870656a742c2074686a657368742c2070612073696b6c6574'),(DecodeHex '4520736870656a74c3ab2c20652074686a65736874c3ab2c2070612073696b6c6574'),'E shpejte, e thjeshte, pa siklet')
  ,@((DecodeHex '4120c3ab736874c3ab2065207369677572742075736871696d693f'),(DecodeHex '4120c3ab736874c3ab2069207369677572742075736871696d693f'),'i sigurt ushqimi')
  ,@((DecodeHex '616e756c6f'),(DecodeHex '616e756c6c6f'),'anulo -> anullo')
  ,@((DecodeHex '416e756c6f'),(DecodeHex '416e756c6c6f'),'Anulo -> Anullo')
  ,@((DecodeHex '616e756c696d'),(DecodeHex '616e756c6c696d'),'anulim -> anullim')
  ,@((DecodeHex '416e756c696d'),(DecodeHex '416e756c6c696d'),'Anulim -> Anullim')
) @(
   @($rxPayseraAnchor, '', 'Paysera-link verwijderd')
) $true

Write-Host "=== faq.html ===" -ForegroundColor Cyan
Fix-File 'faq.html' @(
   @('kuti surprize me ushqim te freskete nga dyqane','kuti surprize me ushqime te fresketa nga dyqane','ushqime te fresketa (intro)')
  ,@('Ti shpeton ushqim qe perndryshe do te hidhej.','Ne kete menyre ruan ushqimin qe perndryshe do te hidhej.','Ne kete menyre ruan ushqimin')
  ,@('4. Shijo ushqim te freskete me nje pjese te vogel te cmimit!','4. Ushqime te fresketa per nje pjese te vogel te cmimit!','Ushqime te fresketa (stap 4)')
  ,@('Cdo kuti permban ushqim te freskete qe dyqanit i ka tepruar - buke,','Cdo kuti permban ushqime te fresketa, qe i kane tepruar dyqanit - buke,','Cdo kuti permban ushqime te fresketa')
  ,@('Sa shpejt mund te jem aktiv?','Sa shpejt mund te jeni aktiv?','te jeni aktiv')
  ,@('Pas verifikimit te regjistrimit tend, mund te postosh menjehere oferta dhe te fillosh te marresh kliente.','Pas verifikimit te regjistrimit tuaj, mund te postoni menjehere oferta dhe te filloni te merrni kliente.','antwoord in u-vorm')
  ,@('Si funksionon sistemi i kredive?','Si funksionon sistemi i krediteve?','sistemi i krediteve')
  ,@('Blen paketa kredish:','Blen paketa kreditesh:','paketa kreditesh')
  ,@('Pagesat behen ne menyre te sigurte permes Paysera.','Pagesat behen ne menyre te sigurte.','Paysera-vermelding weg')
  ,@('anulo','anullo','anulo -> anullo')
  ,@('Anulo','Anullo','Anulo -> Anullo')
  ,@('anulim','anullim','anulim -> anullim')
  ,@('Anulim','Anullim','Anulim -> Anullim')
) @(
   @($rxPayseraAnchor, '', 'Paysera-link verwijderd')
) $true

Write-Host "=== terms-of-service.html ===" -ForegroundColor Cyan
Fix-File 'terms-of-service.html' @(
   @('Pagesat perpunohen ne menyre te sigurte permes Paysera.','Pagesat perpunohen ne menyre te sigurte.','Paysera-vermelding weg')
  ,@('por rekomandohet te kaloje nga nje avokat perpara se ta konsideroni perfundimtare ligjerisht.','por rekomandohet kalimi nga nje avokat perpara se ta konsideroni perfundimisht nga ana ligjore.','avokat-zin verbeterd')
  ,@('anulo','anullo','anulo -> anullo')
  ,@('anulim','anullim','anulim -> anullim')
) @(
   @($rxPayseraAnchor, '', 'Paysera-link verwijderd')
) $true

Write-Host "=== cookie-policy.html ===" -ForegroundColor Cyan
Fix-File 'cookie-policy.html' @() @(
   @($rxPayseraLi, '', 'Paysera-lijstitem verwijderd')
  ,@($rxPayseraAnchor, '', 'Paysera-link verwijderd')
) $false

Write-Host "=== contact.html ===" -ForegroundColor Cyan
Fix-File 'contact.html' @() @(
   @($rxPayseraAnchor, '', 'Paysera-link verwijderd')
) $false

Write-Host "=== rreth-nesh.html (indien aanwezig) ===" -ForegroundColor Cyan
Fix-File 'rreth-nesh.html' @() @(
   @($rxPayseraAnchor, '', 'Paysera-link verwijderd')
) $false

Write-Host "=== deals.html (indien aanwezig) ===" -ForegroundColor Cyan
Fix-File 'deals.html' @(
   @((DecodeHex '616e756c6f'),(DecodeHex '616e756c6c6f'),'anulo -> anullo')
  ,@((DecodeHex '616e756c696d'),(DecodeHex '616e756c6c696d'),'anulim -> anullim')
) @(
   @($rxPayseraAnchor, '', 'Paysera-link verwijderd')
) $false

Write-Host "=== Deployen naar Cloudflare Pages ===" -ForegroundColor Cyan
Set-Location $ProjectPath
$wt = Join-Path $ProjectPath "wrangler.toml"
if (Test-Path $wt) { Rename-Item $wt "$wt.bak" -Force }
try {
    npx wrangler pages deploy public --project-name=savoraapp
} finally {
    if (Test-Path "$wt.bak") { Rename-Item "$wt.bak" $wt -Force }
}
Write-Host "Klaar. Controleer savoraapp.com (index, partner, faq, terms)." -ForegroundColor Cyan