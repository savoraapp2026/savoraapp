# ============================================================
# Fix: werkt de SQ/EN taal-toggle JS in partner.html bij naar
# SQ/EN/IT (3-weg cyclus). De Italiaanse data-it attributen staan
# al goed in het bestand (vorige run) - dit script raakt ALLEEN
# de <script> functies aan, zoekt het blok dynamisch op (telt
# accolades) zodat het werkt ongeacht regeleindes/insprong.
# ============================================================

function FindMatchingBrace($text, $openIdx) {
    $depth = 0
    for ($i = $openIdx; $i -lt $text.Length; $i++) {
        $ch = $text[$i]
        if ($ch -eq '{') { $depth++ }
        elseif ($ch -eq '}') {
            $depth--
            if ($depth -eq 0) { return $i }
        }
    }
    return -1
}

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

$aIdx = $c.IndexOf("function applyLang(")
if ($aIdx -lt 0) {
    Write-Host "FOUT: 'function applyLang(' niet gevonden in partner.html. Niets gewijzigd." -ForegroundColor Red
    exit 1
}
$aOpen = $c.IndexOf('{', $aIdx)
$aEnd = FindMatchingBrace $c $aOpen

$tIdx = $c.IndexOf("function toggleLang(", $aEnd)
if ($tIdx -lt 0) {
    Write-Host "FOUT: 'function toggleLang(' niet gevonden. Niets gewijzigd." -ForegroundColor Red
    exit 1
}
$tOpen = $c.IndexOf('{', $tIdx)
$tEnd = FindMatchingBrace $c $tOpen

$dIdx = $c.IndexOf("DOMContentLoaded", $tEnd)
if ($dIdx -lt 0) {
    Write-Host "FOUT: 'DOMContentLoaded' listener niet gevonden. Niets gewijzigd." -ForegroundColor Red
    exit 1
}
$dOpen = $c.IndexOf('{', $dIdx)
$dEnd = FindMatchingBrace $c $dOpen
$semi = $c.IndexOf(';', $dEnd)

if ($aOpen -lt 0 -or $aEnd -lt 0 -or $tOpen -lt 0 -or $tEnd -lt 0 -or $dOpen -lt 0 -or $dEnd -lt 0 -or $semi -lt 0) {
    Write-Host "FOUT: kon het taal-blok niet volledig afbakenen (accolades kloppen niet). Niets gewijzigd." -ForegroundColor Red
    exit 1
}

$newJs = @'
function applyLang(lang){
      document.documentElement.lang = lang;
      try { localStorage.setItem('savora_lang', lang); } catch(e){}
      var els = document.querySelectorAll('[data-en]');
      for (var i=0;i<els.length;i++){
        var el = els[i];
        if (el.getAttribute('data-sq') === null) el.setAttribute('data-sq', el.innerHTML);
        var val = el.getAttribute('data-sq');
        if (lang==='en') val = el.getAttribute('data-en');
        else if (lang==='it' && el.getAttribute('data-it') !== null) val = el.getAttribute('data-it');
        el.innerHTML = val;
      }
      var phs = document.querySelectorAll('[data-en-ph]');
      for (var j=0;j<phs.length;j++){
        var pe = phs[j];
        if (pe.getAttribute('data-sq-ph') === null) pe.setAttribute('data-sq-ph', pe.getAttribute('placeholder')||'');
        var pval = pe.getAttribute('data-sq-ph');
        if (lang==='en') pval = pe.getAttribute('data-en-ph');
        else if (lang==='it' && pe.getAttribute('data-it-ph') !== null) pval = pe.getAttribute('data-it-ph');
        pe.setAttribute('placeholder', pval);
      }
      var ops = document.querySelectorAll('[data-en-opt]');
      for (var k=0;k<ops.length;k++){
        var oe = ops[k];
        if (oe.getAttribute('data-sq-opt') === null) oe.setAttribute('data-sq-opt', oe.textContent);
        var oval = oe.getAttribute('data-sq-opt');
        if (lang==='en') oval = oe.getAttribute('data-en-opt');
        else if (lang==='it' && oe.getAttribute('data-it-opt') !== null) oval = oe.getAttribute('data-it-opt');
        oe.textContent = oval;
      }
      var lb = document.getElementById('langBtn');
      if (lb) lb.textContent = (lang==='sq') ? 'EN' : (lang==='en') ? 'IT' : 'SQ';
    }
    function toggleLang(){
      var cur = document.documentElement.lang;
      if (cur!=='sq' && cur!=='en' && cur!=='it') cur = 'sq';
      var next = (cur==='sq') ? 'en' : (cur==='en') ? 'it' : 'sq';
      applyLang(next);
    }
    document.addEventListener('DOMContentLoaded', function(){
      var saved = 'sq';
      try { saved = localStorage.getItem('savora_lang') || 'sq'; } catch(e){}
      if (saved!=='sq' && saved!=='en' && saved!=='it') saved = 'sq';
      applyLang(saved);
    });
'@

$before = $c.Substring(0, $aIdx)
$after  = $c.Substring($semi + 1)
$c2 = $before + $newJs + $after

[System.IO.File]::WriteAllText($target, $c2, (New-Object System.Text.UTF8Encoding($false)))

$check = [System.IO.File]::ReadAllText($target, [System.Text.Encoding]::UTF8)
$nApply = ([regex]::Matches($check, "function applyLang\(")).Count
$nToggle = ([regex]::Matches($check, "function toggleLang\(")).Count
$has3way = $check.Contains("next = (cur===")
$nDataIt = ([regex]::Matches($check, "data-it(-ph|-opt)?=")).Count

Write-Host ""
Write-Host "Controle na wijziging:" -ForegroundColor Cyan
Write-Host "  function applyLang( voorkomens (verwacht 1):  $nApply"
Write-Host "  function toggleLang( voorkomens (verwacht 1): $nToggle"
Write-Host "  3-weg cyclus-logica aanwezig (verwacht True):  $has3way"
Write-Host "  data-it attributen totaal (verwacht 98):       $nDataIt"
Write-Host ""

if ($nApply -ne 1 -or $nToggle -ne 1 -or -not $has3way) {
    Write-Host "WAARSCHUWING: controle niet gehaald. NIET deployen - herstel uit de zojuist gemaakte backup en meld dit." -ForegroundColor Red
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
Write-Host "Klaar. Test https://savoraapp.com/partner.html (Ctrl+Shift+R) en klik de taalknop 3x: SQ -> EN -> IT -> SQ." -ForegroundColor Cyan