# ============================================================
# Savoraapp - repareert de karakter-corruptie (mojibake) in
# partner.html / partner-dashboard.html, voegt het ontbrekende
# #flow anchor-punt toe, zet de 4 Albanese pagina's neer
# (contact/faq/cookie-policy/terms-of-service) en deployt alles.
#
# Waarom dit nodig is: eerdere scripts gebruikten
# Get-Content/Set-Content -Encoding UTF8, wat in Windows
# PowerShell 5.1 UTF-8 bytes soms als Windows-1252 leest en
# dan dubbel opnieuw encodeert. Resultaat: "e"->"A e" etc.
# Dit script leest/schrijft bestanden voortaan met .NET
# methodes die dat probleem niet hebben.
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

function Repair-Mojibake {
    param([string]$path)

    if (-not (Test-Path $path)) {
        Write-Host "OVERGESLAGEN (niet gevonden): $path" -ForegroundColor Yellow
        return
    }

    $bytes = [System.IO.File]::ReadAllBytes($path)
    $text  = [System.Text.Encoding]::UTF8.GetString($bytes)

    # Signatures worden opgebouwd met [char] code-punten (puur ASCII in
    # de scriptbron) zodat dit .ps1-bestand zelf NOOIT verkeerd gelezen
    # kan worden, wat ook de PowerShell-encoding-instelling is.
    $cA  = [char]0x00C3  # U+00C3 (0xC3 verkeerd gelezen als Windows-1252)
    $signatures = @(
        ($cA + [char]0x00AB),  # A" -> corrupte "e"
        ($cA + [char]0x00A9),  # A(c)-> corrupte "e" (acute)
        ($cA + [char]0x00A7),  # A + section -> corrupte "c" (cedille)
        ($cA + [char]0x2021),  # A + double dagger -> corrupte "C" (cedille)
        ($cA + [char]0x2039),  # A + angle quote -> corrupte "E" (trema)
        ([char]0x00E2 + [char]0x20AC)  # a-circumflex + euro -> corrupte streepjes/aanhalingstekens
    )
    $hits = 0
    foreach ($s in $signatures) { if ($text.Contains($s)) { $hits++ } }

    if ($hits -eq 0) {
        Write-Host "OK, geen corruptie: $path" -ForegroundColor Green
        return
    }

    Write-Host "Corruptie gevonden in $path ($hits patronen) - repareren..." -ForegroundColor Yellow
    Backup-File $path

    $cp1252 = [System.Text.Encoding]::GetEncoding(1252)
    $recoveredBytes = $cp1252.GetBytes($text)
    $fixed = [System.Text.Encoding]::UTF8.GetString($recoveredBytes)

    # Nog steeds corrupte tekens over? dan nog een ronde toepassen.
    $stillBad = $false
    foreach ($s in $signatures) { if ($fixed.Contains($s)) { $stillBad = $true } }
    if ($stillBad) {
        $recoveredBytes2 = $cp1252.GetBytes($fixed)
        $fixed = [System.Text.Encoding]::UTF8.GetString($recoveredBytes2)
    }

    [System.IO.File]::WriteAllText($path, $fixed, $Utf8NoBom)
    Write-Host "  Gerepareerd en opgeslagen (UTF-8 zonder BOM): $path" -ForegroundColor Green
}

Write-Host "=== Stap 1: karakter-corruptie herstellen ===" -ForegroundColor Cyan
Repair-Mojibake (Join-Path $PublicDir "partner.html")
Repair-Mojibake (Join-Path $PublicDir "partner-dashboard.html")
Repair-Mojibake (Join-Path $PublicDir "index.html")
Repair-Mojibake (Join-Path $PublicDir "css\styles.css")

Write-Host ""
Write-Host "=== Stap 2: #flow ankerpunt toevoegen in partner.html ===" -ForegroundColor Cyan
$partnerFile = Join-Path $PublicDir "partner.html"
if (Test-Path $partnerFile) {
    $pcontent = [System.IO.File]::ReadAllText($partnerFile, [System.Text.Encoding]::UTF8)
    if ($pcontent -match 'id="flow"') {
        Write-Host "id=""flow"" bestaat al, niets te doen." -ForegroundColor Green
    } elseif ($pcontent.Contains('<h2>Si funksionon</h2>')) {
        Backup-File $partnerFile
        $pcontent = $pcontent.Replace('<h2>Si funksionon</h2>', '<span id="flow"></span><h2>Si funksionon</h2>')
        [System.IO.File]::WriteAllText($partnerFile, $pcontent, $Utf8NoBom)
        Write-Host "Ankerpunt #flow toegevoegd boven ""Si funksionon""." -ForegroundColor Green
    } else {
        Write-Host "Kop ""Si funksionon"" niet exact gevonden - handmatig controleren." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== Stap 3: Albanese pagina's (contact/faq/cookie-policy/terms) plaatsen ===" -ForegroundColor Cyan

$contactHtml = @'
<!DOCTYPE html>
<html lang="sq">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kontakt - Savoraapp</title>
<meta name="description" content="Na kontaktoni. Pyetje, komente ose deshironi te bashkepunojme? Jemi ketu per ju.">
<meta name="theme-color" content="#10b981">
<meta name="verify-paysera" content="39ffaa4a0a96b7334c68bf29f1f24704">
<link rel="icon" href="icons/favicon.ico">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="js/config.js"></script>
<style>
  :root{--primary:#10b981;--primary-d:#059669;--dark:#123a0a;--gray:#6b7280;--bg:#f9f7ed;--border:#e5e7eb;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:#1f2937;line-height:1.6;}
  a{color:var(--primary);text-decoration:none;}
  header{background:#fff;border-bottom:1px solid var(--border);padding:16px 24px;display:flex;align-items:center;justify-content:space-between;}
  .logo{display:flex;align-items:center;gap:8px;font-weight:800;font-size:1.1rem;color:var(--dark);}
  .logo .sq{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--primary),#34d399);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;}
  .back-link{font-size:0.9rem;font-weight:600;color:var(--gray);}
  main{max-width:900px;margin:0 auto;padding:48px 24px 64px;}
  .badge{display:inline-flex;align-items:center;gap:8px;background:#ecfdf5;color:var(--primary-d);font-weight:700;font-size:0.85rem;padding:8px 16px;border-radius:999px;margin-bottom:16px;}
  h1{font-size:2.2rem;font-weight:800;color:var(--dark);margin-bottom:10px;}
  .sub{color:var(--gray);margin-bottom:36px;font-size:1.05rem;}
  .grid{display:grid;grid-template-columns:1.3fr 1fr;gap:32px;}
  @media (max-width:760px){.grid{grid-template-columns:1fr;}}
  .card{background:#fff;border:1px solid var(--border);border-radius:16px;padding:28px;}
  .form-group{margin-bottom:18px;}
  label{display:block;font-size:0.85rem;font-weight:600;color:var(--dark);margin-bottom:6px;}
  input,textarea{width:100%;padding:12px 14px;border:2px solid var(--border);border-radius:10px;font-size:0.95rem;font-family:inherit;transition:border-color .2s;}
  input:focus,textarea:focus{outline:none;border-color:var(--primary);}
  textarea{resize:vertical;min-height:100px;}
  .char-count{font-size:0.75rem;color:var(--gray);text-align:right;margin-top:4px;}
  button[type=submit]{width:100%;padding:14px;background:var(--primary);color:#fff;border:none;border-radius:10px;font-weight:700;font-size:1rem;cursor:pointer;transition:background .2s;}
  button[type=submit]:hover{background:var(--primary-d);}
  button[type=submit]:disabled{opacity:.6;cursor:not-allowed;}
  .success-msg{display:none;background:#ecfdf5;color:var(--primary-d);padding:14px 16px;border-radius:10px;font-weight:600;margin-top:16px;}
  .success-msg.show{display:block;}
  .info-item{display:flex;gap:14px;align-items:flex-start;margin-bottom:22px;}
  .info-icon{width:40px;height:40px;border-radius:10px;background:#ecfdf5;color:var(--primary-d);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.1rem;}
  .info-item h4{font-size:0.8rem;text-transform:uppercase;letter-spacing:.04em;color:var(--gray);margin-bottom:2px;}
  .info-item p{font-weight:600;color:var(--dark);}
  footer{background:#123a0a;color:#e5e7eb;padding:40px 24px 24px;text-align:center;font-size:0.85rem;}
  footer a{color:#a7f3d0;}
  .paysera-badge{margin-bottom:16px;display:inline-block;}
</style>
</head>
<body>

<header>
  <a href="index.html" class="logo"><span class="sq">S</span> Savora<span style="color:var(--primary)">app</span></a>
  <a href="index.html" class="back-link">&larr; Kthehu te faqja kryesore</a>
</header>

<main>
  <div class="badge">Kontakt</div>
  <h1>Na kontaktoni</h1>
  <p class="sub">Pyetje, komente ose deshironi te bashkepunojme? Jemi ketu per ju.</p>

  <div class="grid">
    <div class="card">
      <form id="contactForm" novalidate>
        <div class="form-group">
          <label for="cName">Emri</label>
          <input type="text" id="cName" placeholder="P.sh. Ana Krasniqi" required>
        </div>
        <div class="form-group">
          <label for="cPhone">Numri i telefonit</label>
          <input type="tel" id="cPhone" placeholder="+355 69 123 4567">
        </div>
        <div class="form-group">
          <label for="cEmail">Email</label>
          <input type="email" id="cEmail" placeholder="ju@email.com" required>
        </div>
        <div class="form-group">
          <label for="cCity">Qyteti</label>
          <input type="text" id="cCity" placeholder="P.sh. Durres">
        </div>
        <div class="form-group">
          <label for="cMessage">Mesazhi (maksimumi 300 karaktere)</label>
          <textarea id="cMessage" maxlength="300" required></textarea>
          <div class="char-count"><span id="charCount">0</span> / 300</div>
        </div>
        <button type="submit" id="submitBtn">Dergo</button>
        <div class="success-msg" id="successMsg">Mesazhi u dergua! Do t'ju kontaktojme se shpejti.</div>
      </form>
    </div>

    <div>
      <div class="info-item">
        <div class="info-icon">@</div>
        <div>
          <h4>Email</h4>
          <p><a href="mailto:info@savoraapp.com">info@savoraapp.com</a></p>
        </div>
      </div>
      <div class="info-item">
        <div class="info-icon">#</div>
        <div>
          <h4>Telefon</h4>
          <p><a href="tel:+355696080926">+355 69 608 0926</a></p>
        </div>
      </div>
      <div class="info-item">
        <div class="info-icon">*</div>
        <div>
          <h4>Adresa</h4>
          <p>Durres, Shqiperi</p>
        </div>
      </div>
    </div>
  </div>
</main>

<footer>
  <a class="paysera-badge" href="https://bank.paysera.com/en/quality-sign/256849" target="_blank" rel="noopener noreferrer">Pagesa te Sigurta nga Paysera</a><br>
  (c) 2026 Savoraapp. Te gjitha te drejtat e rezervuara.
</footer>

<script>
  var API_BASE = (window.SAVORA_CONFIG && window.SAVORA_CONFIG.API_BASE) || 'https://savoraapp.sparkling-scene-16e3.workers.dev';
  var API_URL = API_BASE.replace(/\/$/, '') + '/api';

  var msgEl = document.getElementById('cMessage');
  var countEl = document.getElementById('charCount');
  msgEl.addEventListener('input', function () {
    countEl.textContent = msgEl.value.length;
  });

  document.getElementById('contactForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('cName').value.trim();
    var phone = document.getElementById('cPhone').value.trim();
    var email = document.getElementById('cEmail').value.trim();
    var city = document.getElementById('cCity').value.trim();
    var message = document.getElementById('cMessage').value.trim();

    if (!name || !email || !message) {
      alert('Ju lutem plotesoni emrin, email-in dhe mesazhin.');
      return;
    }

    var btn = document.getElementById('submitBtn');
    var originalText = btn.textContent;
    btn.textContent = 'Duke derguar...';
    btn.disabled = true;

    fetch(API_URL + '/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, phone: phone, email: email, city: city, message: message }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        btn.textContent = originalText;
        btn.disabled = false;
        if (data && data.success !== false) {
          document.getElementById('successMsg').classList.add('show');
          document.getElementById('contactForm').reset();
          countEl.textContent = '0';
        } else {
          alert((data && data.error) || 'Dicka shkoi keq. Provoni serish.');
        }
      })
      .catch(function () {
        btn.textContent = originalText;
        btn.disabled = false;
        alert('Nuk mund te lidhemi me serverin. Provoni serish me vone.');
      });
  });
</script>
</body>
</html>
'@

$faqHtml = @'
<!DOCTYPE html>
<html lang="sq">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pyetje te Shpeshta - Savoraapp</title>
<meta name="description" content="Pergjigje per pyetjet me te shpeshta rreth Savoraapp - per konsumatore dhe per partnere.">
<meta name="theme-color" content="#10b981">
<meta name="verify-paysera" content="39ffaa4a0a96b7334c68bf29f1f24704">
<link rel="icon" href="icons/favicon.ico">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="js/config.js"></script>
<style>
  :root{--primary:#10b981;--primary-d:#059669;--dark:#123a0a;--gray:#6b7280;--bg:#f9f7ed;--border:#e5e7eb;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:#1f2937;line-height:1.6;}
  a{color:var(--primary);text-decoration:none;}
  header{background:#fff;border-bottom:1px solid var(--border);padding:16px 24px;display:flex;align-items:center;justify-content:space-between;}
  .logo{display:flex;align-items:center;gap:8px;font-weight:800;font-size:1.1rem;color:var(--dark);}
  .logo .sq{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--primary),#34d399);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;}
  .back-link{font-size:0.9rem;font-weight:600;color:var(--gray);}
  main{max-width:800px;margin:0 auto;padding:48px 24px 64px;}
  .badge{display:inline-flex;align-items:center;gap:8px;background:#ecfdf5;color:var(--primary-d);font-weight:700;font-size:0.85rem;padding:8px 16px;border-radius:999px;margin-bottom:16px;}
  h1{font-size:2.2rem;font-weight:800;color:var(--dark);margin-bottom:10px;}
  .sub{color:var(--gray);margin-bottom:36px;font-size:1.05rem;}
  .section-label{font-size:1.3rem;font-weight:800;color:var(--dark);margin:36px 0 16px;}
  .faq-item{background:#fff;border:1px solid var(--border);border-radius:14px;margin-bottom:10px;overflow:hidden;}
  .faq-question{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;font-weight:600;font-size:1rem;color:var(--dark);text-align:left;background:none;border:none;cursor:pointer;}
  .faq-question:hover{color:var(--primary-d);}
  .faq-icon{width:20px;height:20px;flex-shrink:0;transition:transform .2s;color:var(--gray);}
  .faq-item.active .faq-icon{transform:rotate(180deg);}
  .faq-answer{max-height:0;overflow:hidden;transition:max-height .25s ease;}
  .faq-item.active .faq-answer{max-height:400px;}
  .faq-answer p{padding:0 20px 18px;color:var(--gray);font-size:0.95rem;}
  footer{background:#123a0a;color:#e5e7eb;padding:40px 24px 24px;text-align:center;font-size:0.85rem;}
  footer a{color:#a7f3d0;}
</style>
</head>
<body>

<header>
  <a href="index.html" class="logo"><span class="sq">S</span> Savora<span style="color:var(--primary)">app</span></a>
  <a href="index.html" class="back-link">&larr; Kthehu te faqja kryesore</a>
</header>

<main>
  <div class="badge">Pyetje te Shpeshta</div>
  <h1>Pyetje te Shpeshta</h1>
  <p class="sub">Pergjigje per pyetjet me te shpeshta rreth Savoraapp.</p>

  <div class="section-label">Per konsumatore</div>

  <div class="faq-item">
    <button class="faq-question">Cfare eshte Savoraapp?
      <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="faq-answer"><p>Savoraapp eshte nje platforme ku mund te blesh kuti surprize me ushqim te freskete nga dyqane, restorante dhe furra lokale - me ulje deri ne 70%. Ti shpeton ushqim qe perndryshe do te hidhej.</p></div>
  </div>

  <div class="faq-item">
    <button class="faq-question">Si funksionon?
      <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="faq-answer"><p>1. Shfleto ofertat e disponueshme te dyqanet prane teje. 2. Rezervo kutine tende ne 10 sekonda. 3. Merre nga dyqani ne kohen e caktuar. 4. Shijo ushqim te freskete me nje pjese te vogel te cmimit!</p></div>
  </div>

  <div class="faq-item">
    <button class="faq-question">Cfare perfshin nje kuti surprize?
      <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="faq-answer"><p>Cdo kuti permban ushqim te freskete qe dyqanit i ka tepruar - buke, perime, fruta, gjelle ose produkte te tjera. Permbajtja eshte surprize, por vlera eshte gjithmone me e larte se cmimi qe paguan.</p></div>
  </div>

  <div class="faq-item">
    <button class="faq-question">Si paguaj?
      <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="faq-answer"><p>Paguan me para ne dore kur merr kutine ne vendndodhjen e biznesit. Nuk kerkohet asnje pagese online per rezervim.</p></div>
  </div>

  <div class="faq-item">
    <button class="faq-question">A mund ta anuloj rezervimin?
      <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="faq-answer"><p>Po, mund te anulosh falas deri 2 ore para kohes se marrjes. Pas kesaj, dyqani e ka pergatitur tashme kutine, keshtu qe anulimet e vonshme ose mungesat mund te ndikojne ne rezervimet e ardhshme.</p></div>
  </div>

  <div class="section-label">Per partnere</div>

  <div class="faq-item">
    <button class="faq-question">Sa kushton te behesh partner?
      <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="faq-answer"><p>Regjistrimi eshte falas. Blen kredite per te postuar oferta - cdo oferte kushton 1 kredit. Nuk ka kosto fikse apo abonim mujor.</p></div>
  </div>

  <div class="faq-item">
    <button class="faq-question">Sa shpejt mund te jem aktiv?
      <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="faq-answer"><p>Brenda 5 minutash! Pas verifikimit te regjistrimit tend, mund te postosh menjehere oferta dhe te fillosh te marresh kliente.</p></div>
  </div>

  <div class="faq-item">
    <button class="faq-question">Si funksionon sistemi i kredive?
      <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="faq-answer"><p>Blen paketa kredish: 25 kredite per 500 Lek, 60 kredite per 1.000 Lek, ose 140 kredite per 2.000 Lek. Cdo oferte e postuar kushton 1 kredit. Kreditet jane te vlefshme per 3 muaj nga blerja. Pagesat behen ne menyre te sigurte permes Paysera.</p></div>
  </div>

  <div class="faq-item">
    <button class="faq-question">Cilat biznese mund te marrin pjese?
      <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="faq-answer"><p>Te gjitha bizneset e regjistruara te ushqimit: furra, restorante, kafene, supermarkete, hotele dhe kateringje. Nevojitet nje Numer Identifikimi Biznesi (NIPT/NUI) i vlefshem.</p></div>
  </div>

  <div class="section-label">Pergjithshme</div>

  <div class="faq-item">
    <button class="faq-question">Ne cilat qytete eshte i disponueshem Savoraapp?
      <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="faq-answer"><p>Aktualisht jemi aktive ne Durres dhe po zgjerohemi shpejt ne Tirane, Vlore, Shkoder dhe qytete te tjera ne Shqiperi.</p></div>
  </div>

  <div class="faq-item">
    <button class="faq-question">Si mund te kontaktoj?
      <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="faq-answer"><p>Dergo email ne info@savoraapp.com ose perdor <a href="contact.html">formularin e kontaktit</a>. Pergjigjemi brenda 24 oreve.</p></div>
  </div>
</main>

<footer>
  <a href="https://bank.paysera.com/en/quality-sign/256849" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-bottom:16px;">Pagesa te Sigurta nga Paysera</a><br>
  (c) 2026 Savoraapp. Te gjitha te drejtat e rezervuara.
</footer>

<script>
  document.querySelectorAll('.faq-item').forEach(function (item) {
    item.querySelector('.faq-question').addEventListener('click', function () {
      var isActive = item.classList.contains('active');
      document.querySelectorAll('.faq-item.active').forEach(function (el) { el.classList.remove('active'); });
      if (!isActive) item.classList.add('active');
    });
  });
</script>
</body>
</html>
'@

$cookieHtml = @'
<!DOCTYPE html>
<html lang="sq">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Politika e Cookies - Savoraapp</title>
<meta name="description" content="Si i perdor Savoraapp cookies dhe si mund t'i menaxhoni.">
<meta name="theme-color" content="#10b981">
<meta name="verify-paysera" content="39ffaa4a0a96b7334c68bf29f1f24704">
<link rel="icon" href="icons/favicon.ico">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="js/config.js"></script>
<style>
  :root{--primary:#10b981;--primary-d:#059669;--dark:#123a0a;--gray:#6b7280;--bg:#f9f7ed;--border:#e5e7eb;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:#1f2937;line-height:1.7;}
  a{color:var(--primary);}
  header{background:#fff;border-bottom:1px solid var(--border);padding:16px 24px;display:flex;align-items:center;justify-content:space-between;}
  .logo{display:flex;align-items:center;gap:8px;font-weight:800;font-size:1.1rem;color:var(--dark);text-decoration:none;}
  .logo .sq{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--primary),#34d399);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;}
  .back-link{font-size:0.9rem;font-weight:600;color:var(--gray);text-decoration:none;}
  main{max-width:760px;margin:0 auto;padding:48px 24px 64px;}
  .badge{display:inline-flex;align-items:center;gap:8px;background:#ecfdf5;color:var(--primary-d);font-weight:700;font-size:0.85rem;padding:8px 16px;border-radius:999px;margin-bottom:16px;}
  h1{font-size:2.1rem;font-weight:800;color:var(--dark);margin-bottom:6px;}
  .updated{color:var(--gray);font-size:0.9rem;margin-bottom:32px;}
  h2{font-size:1.25rem;font-weight:800;color:var(--dark);margin:32px 0 12px;}
  p,li{color:#374151;margin-bottom:10px;}
  ul{padding-left:22px;margin-bottom:14px;}
  strong{color:var(--dark);}
  .note{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;font-size:0.9rem;color:#92400e;margin:16px 0;}
  footer{background:#123a0a;color:#e5e7eb;padding:40px 24px 24px;text-align:center;font-size:0.85rem;margin-top:24px;}
  footer a{color:#a7f3d0;}
</style>
</head>
<body>

<header>
  <a href="index.html" class="logo"><span class="sq">S</span> Savora<span style="color:var(--primary)">app</span></a>
  <a href="index.html" class="back-link">&larr; Kthehu te faqja kryesore</a>
</header>

<main>
  <div class="badge">Cookies</div>
  <h1>Politika e Cookies</h1>
  <p class="updated">Perditesuar se fundi: 6 gusht 2026</p>

  <h2>1. Cfare jane cookies?</h2>
  <p>Cookies jane skedare te vegjel teksti qe ruhen ne pajisjen tuaj kur vizitoni nje faqe interneti. Ato na ndihmojne te bejme faqen te funksionoje si duhet dhe te permiresojme pervojen tuaj si perdorues.</p>

  <h2>2. Cilat cookies perdorim?</h2>
  <p><strong>Cookies funksionale (te nevojshme)</strong><br>Keto cookies jane te domosdoshme per funksionimin e faqes. Pa to, disa funksione nuk punojne.</p>
  <ul>
    <li><strong>Cookie sesioni:</strong> mban gjendjen tuaj te identifikimit</li>
    <li><strong>Preferenca e gjuhes:</strong> mban mend gjuhen e zgjedhur (shqip/anglisht)</li>
    <li><strong>Token CSRF:</strong> mbrojtje kunder sulmeve</li>
  </ul>
  <p><strong>Cookies analitike (opsionale)</strong><br>Keto cookies na ndihmojne te kuptojme si e perdorin vizitoret faqen. I perdorim vetem per te permiresuar faqen.</p>
  <ul>
    <li><strong>Google Analytics:</strong> statistika anonime vizitoresh</li>
  </ul>

  <h2>3. Cookies te paleve te treta</h2>
  <p>Perdorim sherbime te paleve te treta qe mund te vendosin cookies:</p>
  <ul>
    <li><strong>Cloudflare:</strong> siguri dhe performance</li>
    <li><strong>Google Fonts:</strong> ngarkimi i fonteve</li>
    <li><strong>Paysera:</strong> perpunimi i sigurt i pagesave per partneret</li>
  </ul>

  <h2>4. Si t'i menaxhoni cookies?</h2>
  <p>Mund t'i menaxhoni cookies permes cilesimeve te shfletuesit tuaj:</p>
  <ul>
    <li><strong>Chrome:</strong> Cilesimet &rarr; Privatesia dhe siguria &rarr; Cookies</li>
    <li><strong>Firefox:</strong> Cilesimet &rarr; Privatesia &amp; Siguria &rarr; Cookies</li>
    <li><strong>Safari:</strong> Preferencat &rarr; Privatesia &rarr; Cookies</li>
    <li><strong>Edge:</strong> Cilesimet &rarr; Cookies dhe lejet e faqeve</li>
  </ul>
  <div class="note">Nese caktivizoni cookies funksionale, faqja mund te mos funksionoje si duhet.</div>

  <h2>5. Ndryshimi i preferencave</h2>
  <p>Mund t'i ndryshoni preferencat e cookies ne cdo moment duke perditesuar cilesimet e shfletuesit tuaj.</p>

  <h2>6. Kontakt</h2>
  <p>Pyetje rreth Politikes se Cookies? Na shkruani ne <a href="mailto:info@savoraapp.com">info@savoraapp.com</a>.</p>
</main>

<footer>
  <a href="https://bank.paysera.com/en/quality-sign/256849" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-bottom:16px;">Pagesa te Sigurta nga Paysera</a><br>
  (c) 2026 Savoraapp. Te gjitha te drejtat e rezervuara.
</footer>
</body>
</html>
'@

$termsHtml = @'
<!DOCTYPE html>
<html lang="sq">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kushtet e Sherbimit - Savoraapp</title>
<meta name="description" content="Kushtet e sherbimit te Savoraapp per konsumatore dhe partnere biznesi.">
<meta name="theme-color" content="#10b981">
<meta name="verify-paysera" content="39ffaa4a0a96b7334c68bf29f1f24704">
<link rel="icon" href="icons/favicon.ico">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="js/config.js"></script>
<style>
  :root{--primary:#10b981;--primary-d:#059669;--dark:#123a0a;--gray:#6b7280;--bg:#f9f7ed;--border:#e5e7eb;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:#1f2937;line-height:1.7;}
  a{color:var(--primary);}
  header{background:#fff;border-bottom:1px solid var(--border);padding:16px 24px;display:flex;align-items:center;justify-content:space-between;}
  .logo{display:flex;align-items:center;gap:8px;font-weight:800;font-size:1.1rem;color:var(--dark);text-decoration:none;}
  .logo .sq{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--primary),#34d399);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;}
  .back-link{font-size:0.9rem;font-weight:600;color:var(--gray);text-decoration:none;}
  main{max-width:760px;margin:0 auto;padding:48px 24px 64px;}
  .badge{display:inline-flex;align-items:center;gap:8px;background:#ecfdf5;color:var(--primary-d);font-weight:700;font-size:0.85rem;padding:8px 16px;border-radius:999px;margin-bottom:16px;}
  h1{font-size:2.1rem;font-weight:800;color:var(--dark);margin-bottom:6px;}
  .updated{color:var(--gray);font-size:0.9rem;margin-bottom:20px;}
  h2{font-size:1.25rem;font-weight:800;color:var(--dark);margin:32px 0 12px;}
  h3{font-size:1.02rem;font-weight:700;color:var(--dark);margin:18px 0 8px;}
  p,li{color:#374151;margin-bottom:10px;}
  ul{padding-left:22px;margin-bottom:14px;}
  strong{color:var(--dark);}
  .review-note{background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 18px;font-size:0.88rem;color:#991b1b;margin-bottom:28px;}
  footer{background:#123a0a;color:#e5e7eb;padding:40px 24px 24px;text-align:center;font-size:0.85rem;margin-top:24px;}
  footer a{color:#a7f3d0;}
</style>
</head>
<body>

<header>
  <a href="index.html" class="logo"><span class="sq">S</span> Savora<span style="color:var(--primary)">app</span></a>
  <a href="index.html" class="back-link">&larr; Kthehu te faqja kryesore</a>
</header>

<main>
  <div class="badge">Kushtet e Sherbimit</div>
  <h1>Kushtet e Sherbimit</h1>
  <p class="updated">Perditesuar se fundi: 6 gusht 2026</p>

  <div class="review-note"><strong>Shenim:</strong> Ky draft eshte pergatitur per te zevendesuar nje version te gabuar (ne nje gjuhe tjeter, me referenca ligjore per nje vend tjeter). Permbajtja tani i referohet Shqiperise dhe modelit tuaj real te biznesit (kredite, pa abonim), por rekomandohet te kaloje nga nje avokat perpara se ta konsideroni perfundimtare ligjerisht.</div>

  <h2>1. Perkufizime</h2>
  <p>Ne keto kushte te sherbimit kuptohet me:</p>
  <ul>
    <li><strong>Savoraapp:</strong> platforma "food surplus marketplace" e ofruar nga SavoraApp</li>
    <li><strong>Partneri:</strong> pronari ose menaxheri i biznesit (dyqan, furre, restorant etj.) qe perdor Savoraapp per te postuar oferta</li>
    <li><strong>Konsumatori:</strong> perdoruesi qe rezervon kuti ushqimi permes Savoraapp</li>
    <li><strong>Sherbimi:</strong> lidhja e ofruar nga Savoraapp mes ushqimit te tepert dhe konsumatoreve</li>
  </ul>

  <h2>2. Zbatueshmeria</h2>
  <p>Keto kushte te sherbimit zbatohen per cdo perdorim te Savoraapp. Duke perdorur sherbimin tone, ju pranoni keto kushte.</p>

  <h2>3. Llogaria dhe qasja</h2>
  <h3>3.1 Krijimi i llogarise</h3>
  <ul>
    <li>Duhet te keni te pakten 18 vjec</li>
    <li>Jepni informacion te sakte dhe te plote</li>
    <li>Jeni pergjegjes per ruajtjen e sigurt te te dhenave tuaja te hyrjes</li>
  </ul>
  <h3>3.2 Perdorimi i sherbimit</h3>
  <ul>
    <li>Perdorni Savoraapp vetem per qellimin e synuar (shitja/rezervimi i ushqimit surplus)</li>
    <li>Nuk lejohet keqperdorimi i sistemit</li>
    <li>Respektoni privatesine e perdoruesve te tjere</li>
  </ul>

  <h2>4. Regjistrimi, kreditet dhe pagesat</h2>
  <h3>4.1 Regjistrimi</h3>
  <p>Regjistrimi si partner ne Savoraapp eshte <strong>falas</strong>. Nuk ka kosto fikse ose abonim mujor.</p>
  <h3>4.2 Kreditet</h3>
  <p>Partneret blejne paketa kreditesh per te postuar oferta (1 kredit = 1 postim). Kreditet jane te vlefshme per nje periudhe te caktuar (deri ne 3 muaj) nga blerja. Pagesat perpunohen ne menyre te sigurte permes Paysera.</p>
  <h3>4.3 Rimbursime</h3>
  <p>Kreditet e pashpenzuara nuk rimbursohen pas skadimit te vlefshmerise, pervec rasteve te kerkuara nga ligji.</p>

  <h2>5. Pronesia intelektuale</h2>
  <p>Te gjitha te drejtat mbi Savoraapp, perfshire softuerin, dizajnin dhe markat, mbeten prone e SavoraApp. Ju merrni nje licence te kufizuar per perdorimin e sherbimit.</p>

  <h2>6. Te dhenat dhe privatesia</h2>
  <p>Trajtojme te gjitha te dhenat sipas <a href="privacy-policy.html">Politikes se Privatesise</a>. Ju mbeteni pronar i produkteve qe ofroni permes Savoraapp.</p>

  <h2>7. Kufizimi i pergjegjesise</h2>
  <p>Savoraapp nuk mban pergjegjesi per:</p>
  <ul>
    <li>Demtim reputacioni nga pershkrime te gabuara te produkteve nga partneret</li>
    <li>Defekte teknike jashte kontrollit tone</li>
    <li>Deme indirekte ose pasuese</li>
  </ul>
  <p>Pergjegjesia jone totale kufizohet ne shumen qe keni paguar tek Savoraapp ne 12 muajt e fundit.</p>

  <h2>8. Ndryshimet</h2>
  <p>Mund t'i ndryshojme keto kushte here pas here. Ne rast ndryshimesh te rendesishme, do t'ju informojme permes email-it.</p>

  <h2>9. Ligji i zbatueshem</h2>
  <p>Keto kushte rregullohen nga legjislacioni i Republikes se Shqiperise. Cdo mosmarreveshje do t'i nenshtrohet juridiksionit te gjykatave kompetente ne Shqiperi.</p>

  <h2>10. Kontakt</h2>
  <p>Pyetje rreth ketyre kushteve? Na shkruani ne <a href="mailto:info@savoraapp.com">info@savoraapp.com</a>.</p>
</main>

<footer>
  <a href="https://bank.paysera.com/en/quality-sign/256849" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-bottom:16px;">Pagesa te Sigurta nga Paysera</a><br>
  (c) 2026 Savoraapp. Te gjitha te drejtat e rezervuara.
</footer>
</body>
</html>
'@

$pages = @{
    "contact.html"           = $contactHtml
    "faq.html"                = $faqHtml
    "cookie-policy.html"      = $cookieHtml
    "terms-of-service.html"   = $termsHtml
}

foreach ($name in $pages.Keys) {
    $dst = Join-Path $PublicDir $name
    Backup-File $dst
    [System.IO.File]::WriteAllText($dst, $pages[$name], $Utf8NoBom)
    Write-Host "Geplaatst: $dst" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Stap 4: deployen naar Cloudflare Pages ===" -ForegroundColor Cyan
Set-Location $ProjectPath
$wt = Join-Path $ProjectPath "wrangler.toml"
if (Test-Path $wt) { Rename-Item $wt "$wt.bak" -Force }
try {
    npx wrangler pages deploy public --project-name=savoraapp
} finally {
    if (Test-Path "$wt.bak") { Rename-Item "$wt.bak" $wt -Force }
}

Write-Host ""
Write-Host "Klaar. Controleer https://savoraapp.com/partner.html, /faq.html, /cookie-policy.html, /terms-of-service.html, /contact.html" -ForegroundColor Cyan