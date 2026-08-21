// ============================================
// Savoraapp API - Cloudflare Worker v2.1.1
// - Backwards compatible met oude plaintext wachtwoorden
// - Ondersteunt BEIDE KV structuren (oud array + nieuw per-key)
// - Automatische migratie bij eerste login
// - GitHub Actions auto-deploy test
// ============================================

// ----- Password Hashing (SHA-256) -----
async function hashPassword(password) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(password + 'savoraapp_salt_2026')
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyPassword(input, stored) {
  // Ondersteunt BEIDE: plaintext (oud) en gehashed (nieuw)
  if (!stored) return false;
  const isHashed = stored.length === 64 && /^[0-9a-f]+$/.test(stored);
  if (isHashed) {
    const hashed = await hashPassword(input);
    return hashed === stored;
  }
  // Oude plaintext vergelijking — migratie volgt na succesvolle login
  return input === stored;
}

// ----- JWT -----
async function jwtSign(payload, secret, expiresIn = 604800) {
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET ontbreekt of is te kort (minimaal 16 tekens vereist)');
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresIn;
  const body = btoa(JSON.stringify({ ...payload, iat: now, exp }));
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`));
  return `${header}.${body}.${btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')}`;
}

async function jwtVerify(token, secret) {
  if (!secret || secret.length < 16) return null;
  try {
    const [h, b, s] = token.split('.');
    if (!h || !b || !s) return null;
    const sig = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = sig.length % 4 ? '='.repeat(4 - sig.length % 4) : '';
    const sigBuf = Uint8Array.from(atob(sig + pad), c => c.charCodeAt(0));
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const valid = await crypto.subtle.verify('HMAC', key, sigBuf.buffer, encoder.encode(`${h}.${b}`));
    if (!valid) return null;
    const payload = JSON.parse(atob(b));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ----- CORS -----
function corsHeaders(origin) {
  // Sommige browsers sturen een punt achter het domein (bv. savoraapp.com.) — die negeren we bij de check.
  const normOrigin = (origin || '').replace(/\.(:\d+)?$/, '$1');
  const allowed = [
    'https://savoraapp.com',
    'https://www.savoraapp.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://savoraapp.sparkling-scene-16e3.workers.dev',
    'https://api.savoraapp.com'
  ];
  const allowedPatterns = [
    /^https:\/\/[^.]+\.savoraapp-eh5\.pages\.dev$/,
    /^https:\/\/[^.]+\.savoraapp\.pages\.dev$/,
    /^https:\/\/[^.]+\.savoraapp\.workers\.dev$/
  ];
  const isAllowed = allowed.includes(normOrigin) || allowedPatterns.some(p => p.test(normOrigin));
  // Geef de ORIGINELE origin terug (met punt), zodat de browser-match klopt.
  const allowedOrigin = isAllowed ? origin : 'https://savoraapp.com';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Partner-Token, X-Admin-Token',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400'
  };
}

function jsonResponse(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
}

// ============================================
// KV HELPERS — ondersteunt BEIDE structuren
// Oud: db.get('partners') → array
// Nieuw: db.get('partner_id:xxx') → object per key
// ============================================

async function getOldPartnersArray(db) {
  try {
    const data = await db.get('partners');
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function getPartnerByEmail(db, email) {
  const emailKey = email.toLowerCase().trim();
  // Zoek eerst in nieuwe structuur
  try {
    const data = await db.get('partner_email:' + emailKey);
    if (data) return JSON.parse(data);
  } catch {}
  // Fallback naar oude array structuur
  const old = await getOldPartnersArray(db);
  return old.find(p =>
    (p.contact || '').toLowerCase() === emailKey ||
    (p.email || '').toLowerCase() === emailKey
  ) || null;
}

async function getPartnerById(db, id) {
  // Zoek eerst in nieuwe structuur
  try {
    const data = await db.get('partner_id:' + id);
    if (data) return JSON.parse(data);
  } catch {}
  // Fallback naar oude array structuur
  const old = await getOldPartnersArray(db);
  return old.find(p => p.id === id) || null;
}

async function savePartner(db, partner) {
  const p = { ...partner };
  // Sla op in nieuwe structuur
  await db.put('partner_id:' + p.id, JSON.stringify(p));
  const emailKey = (p.contact || p.email || '').toLowerCase().trim();
  if (emailKey) await db.put('partner_email:' + emailKey, JSON.stringify(p));

  // Update ook de oude array zodat oude code blijft werken
  try {
    const old = await getOldPartnersArray(db);
    const idx = old.findIndex(x => x.id === p.id);
    if (idx >= 0) old[idx] = p;
    else old.push(p);
    await db.put('partners', JSON.stringify(old));
  } catch {}
}

async function getAllPartners(db) {
  // Probeer nieuwe structuur
  try {
    const list = await db.list({ prefix: 'partner_id:' });
    if (list.keys.length > 0) {
      const partners = await Promise.all(
        list.keys.map(async k => {
          try {
            const v = await db.get(k.name);
            return v ? JSON.parse(v) : null;
          } catch { return null; }
        })
      );
      return partners.filter(Boolean);
    }
  } catch {}
  // Fallback naar oude array
  return getOldPartnersArray(db);
}

// ----- Rate Limiting (KV-based, gedeeld over alle Cloudflare-nodes) -----
// Een in-memory Map werkt niet betrouwbaar op Workers: elk isolate/node heeft zijn
// eigen geheugen, dus een aanvaller kan de limiet omzeilen door andere nodes te raken.
// KV is gedeeld. De minimale TTL van KV is 60s, dus windows worden daarop afgerond.
async function checkRateLimit(db, key, max = 5, windowMs = 900000) {
  const now = Date.now();
  const kvKey = 'ratelimit_' + key;
  try {
    let entry = null;
    const raw = await db.get(kvKey);
    if (raw) { try { entry = JSON.parse(raw); } catch { entry = null; } }
    if (!entry || now > entry.reset) {
      entry = { count: 1, reset: now + windowMs };
      await db.put(kvKey, JSON.stringify(entry), { expirationTtl: Math.max(60, Math.ceil(windowMs / 1000)) });
      return true;
    }
    if (entry.count >= max) return false;
    entry.count++;
    const ttl = Math.max(60, Math.ceil((entry.reset - now) / 1000));
    await db.put(kvKey, JSON.stringify(entry), { expirationTtl: ttl });
    return true;
  } catch (err) {
    // Als KV faalt, blokkeer de gebruiker niet — log en laat door
    console.error('[RATELIMIT] KV-fout, request toegelaten:', err.message);
    return true;
  }
}

// ----- Auth -----
async function getAuthToken(req) {
  const auth = req.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return (req.headers.get('X-Partner-Token') || req.headers.get('X-Admin-Token') || '').trim() || null;
}

async function isPartnerAuthorized(req, env) {
  const token = await getAuthToken(req);
  if (!token) return null;
  const decoded = await jwtVerify(token, env.JWT_SECRET);
  return decoded && decoded.role === 'partner' ? decoded : null;
}

async function isAdminAuthorized(req, env) {
  const token = await getAuthToken(req);
  if (!token) return null;
  const decoded = await jwtVerify(token, env.JWT_SECRET);
  return decoded && decoded.role === 'admin' ? decoded : null;
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============================================
// NO-SHOW TRACKING & TIJDELIJKE BLOKKADE
// Beleid: 3 no-shows binnen 60 dagen -> 30 dagen geblokkeerd voor nieuwe reserveringen.
// Bewaard per genormaliseerd telefoonnummer EN per e-mailadres (beide worden gecontroleerd),
// zodat blokkeren betrouwbaar werkt ongeacht welk veld de klant gebruikt.
// ============================================
const NOSHOW_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;   // 60 dagen: telt no-shows binnen dit venster
const NOSHOW_BLOCK_MS = 30 * 24 * 60 * 60 * 1000;    // 30 dagen: duur van de blokkade
const NOSHOW_STRIKES = 3;                             // aantal no-shows voordat blokkade ingaat
const NOSHOW_TTL_SEC = 7776000;                       // 90 dagen KV-TTL (venster + blokkade + marge)
const PICKUP_GRACE_MS = 3 * 60 * 60 * 1000;           // 3 uur respijt na sluitingstijd voor auto-no-show

function normPhone(p) { return String(p || '').replace(/\D/g, ''); }
function normEmail(e) { return String(e || '').toLowerCase().trim(); }

function noShowKeys(phone, email) {
  const keys = [];
  const p = normPhone(phone);
  const e = normEmail(email);
  if (p) keys.push('p:' + p);
  if (e) keys.push('e:' + e);
  return keys;
}

async function getNoShowRecord(db, key) {
  try {
    const raw = await db.get('noshow_' + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Controleert of telefoon/e-mail momenteel geblokkeerd is. Geeft blockedUntil (ms) terug, of null.
async function checkNoShowBlock(db, phone, email) {
  const now = Date.now();
  const keys = noShowKeys(phone, email);
  let blockedUntil = null;
  for (const k of keys) {
    const rec = await getNoShowRecord(db, k);
    if (rec && rec.blockedUntil && rec.blockedUntil > now) {
      if (!blockedUntil || rec.blockedUntil > blockedUntil) blockedUntil = rec.blockedUntil;
    }
  }
  return blockedUntil;
}

// Registreert een no-show voor telefoon/e-mail en blokkeert bij de 3e binnen het venster.
async function registerNoShow(db, phone, email) {
  const now = Date.now();
  const keys = noShowKeys(phone, email);
  let blockedUntil = null;
  for (const k of keys) {
    let rec = await getNoShowRecord(db, k);
    if (!rec || typeof rec !== 'object') rec = { events: [] };
    rec.events = (Array.isArray(rec.events) ? rec.events : []).filter(function(t) { return now - t < NOSHOW_WINDOW_MS; });
    rec.events.push(now);
    rec.count = rec.events.length;
    if (rec.count >= NOSHOW_STRIKES) {
      rec.blockedUntil = now + NOSHOW_BLOCK_MS;
      if (!blockedUntil || rec.blockedUntil > blockedUntil) blockedUntil = rec.blockedUntil;
    }
    try { await db.put('noshow_' + k, JSON.stringify(rec), { expirationTtl: NOSHOW_TTL_SEC }); } catch (e) {}
  }
  return blockedUntil;
}

// Lazy no-show detectie: bij elke keer dat een partner zijn claims opvraagt, worden
// verlopen 'pending' reserveringen (pickupDeadline + respijt < nu) automatisch op
// 'no_show' gezet en meegeteld voor de blokkade. Geen Cron Trigger nodig.
async function reconcileNoShows(db, leads) {
  const now = Date.now();
  let changed = false;
  for (let i = 0; i < leads.length; i++) {
    const l = leads[i];
    if (l && l.type === 'deal_claim' && (!l.status || l.status === 'pending') && l.pickupDeadline) {
      const deadline = new Date(l.pickupDeadline).getTime();
      if (!isNaN(deadline) && now > deadline + PICKUP_GRACE_MS) {
        l.status = 'no_show';
        l.statusUpdatedAt = new Date().toISOString();
        l.autoDetected = true;
        changed = true;
        try { await registerNoShow(db, l.phone, l.email); } catch (e) {}
      }
    }
  }
  if (changed) {
    try { await db.put('leads', JSON.stringify(leads)); } catch (e) {}
  }
  return leads;
}

// ============================================
// PAYSERA WebToPay (echte betaalverificatie)
// ============================================

// Pure-JS MD5 (Workers heeft geen ingebouwde MD5) — getest tegen bekende vectoren
function md5(inputStr) {
  function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
  function rol(x, c) { return (x << c) | (x >>> (32 - c)); }
  const bytes = new TextEncoder().encode(inputStr);
  const origLenBits = bytes.length * 8;
  const withOne = bytes.length + 1;
  const padLen = (((withOne + 8) + 63) & ~63) - bytes.length;
  const msg = new Uint8Array(bytes.length + padLen);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  const dv = new DataView(msg.buffer);
  dv.setUint32(msg.length - 8, origLenBits >>> 0, true);
  dv.setUint32(msg.length - 4, Math.floor(origLenBits / 0x100000000) >>> 0, true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
             4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const K = [];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  for (let off = 0; off < msg.length; off += 64) {
    const M = [];
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = add32(add32(add32(F, A), K[i]), M[g]);
      A = D; D = C; C = B;
      B = add32(B, rol(F, S[i]));
    }
    a0 = add32(a0, A); b0 = add32(b0, B); c0 = add32(c0, C); d0 = add32(d0, D);
  }
  function hex(n) { let s = ''; for (let i = 0; i < 4; i++) s += ((n >>> (i * 8)) & 0xFF).toString(16).padStart(2, '0'); return s; }
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

const PAYSERA_PROJECT_ID = '256849';
const PAYSERA_PAY_URL = 'https://www.paysera.com/pay/';

// URL-veilige base64 zoals Paysera (+ → -, / → _)
function payseraBase64Encode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_');
}
function payseraBase64Decode(str) {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

// Bouw de ondertekende redirect naar Paysera
function buildPayseraPaymentUrl(params, signPassword) {
  const query = Object.keys(params)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&');
  const data = payseraBase64Encode(query);
  const sign = md5(data + signPassword);
  return PAYSERA_PAY_URL + '?data=' + encodeURIComponent(data) + '&sign=' + encodeURIComponent(sign);
}

// Parse de 'data' uit een callback terug naar een object
function parsePayseraData(dataParam) {
  const decoded = payseraBase64Decode(dataParam);
  const out = {};
  for (const pair of decoded.split('&')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    out[decodeURIComponent(pair.slice(0, idx))] = decodeURIComponent(pair.slice(idx + 1));
  }
  return out;
}

// ============================================
// CREDIT SYSTEM
// ============================================

const CREDIT_PACKAGES = {
  basic:    { id: 'basic',    name: 'Pako Baze',     credits: 20,  price: 500,  usd: 5.50,  label: 'Pako Baze' },
  standard: { id: 'standard', name: 'Pako Standarte', credits: 50,  price: 1000, usd: 11.00, label: 'Pako Standarte' },
  premium:  { id: 'premium',  name: 'Pako Premium',   credits: 120, price: 1800, usd: 20.00, label: 'Pako Premium' }
};

const CREDIT_EXPIRY_DAYS = 90;
const POST_COST = 1; // 1 credit per post
const POST_VISIBILITY_HOURS = 24;

// ----- Credit Helpers -----

async function getCreditBalance(db, partnerId) {
  // Bereken uit actieve pakketten (de bron van waarheid).
  // Een partner-record is hiervoor niet nodig — de pakketten staan los opgeslagen.
  const packages = await getActiveCreditPackages(db, partnerId);
  return packages.reduce((sum, pkg) => sum + pkg.remainingCredits, 0);
}

async function getActiveCreditPackages(db, partnerId) {
  const prefix = 'creditpkg_' + partnerId + '_';
  const keys = await db.list({ prefix });
  const now = Date.now();
  const packages = [];
  for (const key of keys.keys || []) {
    try {
      const pkg = JSON.parse(await db.get(key.name));
      if (pkg.expiresAt > now && pkg.remainingCredits > 0) {
        pkg.daysRemaining = Math.ceil((pkg.expiresAt - now) / (1000 * 60 * 60 * 24));
        packages.push(pkg);
      }
    } catch (e) { /* skip invalid */ }
  }
  return packages.sort((a, b) => a.purchasedAt - b.purchasedAt); // FIFO
}

async function deductCredit(db, partnerId, adId, adType, costMultiplier = 1) {
  const totalCost = POST_COST * costMultiplier;
  const packages = await getActiveCreditPackages(db, partnerId);
  if (packages.length === 0) return { success: false, error: 'Geen actieve credits' };
  
  // Check total available credits
  const totalAvailable = packages.reduce((sum, p) => sum + p.remainingCredits, 0);
  if (totalAvailable < totalCost) return { success: false, error: 'Niet genoeg credits. Nodig: ' + totalCost };
  
  // Deduct across packages (FIFO)
  let remainingToDeduct = totalCost;
  for (const pkg of packages) {
    if (remainingToDeduct <= 0) break;
    const deductFromPkg = Math.min(pkg.remainingCredits, remainingToDeduct);
    pkg.remainingCredits -= deductFromPkg;
    pkg.usedCredits += deductFromPkg;
    remainingToDeduct -= deductFromPkg;
    await db.put('creditpkg_' + partnerId + '_' + pkg.purchaseId, JSON.stringify(pkg));
  }
  
  const transactionId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const transaction = {
    id: transactionId,
    partnerId,
    adId,
    adType,
    creditsUsed: totalCost,
    postedAt: Date.now(),
    expiresAt: Date.now() + (POST_VISIBILITY_HOURS * 60 * 60 * 1000),
    status: 'active'
  };
  
  await db.put('credittx_' + transactionId, JSON.stringify(transaction));
  await db.put('partner_txs_' + partnerId + '_' + transactionId, JSON.stringify(transaction));
  
  // Update partner total credits
  const partner = await getPartnerById(db, partnerId);
  if (partner) {
    partner.credits = Math.max(0, (partner.credits || 0) - totalCost);
    await savePartner(db, partner);
  }
  
  return { success: true, transaction, remainingCredits: totalAvailable - totalCost };
}

async function purchaseCreditPackage(db, partnerId, packageKey, paymentRef) {
  const pkgDef = CREDIT_PACKAGES[packageKey];
  if (!pkgDef) return { success: false, error: 'Ongeldig pakket' };
  
  const purchaseId = 'purchase_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const now = Date.now();
  const expiresAt = now + (CREDIT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  
  const pkg = {
    id: pkgDef.id,
    purchaseId,
    partnerId,
    name: pkgDef.name,
    totalCredits: pkgDef.credits,
    remainingCredits: pkgDef.credits,
    usedCredits: 0,
    price: pkgDef.price,
    purchasedAt: now,
    expiresAt,
    paymentRef,
    status: 'active'
  };
  
  await db.put('creditpkg_' + partnerId + '_' + purchaseId, JSON.stringify(pkg));
  
  // Update partner total credits
  const partner = await getPartnerById(db, partnerId);
  if (partner) {
    partner.credits = (partner.credits || 0) + pkgDef.credits;
    await savePartner(db, partner);
  }
  
  return { success: true, package: pkgDef, purchaseId, credits: pkgDef.credits, expiresAt };
}

// ----- Promocode Helpers -----
async function validatePromo(db, code) {
  if (!code) return { valid: false };
  const key = 'promo_' + String(code).trim().toUpperCase();
  let p;
  try { const raw = await db.get(key); p = raw ? JSON.parse(raw) : null; } catch { p = null; }
  if (!p || p.active === false) return { valid: false };
  if (p.expiresAt && Date.now() > p.expiresAt) return { valid: false };
  if (p.maxUses && (p.usedCount || 0) >= p.maxUses) return { valid: false };
  return { valid: true, percent: p.percent, code: p.code || String(code).trim().toUpperCase() };
}
async function incrementPromoUse(db, code) {
  if (!code) return;
  const key = 'promo_' + String(code).trim().toUpperCase();
  try {
    const raw = await db.get(key);
    const p = raw ? JSON.parse(raw) : null;
    if (p) { p.usedCount = (p.usedCount || 0) + 1; await db.put(key, JSON.stringify(p)); }
  } catch { /* negeer */ }
}
// Past korting toe op een basisprijs; geeft {amount, percent, code} terug (ruw, afronden per kanaal)
async function applyPromo(db, basePrice, code) {
  if (!code) return { amount: basePrice, percent: 0, code: null };
  const pr = await validatePromo(db, code);
  if (!pr.valid) return { amount: basePrice, percent: 0, code: null };
  const amount = basePrice * (1 - pr.percent / 100);
  return { amount, percent: pr.percent, code: pr.code };
}

// ----- PayPal Helpers -----
function paypalBase(env) {
  return (env.PAYPAL_ENV === 'live') ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}
async function getPayPalAccessToken(env) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET) return null;
  const auth = btoa(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_SECRET);
  const res = await fetch(paypalBase(env) + '/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

async function getCreditTransactions(db, partnerId) {
  const prefix = 'partner_txs_' + partnerId + '_';
  const keys = await db.list({ prefix });
  const transactions = [];
  for (const key of keys.keys || []) {
    try {
      const tx = JSON.parse(await db.get(key.name));
      transactions.push(tx);
    } catch (e) { /* skip invalid */ }
  }
  return transactions.sort((a, b) => b.postedAt - a.postedAt);
}

async function expireOldCredits(db) {
  const now = Date.now();
  // This would be called by a cron job - simplified version
  const allKeys = await db.list({ prefix: 'creditpkg_' });
  let expiredCount = 0;
  for (const key of allKeys.keys || []) {
    try {
      const pkg = JSON.parse(await db.get(key.name));
      if (pkg.expiresAt < now && pkg.remainingCredits > 0) {
        pkg.status = 'expired';
        pkg.remainingCredits = 0;
        await db.put(key.name, JSON.stringify(pkg));
        expiredCount++;
      }
    } catch (e) { /* skip */ }
  }
  return expiredCount;
}

// ===== MAIN ROUTER =====
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const origin = request.headers.get('Origin') || '';
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  // Redirect root to frontend (Pages)
  if (path === '/' || path === '') {
    return Response.redirect('https://main.savoraapp-eh5.pages.dev', 302);
  }

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // ===== BODY PARSING (robuust) =====
  let body = {};
  if (['POST', 'PATCH', 'PUT'].includes(method)) {
    try {
      const ct = request.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        body = await request.json();
      } else {
        // Fallback: probeer JSON te parsen uit raw body
        const text = await request.text();
        body = JSON.parse(text);
      }
    } catch (err) {
      console.log('[BODY PARSE] Error:', err.message);
      body = {};
    }
  }

  const db = env.VERIFICATION_KV;

  // ---- HEALTH ----
  if (path === '/api/health') {
    return jsonResponse({ status: 'ok', version: '2.22.0-promo', time: new Date().toISOString() }, 200, origin);
  }

  // ---- PAYSERA DOMEINVERIFICATIE ----
  // Paysera haalt de root van api.savoraapp.com op en zoekt deze meta-tag om eigendom te bevestigen.
  if (path === '/' || path === '') {
    return new Response(
      '<!DOCTYPE html><html><head><meta name="verify-paysera" content="39ffaa4a0a96b7334c68bf29f1f24704"><title>Savoraapp API</title></head><body>Savoraapp API</body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  // ---- PAYSERA: bestand-verificatie (alternatieve methode) ----
  if (path === '/paysera_39ffaa4a0a96b7334c68bf29f1f24704.html') {
    return new Response('39ffaa4a0a96b7334c68bf29f1f24704', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // ---- API INFO ----
  if (path === '/api' || (method === 'GET' && path === '/api/')) {
    return jsonResponse({
      status: 'Savoraapp API v2.1',
      compatible: 'Backwards compatible met v1 KV data',
      endpoints: [
        'POST /api/partner/register',
        'POST /api/partner/verify',
        'POST /api/partner/resend',
        'POST /api/partner/login',
        'GET  /api/partner/session',
        'POST /api/partner/logout',
        'POST /api/partner/forgot-password',
        'POST /api/partner/invoice',
        'GET  /api/partner/invoices',
        'GET  /api/credits/:partnerId',
        'POST /api/credits/purchase',
        'POST /api/contact',
        'POST /api/admin/login',
        'GET  /api/admin/data',
        'POST /api/admin/delete-partner',
        'POST /api/admin/credits',
        'POST /api/analytics',
        'POST /api/paysera/create-payment'
      ]
    }, 200, origin);
  }

  // ============================================
  // REGISTER
  // ============================================
  if (path === '/api/partner/register' && method === 'POST') {
    const business = body.business;
    const contact = (body.contact || body.email || '').toLowerCase().trim();
    const password = body.password;
    const nipt = body.nipt || body.nui || '';
    const city = body.city || '';
    const name = body.name || business;
    const phone = body.phone || '';

    if (!business || !contact || !password) {
      return jsonResponse({ error: 'Business, email en wachtwoord zijn verplicht' }, 400, origin);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
      return jsonResponse({ error: 'Ongeldig emailadres' }, 400, origin);
    }
    if (password.length < 6) {
      return jsonResponse({ error: 'Wachtwoord minimaal 6 tekens' }, 400, origin);
    }

    const existing = await getPartnerByEmail(db, contact);
    if (existing) return jsonResponse({ error: 'Email bestaat al' }, 409, origin);

    const code = generateCode();
    const partner = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      business, contact, name, phone,
      nipt,
      nui: nipt,
      city,
      password: await hashPassword(password),
      code,
      codeExpires: Date.now() + (35 * 24 * 60 * 60 * 1000),
      status: 'pending',
      verified: false,
      credits: 5,
      creditHistory: [],
      welcomeBonusGiven: true,
      createdAt: new Date().toISOString()
    };

    // Welkomstbonus: 5 gratis credits als eerste (gratis) creditpakket
    try {
      const wbId = 'welcome_' + Date.now();
      await db.put('creditpkg_' + partner.id + '_' + wbId, JSON.stringify({
        id: 'welcome', purchaseId: wbId, partnerId: partner.id,
        name: 'Welcome Bonus', totalCredits: 5, remainingCredits: 5, usedCredits: 0,
        price: 0, purchasedAt: Date.now(),
        expiresAt: Date.now() + (CREDIT_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        paymentRef: 'welcome_bonus', status: 'active', isWelcomeBonus: true
      }));
      console.log('[REGISTER] 5 welkomstcredits toegekend aan', partner.id);
    } catch (e) { console.error('[REGISTER] welkomstbonus fout:', e.message); }

    // Stuur de verificatiecode via Resend en WACHT op het resultaat,
    // zodat fouten zichtbaar zijn (geen stille .catch meer).
    let emailSent = false;
    let emailError = null;
    if (!env.RESEND_API_KEY) {
      emailError = 'RESEND_API_KEY ontbreekt op de server';
      console.error('[REGISTER] ' + emailError);
    } else {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + env.RESEND_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Savoraapp <noreply@savoraapp.com>',
            to: contact,
            subject: 'Jouw verificatiecode voor Savoraapp',
            html: `<h2>Welkom bij Savoraapp!</h2><p>Jouw verificatiecode is: <strong>${code}</strong></p><p>Deze code is 35 dagen geldig.</p>`
          })
        });
        if (r.ok) {
          emailSent = true;
          console.log('[REGISTER] Verificatiemail verstuurd naar', contact);
        } else {
          const errBody = await r.text();
          emailError = 'Resend HTTP ' + r.status + ': ' + errBody.slice(0, 400);
          console.error('[REGISTER] Resend weigerde de mail:', emailError);
        }
      } catch (e) {
        emailError = 'Netwerkfout naar Resend: ' + e.message;
        console.error('[REGISTER] Resend exception:', e.message);
      }
    }

    // Bewaar de e-mailstatus op de partner (zichtbaar voor diagnose)
    partner.emailSent = emailSent;
    partner.emailError = emailError;
    await savePartner(db, partner);

    return jsonResponse({
      success: true,
      emailSent: emailSent,
      emailError: emailSent ? null : emailError,
      message: emailSent
        ? 'Registratie ontvangen. Controleer je e-mail voor de verificatiecode.'
        : ('Account aangemaakt, maar de verificatiemail kon niet worden verstuurd: ' + (emailError || 'onbekende fout')),
      needsVerification: true,
      id: partner.id
    }, 200, origin);
  }

  // ============================================
  // VERIFY
  // ============================================
  if (path === '/api/partner/verify' && method === 'POST') {
    const email = (body.email || body.contact || '').toLowerCase().trim();
    const code = body.code;
    const id = body.id;

    if (!code) return jsonResponse({ error: 'Code is verplicht' }, 400, origin);

    let partner = email ? await getPartnerByEmail(db, email) : null;
    if (!partner && id) partner = await getPartnerById(db, id);
    if (!partner) return jsonResponse({ error: 'Partner niet gevonden' }, 404, origin);
    // Allow re-verification even if already verified (idempotent)

    if (partner.codeExpires && Date.now() > partner.codeExpires) {
      return jsonResponse({ error: 'Code verlopen. Vraag een nieuwe aan.' }, 400, origin);
    }
    if (partner.code !== code) {
      return jsonResponse({ error: 'Ongeldige verificatiecode' }, 400, origin);
    }

    partner.verified = true;
    partner.status = 'active';
    partner.role = 'partner';
    partner.activatedAt = new Date().toISOString();
    partner.code = null;

    await savePartner(db, partner);

    const token = await jwtSign(
      { partnerId: partner.id, role: 'partner', email: partner.contact },
      env.JWT_SECRET,
      604800
    );

    return jsonResponse({
      success: true,
      token,
      partnerId: partner.id,
      message: 'Account geverifieerd! Je kunt nu inloggen.',
      name: partner.name || partner.business,
      business: partner.business,
      email: partner.contact,
      nui: partner.nipt || partner.nui || '',
      nipt: partner.nipt || partner.nui || '',
      credits: partner.credits || 0
    }, 200, origin);
  }

  // ============================================
  // RESEND CODE
  // ============================================
  if (path === '/api/partner/resend' && method === 'POST') {
    if (!(await checkRateLimit(db, 'resend_' + ip, 3, 3600000))) {
      return jsonResponse({ error: 'Te veel verzoeken. Wacht een uur.' }, 429, origin);
    }

    const email = (body.email || body.contact || '').toLowerCase().trim();
    const id = body.id;

    let partner = email ? await getPartnerByEmail(db, email) : null;
    if (!partner && id) partner = await getPartnerById(db, id);
    if (!partner) return jsonResponse({ error: 'Niet gevonden' }, 404, origin);
    // Allow re-verification even if already verified (idempotent)

    const newCode = generateCode();
    partner.code = newCode;
    partner.codeExpires = Date.now() + (35 * 24 * 60 * 60 * 1000);
    await savePartner(db, partner);

    // Stuur email via Resend
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + env.RESEND_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Savoraapp <noreply@savoraapp.com>',
          to: partner.contact,
          subject: 'Nieuwe verificatiecode voor Savoraapp',
          html: `<h2>Nieuwe code</h2><p>Jouw nieuwe verificatiecode is: <strong>${newCode}</strong></p>`
        })
      });
    } catch (e) {
      console.log('[DEV] Email verzenden mislukt, code:', newCode);
    }

    return jsonResponse({ success: true, message: 'Nieuwe code verstuurd' }, 200, origin);
  }

  // ============================================
  // LOGIN — met automatische wachtwoord migratie
  // ============================================
  if (path === '/api/partner/login' && method === 'POST') {
    console.log('[LOGIN] Request received from IP:', ip, 'Origin:', origin);
    console.log('[LOGIN] Body keys:', Object.keys(body));

    if (!(await checkRateLimit(db, 'login_' + ip, 5, 900000))) {
      console.log('[LOGIN] Rate limited for IP:', ip);
      return jsonResponse({ error: 'Te veel pogingen. Wacht 15 minuten.' }, 429, origin);
    }

    const email = (body.email || body.contact || '').toLowerCase().trim();
    const password = body.password;

    console.log('[LOGIN] Email:', email, 'Password provided:', !!password);

    if (!email || !password) {
      return jsonResponse({ error: 'Email en wachtwoord zijn verplicht' }, 400, origin);
    }

    const partner = await getPartnerByEmail(db, email);
    if (!partner) {
      console.log('[LOGIN] Partner not found:', email);
      return jsonResponse({ error: 'Ongeldige inloggegevens' }, 401, origin);
    }

    console.log('[LOGIN] Partner found:', partner.business, 'Verified:', partner.verified, 'Status:', partner.status);

    // Check if partner is active - undefined verified counts as active for backwards compatibility
    var isVerified = partner.verified === true || partner.verified === undefined || partner.verified === null;
    if (!isVerified || partner.status !== 'active') {
      console.log('[LOGIN] Account not active for:', email, 'verified:', partner.verified, 'status:', partner.status);
      return jsonResponse({
        error: 'Account niet geverifieerd. Controleer je email.',
        needsVerification: true,
        partnerId: partner.id,
        contact: partner.contact
      }, 403, origin);
    }

    const passwordOk = await verifyPassword(password, partner.password);
    if (!passwordOk) {
      console.log('[LOGIN] Invalid password for:', email);
      return jsonResponse({ error: 'Ongeldige inloggegevens' }, 401, origin);
    }

    const isHashed = partner.password.length === 64 && /^[0-9a-f]+$/.test(partner.password);
    if (!isHashed) {
      partner.password = await hashPassword(password);
      await savePartner(db, partner);
      console.log(`[MIGRATIE] Wachtwoord gehashed voor: ${email}`);
    }

    const token = await jwtSign(
      { partnerId: partner.id, role: 'partner', email: partner.contact },
      env.JWT_SECRET,
      604800
    );

    console.log('[LOGIN] Success for:', email);
    return jsonResponse({
      success: true,
      token,
      partnerId: partner.id,
      name: partner.name || partner.business,
      business: partner.business,
      email: partner.contact,
      nui: partner.nipt || partner.nui || '',
      nipt: partner.nipt || partner.nui || '',
      credits: partner.credits || 0
    }, 200, origin);
  }

  // ============================================
  // SESSION CHECK
  // ============================================
  if (path === '/api/partner/session' && method === 'GET') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet ingelogd' }, 401, origin);

    const partner = await getPartnerById(db, decoded.partnerId);
    if (!partner) return jsonResponse({ error: 'Niet gevonden' }, 404, origin);
    if (!partner.verified) return jsonResponse({ error: 'Niet geverifieerd' }, 403, origin);

    return jsonResponse({
      success: true,
      partnerId: partner.id,
      name: partner.name || partner.business,
      business: partner.business,
      email: partner.contact,
      nui: partner.nipt || partner.nui || '',
      nipt: partner.nipt || partner.nui || '',
      credits: partner.credits || 0,
      verified: partner.verified,
      status: partner.status,
      role: partner.role || 'partner'
    }, 200, origin);
  }

  // ============================================
  // LOGOUT
  // ============================================
  if (path === '/api/partner/logout' && method === 'POST') {
    return jsonResponse({ success: true }, 200, origin);
  }

  // ============================================
  // WACHTWOORD VERGETEN
  // ============================================
  if (path === '/api/partner/forgot-password' && method === 'POST') {
    if (!(await checkRateLimit(db, 'forgot_' + ip, 3, 3600000))) {
      return jsonResponse({ error: 'Te veel verzoeken.' }, 429, origin);
    }
    const email = (body.email || '').toLowerCase().trim();
    if (email) {
      const partner = await getPartnerByEmail(db, email);
      if (partner) {
        const resetToken = generateCode() + generateCode();
        partner.resetToken = resetToken;
        partner.resetExpires = Date.now() + 3600000;
        await savePartner(db, partner);
        console.log(`[DEV] Reset token voor ${email}: ${resetToken}`);
      }
    }
    return jsonResponse({
      success: true,
      message: 'Als dit email bekend is, ontvang je instructies.'
    }, 200, origin);
  }

  // ============================================
  // WACHTWOORD RESETTEN
  // ============================================
  if (path === '/api/partner/reset-password' && method === 'POST') {
    const { token, password } = body;
    if (!token || !password || password.length < 6) {
      return jsonResponse({ error: 'Token en wachtwoord (min 6 tekens) zijn verplicht' }, 400, origin);
    }
    const partners = await getAllPartners(db);
    const partner = partners.find(p => p.resetToken === token && p.resetExpires > Date.now());
    if (!partner) return jsonResponse({ error: 'Ongeldige of verlopen token' }, 400, origin);

    partner.password = await hashPassword(password);
    partner.resetToken = null;
    partner.resetExpires = null;
    await savePartner(db, partner);

    return jsonResponse({ success: true, message: 'Wachtwoord bijgewerkt. Je kunt nu inloggen.' }, 200, origin);
  }

  // ============================================
  // FACTUREN OPSLAAN
  // ============================================
  if (path === '/api/partner/invoice' && method === 'POST') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

    const { items, clientName, clientNipt, clientAddress, subtotal, vat, total, currency } = body;
    if (!clientName || !items || !items.length) {
      return jsonResponse({ error: 'Klantnaam en artikelen zijn verplicht' }, 400, origin);
    }

    const invoiceId = 'INV-' + new Date().getFullYear() + '-' +
      String(Date.now()).slice(-6) + '-' +
      Math.random().toString(36).slice(2, 5).toUpperCase();

    const invoice = {
      invoiceId,
      partnerId: decoded.partnerId,
      clientName,
      clientNipt: clientNipt || '',
      clientAddress: clientAddress || '',
      items,
      subtotal: subtotal || 0,
      vat: vat || 0,
      total: total || 0,
      currency: currency || 'ALL',
      createdAt: new Date().toISOString()
    };

    const key = 'invoices:' + decoded.partnerId;
    let invoices = [];
    try {
      const existing = await db.get(key);
      invoices = existing ? JSON.parse(existing) : [];
    } catch { invoices = []; }

    invoices.push(invoice);
    await db.put(key, JSON.stringify(invoices));

    return jsonResponse({ success: true, invoiceId }, 200, origin);
  }

  // ============================================
  // FACTUREN OPHALEN
  // ============================================
  if (path === '/api/partner/invoices' && method === 'GET') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

    let invoices = [];
    try {
      const data = await db.get('invoices:' + decoded.partnerId);
      invoices = data ? JSON.parse(data) : [];
    } catch { invoices = []; }

    return jsonResponse({ success: true, invoices: invoices.reverse() }, 200, origin);
  }

  // ============================================
  // CREDIT PAKKETTEN LIJST
  // ============================================
  if (path === '/api/credits/packages' && method === 'GET') {
    return jsonResponse({
      success: true,
      packages: CREDIT_PACKAGES,
      expiryDays: CREDIT_EXPIRY_DAYS,
      postCost: POST_COST,
      postVisibilityHours: POST_VISIBILITY_HOURS
    }, 200, origin);
  }

  // ============================================
  // CREDITS OPHALEN (met pakket details)
  // ============================================
  if (path.startsWith('/api/credits/') && method === 'GET') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

    const partner = await getPartnerById(db, decoded.partnerId);
    const activePackages = await getActiveCreditPackages(db, decoded.partnerId);
    const transactions = await getCreditTransactions(db, decoded.partnerId);

    // Saldo uit de pakketten zelf — zo loopt het nooit uit de pas met een los veld
    const liveCredits = activePackages.reduce((sum, pkg) => sum + (pkg.remainingCredits || 0), 0);
    const welcomeBonusRemaining = activePackages
      .filter(pkg => pkg.isWelcomeBonus === true)
      .reduce((sum, pkg) => sum + (pkg.remainingCredits || 0), 0);

    return jsonResponse({
      success: true,
      credits: liveCredits,
      welcomeBonusRemaining,
      activePackages,
      transactions: transactions.slice(0, 50),
      postCost: POST_COST,
      postVisibilityHours: POST_VISIBILITY_HOURS,
      expiryDays: CREDIT_EXPIRY_DAYS
    }, 200, origin);
  }

  // ============================================
  // CREDITS KOPEN (nieuw pakket systeem)
  // ============================================
  if (path === '/api/credits/purchase' && method === 'POST') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

    const { package: packageKey, paymentRef } = body;
    if (!packageKey) {
      return jsonResponse({ error: 'Pakket is verplicht' }, 400, origin);
    }

    const result = await purchaseCreditPackage(db, decoded.partnerId, packageKey, paymentRef || 'manual');
    if (!result.success) return jsonResponse(result, 400, origin);

    return jsonResponse(result, 200, origin);
  }

  // ============================================
  // CREDIT GEBRUIKEN BIJ PUBLICATIE
  // ============================================
  if (path === '/api/credits/use' && method === 'POST') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

    const { adId, adType } = body;
    if (!adId || !adType) {
      return jsonResponse({ error: 'adId en adType zijn verplicht' }, 400, origin);
    }

    // Premium ads cost 3 credits, daily deals cost 1 credit
    const costMultiplier = (adType === 'premium_ad' || adType === 'advertentie') ? 3 : 1;

    const result = await deductCredit(db, decoded.partnerId, adId, adType, costMultiplier);
    if (!result.success) return jsonResponse(result, 400, origin);

    return jsonResponse(result, 200, origin);
  }

  // ============================================
  // AANBIEDINGEN (DEALS)
  // ============================================
  // Partner plaatst een aanbieding — kost 1 credit
  if (path === '/api/deals' && method === 'POST') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

    const { title, description, category, city, address, originalPrice, dealPrice, quantity, expiresAt, imageUrl, lat, lng } = body;
    if (!title || (dealPrice === undefined || dealPrice === null || dealPrice === '') || !address || !String(address).trim()) {
      return jsonResponse({ error: 'Titel, aanbiedingsprijs en adres zijn verplicht' }, 400, origin);
    }

    const dealId = 'deal_' + Date.now() + Math.random().toString(36).slice(2, 6);

    // 1 credit per plaatsing (de 5 welkomstcredits dekken de eerste 5 gratis)
    const credit = await deductCredit(db, decoded.partnerId, dealId, 'daily_deal', 1);
    if (!credit.success) return jsonResponse({ error: credit.error || 'Onvoldoende credits' }, 400, origin);
    const partner = await getPartnerById(db, decoded.partnerId);
    const expiry = expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const deal = {
      id: dealId,
      partnerId: decoded.partnerId,
      partnerName: partner ? (partner.business || partner.name || '') : '',
      title: title,
      description: description || '',
      category: category || '',
      city: city || (partner ? partner.city : '') || '',
      address: String(address).trim(),
      originalPrice: originalPrice || null,
      dealPrice: dealPrice,
      quantity: quantity || null,
      imageUrl: imageUrl || '',
      lat: (lat !== undefined && lat !== null && lat !== '') ? lat : null,
      lng: (lng !== undefined && lng !== null && lng !== '') ? lng : null,
      createdAt: new Date().toISOString(),
      expiresAt: expiry,
      active: true
    };

    let deals = [];
    try { const ex = await db.get('deals'); deals = ex ? JSON.parse(ex) : []; } catch { deals = []; }
    deals.push(deal);
    await db.put('deals', JSON.stringify(deals));
    return jsonResponse({ success: true, deal: deal }, 200, origin);
  }

  // Publiek: actieve aanbiedingen voor klanten
  if (path === '/api/deals' && method === 'GET') {
    let deals = [];
    try { const ex = await db.get('deals'); deals = ex ? JSON.parse(ex) : []; } catch { deals = []; }
    const now = Date.now();
    const active = deals.filter(function(d) {
      if (d.active === false) return false;
      if (d.expiresAt && new Date(d.expiresAt).getTime() < now) return false;
      return true;
    }).sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    return jsonResponse({ success: true, count: active.length, deals: active }, 200, origin);
  }

  // Partner: eigen aanbiedingen
  if (path === '/api/deals/mine' && method === 'GET') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);
    let deals = [];
    try { const ex = await db.get('deals'); deals = ex ? JSON.parse(ex) : []; } catch { deals = []; }
    const mine = deals.filter(function(d) { return d.partnerId === decoded.partnerId; })
      .sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    return jsonResponse({ success: true, count: mine.length, deals: mine }, 200, origin);
  }

  // Partner: aanbieding stoppen (alleen eigen)
  if (path === '/api/deals/delete' && method === 'POST') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);
    const dealId = body.dealId || body.id;
    if (!dealId) return jsonResponse({ error: 'dealId is verplicht' }, 400, origin);
    let deals = [];
    try { const ex = await db.get('deals'); deals = ex ? JSON.parse(ex) : []; } catch { deals = []; }
    let found = false;
    deals = deals.map(function(d) {
      if (d.id === dealId && d.partnerId === decoded.partnerId) { found = true; d.active = false; d.stoppedAt = new Date().toISOString(); }
      return d;
    });
    if (!found) return jsonResponse({ error: 'Aanbieding niet gevonden' }, 404, origin);
    await db.put('deals', JSON.stringify(deals));
    return jsonResponse({ success: true }, 200, origin);
  }

  // Partner: wie heeft mijn aanbiedingen geclaimd
  if (path === '/api/deals/claims' && method === 'GET') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);
    let deals = [];
    try { const ex = await db.get('deals'); deals = ex ? JSON.parse(ex) : []; } catch { deals = []; }
    const myDealIds = deals.filter(function(d) { return d.partnerId === decoded.partnerId; }).map(function(d) { return d.id; });
    let adsForClaims = [];
    try { const exa = await db.get('ads'); adsForClaims = exa ? JSON.parse(exa) : []; } catch { adsForClaims = []; }
    const myAdIds = adsForClaims.filter(function(a) { return a.partnerId === decoded.partnerId; }).map(function(a) { return a.id; });
    const myIds = myDealIds.concat(myAdIds);
    let leads = [];
    try { const ex = await db.get('leads'); leads = ex ? JSON.parse(ex) : []; } catch { leads = []; }
    leads = await reconcileNoShows(db, leads);
    const claims = leads.filter(function(l) { return l.type === 'deal_claim' && myIds.indexOf(l.dealId) !== -1; })
      .sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    return jsonResponse({ success: true, count: claims.length, claims: claims }, 200, origin);
  }

  // ============================================
  // REKLAMA TË PROMOVUARA (PREMIUM ADS) — zichtbaar voor klanten
  // ============================================
  // Partner plaatst een promotie — kost 3 credits, 7 dagen zichtbaar
  if (path === '/api/ads' && method === 'POST') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

    const { title, description, price, category, imageUrl, plan } = body;
    if (!title || !String(title).trim()) {
      return jsonResponse({ error: 'Titel is verplicht' }, 400, origin);
    }

    const adId = 'ad_' + Date.now() + Math.random().toString(36).slice(2, 6);

    // Plan: 48 uur = 3 credits, 7 dagen = 5 credits
    const planCfg = (plan === '7d') ? { credits: 5, days: 7, key: '7d' } : { credits: 3, days: 2, key: '48h' };
    const credit = await deductCredit(db, decoded.partnerId, adId, 'premium_ad', planCfg.credits);
    if (!credit.success) return jsonResponse({ error: credit.error || 'Onvoldoende credits' }, 400, origin);

    const partner = await getPartnerById(db, decoded.partnerId);
    const now = Date.now();
    const ad = {
      id: adId,
      partnerId: decoded.partnerId,
      partnerName: partner ? (partner.business || partner.name || '') : '',
      city: partner ? (partner.city || '') : '',
      title: String(title).trim(),
      description: description || '',
      price: (price !== undefined && price !== null && price !== '') ? price : null,
      category: category || 'other',
      imageUrl: imageUrl || '',
      featured: true,
      plan: planCfg.key,
      creditsUsed: planCfg.credits,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + planCfg.days * 24 * 60 * 60 * 1000).toISOString(),
      active: true
    };

    let ads = [];
    try { const ex = await db.get('ads'); ads = ex ? JSON.parse(ex) : []; } catch { ads = []; }
    ads.push(ad);
    await db.put('ads', JSON.stringify(ads));
    return jsonResponse({ success: true, ad: ad }, 200, origin);
  }

  // Publiek: actieve advertenties voor klanten
  if (path === '/api/ads' && method === 'GET') {
    let ads = [];
    try { const ex = await db.get('ads'); ads = ex ? JSON.parse(ex) : []; } catch { ads = []; }
    const now = Date.now();
    const active = ads.filter(function(a) {
      if (a.active === false) return false;
      if (a.expiresAt && new Date(a.expiresAt).getTime() < now) return false;
      return true;
    }).sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    return jsonResponse({ success: true, count: active.length, ads: active }, 200, origin);
  }

  // Partner: eigen advertenties
  if (path === '/api/ads/mine' && method === 'GET') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);
    let ads = [];
    try { const ex = await db.get('ads'); ads = ex ? JSON.parse(ex) : []; } catch { ads = []; }
    const mine = ads.filter(function(a) { return a.partnerId === decoded.partnerId && a.active !== false; })
      .sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    return jsonResponse({ success: true, count: mine.length, ads: mine }, 200, origin);
  }

  // Partner: advertentie stoppen (alleen eigen)
  if (path === '/api/ads/delete' && method === 'POST') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);
    const adId = body.adId || body.id;
    if (!adId) return jsonResponse({ error: 'adId is verplicht' }, 400, origin);
    let ads = [];
    try { const ex = await db.get('ads'); ads = ex ? JSON.parse(ex) : []; } catch { ads = []; }
    const before = ads.length;
    ads = ads.filter(function(a) { return !(a.id === adId && a.partnerId === decoded.partnerId); });
    if (ads.length === before) return jsonResponse({ error: 'Advertentie niet gevonden' }, 404, origin);
    await db.put('ads', JSON.stringify(ads));
    return jsonResponse({ success: true }, 200, origin);
  }

  // ============================================
  // CONTACT FORMULIER
  // ============================================
  if (path === '/api/contact' && method === 'POST') {
    const { name, email, message, phone, city } = body;
    if (!name || !email || !message) {
      return jsonResponse({ error: 'Naam, email en bericht zijn verplicht' }, 400, origin);
    }
    const contact = { id: Date.now().toString(), name, email, phone, city, message, createdAt: new Date().toISOString() };
    let contacts = [];
    try {
      const existing = await db.get('contacts');
      contacts = existing ? JSON.parse(existing) : [];
    } catch { contacts = []; }
    contacts.push(contact);
    await db.put('contacts', JSON.stringify(contacts));
    return jsonResponse({ success: true, message: 'Bericht ontvangen' }, 200, origin);
  }

  // ---- PUBLIEK: statistieken voor homepage (basis + echte activiteit) ----
  if (path === '/api/stats' && method === 'GET') {
    const BASE_USERS = 787;
    const BASE_PARTNERS = 64;
    const BASE_RESERVATIONS = 3655;
    let leads = [];
    try { const ex = await db.get('leads'); leads = ex ? JSON.parse(ex) : []; } catch { leads = []; }
    let earlyAccess = 0, dealClaims = 0;
    for (var i = 0; i < leads.length; i++) {
      if (leads[i].type === 'deal_claim') { dealClaims++; } else { earlyAccess++; }
    }
    let partnerCount = 0;
    try { const partners = await getAllPartners(db); partnerCount = Array.isArray(partners) ? partners.length : 0; } catch { partnerCount = 0; }
    return jsonResponse({
      users: BASE_USERS + earlyAccess + dealClaims,
      partners: BASE_PARTNERS + partnerCount,
      reservations: BASE_RESERVATIONS + dealClaims
    }, 200, origin);
  }

  // ---- LEADS: klant-aanmeldingen (vroegtijdige toegang + dag-aanbieding) ----
  if (path === '/api/leads' && method === 'POST') {
    const { type, email, phone, name, city, dealId, dealTitle, note } = body;
    if (!email && !phone) {
      return jsonResponse({ error: 'E-mailadres of telefoonnummer is verplicht' }, 400, origin);
    }
    const isDealClaim = type === 'deal_claim';

    // Lichte anti-spam: max 10 aanmeldingen per uur per IP
    if (!(await checkRateLimit(db, 'lead_' + ip, 10, 3600000))) {
      return jsonResponse({ error: 'Te veel aanmeldingen, probeer het later opnieuw' }, 429, origin);
    }

    // Blokkade-check: klanten met 3+ no-shows binnen 60 dagen kunnen tijdelijk niet reserveren
    if (isDealClaim) {
      const blockedUntil = await checkNoShowBlock(db, phone, email);
      if (blockedUntil) {
        return jsonResponse({
          error: 'ACCOUNT_BLOCKED',
          message: 'Je account is tijdelijk geblokkeerd voor reserveringen vanwege herhaalde no-shows.',
          blockedUntil
        }, 403, origin);
      }
    }

    // Bij een dag-aanbieding: deal opzoeken (voorraad + ophaal-deadline) vóórdat de lead wordt aangemaakt
    let deals = null;
    let targetDeal = null;
    if (isDealClaim && dealId) {
      try {
        const ex = await db.get('deals');
        deals = ex ? JSON.parse(ex) : [];
        targetDeal = deals.find(function(d) { return d.id === dealId; }) || null;
      } catch { deals = null; targetDeal = null; }
    }

    const lead = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
      type: isDealClaim ? 'deal_claim' : 'early_access',
      email: email || '',
      phone: phone || '',
      name: name || '',
      city: city || '',
      dealId: dealId || '',
      dealTitle: dealTitle || '',
      note: note || '',
      createdAt: new Date().toISOString()
    };
    if (isDealClaim) {
      lead.status = 'pending';
      lead.cancelToken = crypto.randomUUID();
      lead.pickupDeadline = targetDeal ? (targetDeal.expiresAt || null) : null;
      lead.statusUpdatedAt = lead.createdAt;
    }

    let leads = [];
    try { const existing = await db.get('leads'); leads = existing ? JSON.parse(existing) : []; } catch { leads = []; }
    leads.push(lead);
    await db.put('leads', JSON.stringify(leads));

    // Voorraad bijwerken bij een dag-aanbieding claim (hergebruikt de deals array die we al hadden)
    if (isDealClaim && lead.dealId && deals) {
      try {
        let changed = false;
        deals = deals.map(function(d) {
          if (d.id === lead.dealId) {
            var qty = parseInt(d.quantity, 10);
            if (!isNaN(qty)) {
              qty = Math.max(0, qty - 1);
              d.quantity = qty;
              if (qty === 0) { d.active = false; d.soldOut = true; }
              changed = true;
            }
          }
          return d;
        });
        if (changed) await db.put('deals', JSON.stringify(deals));
      } catch (e) {}
    }

    // Bevestigingsmail met annuleerlink (best-effort, blokkeert de respons niet bij falen)
    if (isDealClaim && lead.email && env.RESEND_API_KEY) {
      try {
        const cancelUrl = 'https://savoraapp.com/deals.html?cancel=' + encodeURIComponent(lead.cancelToken);
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + env.RESEND_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Savoraapp <noreply@savoraapp.com>',
            to: lead.email,
            subject: 'Jouw reservering bij ' + (lead.dealTitle || 'Savoraapp'),
            html: '<h2>Reservering bevestigd</h2>' +
              '<p>Je hebt <strong>' + (lead.dealTitle || 'een aanbieding') + '</strong> gereserveerd.</p>' +
              '<p>Kun je toch niet ophalen? Annuleer dan op tijd, zodat de winkelier het aan iemand anders kan aanbieden:</p>' +
              '<p><a href="' + cancelUrl + '">Annuleer mijn reservering</a></p>' +
              '<p style="color:#888;font-size:12px">Niet geannuleerd en niet opgehaald? Na 3 keer wordt reserveren tijdelijk geblokkeerd.</p>'
          })
        });
      } catch (e) {}
    }

    return jsonResponse({
      success: true,
      message: 'Bedankt! We hebben je gegevens ontvangen.',
      cancelToken: isDealClaim ? lead.cancelToken : undefined,
      claimId: isDealClaim ? lead.id : undefined
    }, 200, origin);
  }

  // ---- Publiek: eigen reservering annuleren via token (geen login nodig) ----
  if (path === '/api/deals/cancel-claim' && method === 'POST') {
    const token = body.token;
    if (!token) return jsonResponse({ error: 'Token is verplicht' }, 400, origin);

    let leads = [];
    try { const ex = await db.get('leads'); leads = ex ? JSON.parse(ex) : []; } catch { leads = []; }
    const idx = leads.findIndex(function(l) { return l.type === 'deal_claim' && l.cancelToken === token; });
    if (idx === -1) return jsonResponse({ error: 'Reservering niet gevonden of link ongeldig' }, 404, origin);

    const lead = leads[idx];
    if (lead.status && lead.status !== 'pending') {
      return jsonResponse({
        error: 'ALREADY_' + String(lead.status).toUpperCase(),
        message: 'Deze reservering is al bijgewerkt (status: ' + lead.status + ')',
        status: lead.status
      }, 400, origin);
    }

    lead.status = 'cancelled';
    lead.statusUpdatedAt = new Date().toISOString();
    leads[idx] = lead;
    await db.put('leads', JSON.stringify(leads));

    // Voorraad teruggeven en de aanbieding evt. weer actief zetten
    if (lead.dealId) {
      try {
        const ex = await db.get('deals');
        let deals = ex ? JSON.parse(ex) : [];
        let changed = false;
        deals = deals.map(function(d) {
          if (d.id !== lead.dealId) return d;
          var qty = parseInt(d.quantity, 10);
          if (!isNaN(qty)) { d.quantity = qty + 1; changed = true; }
          var notExpired = !d.expiresAt || new Date(d.expiresAt).getTime() > Date.now();
          // Alleen automatisch heractiveren als de deal alléén door "uitverkocht" was gestopt
          // (niet als de winkelier hem handmatig heeft gestopt via /api/deals/delete)
          if (d.soldOut && !d.stoppedAt && notExpired) {
            d.soldOut = false;
            d.active = true;
            changed = true;
          }
          return d;
        });
        if (changed) await db.put('deals', JSON.stringify(deals));
      } catch (e) {}
    }

    return jsonResponse({ success: true, message: 'Je reservering is geannuleerd.', dealTitle: lead.dealTitle }, 200, origin);
  }

  // ---- Partner: reservering markeren als opgehaald of no-show ----
  if (path === '/api/deals/mark-claim' && method === 'POST') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

    const claimId = body.claimId || body.id;
    const action = body.action;
    if (!claimId || ['picked_up', 'no_show'].indexOf(action) === -1) {
      return jsonResponse({ error: 'claimId en een geldige action (picked_up of no_show) zijn verplicht' }, 400, origin);
    }

    let deals = [];
    try { const ex = await db.get('deals'); deals = ex ? JSON.parse(ex) : []; } catch { deals = []; }
    let ads = [];
    try { const exa = await db.get('ads'); ads = exa ? JSON.parse(exa) : []; } catch { ads = []; }
    const myIds = deals.filter(function(d) { return d.partnerId === decoded.partnerId; }).map(function(d) { return d.id; })
      .concat(ads.filter(function(a) { return a.partnerId === decoded.partnerId; }).map(function(a) { return a.id; }));

    let leads = [];
    try { const ex = await db.get('leads'); leads = ex ? JSON.parse(ex) : []; } catch { leads = []; }
    const idx = leads.findIndex(function(l) { return l.id === claimId && l.type === 'deal_claim'; });
    if (idx === -1) return jsonResponse({ error: 'Reservering niet gevonden' }, 404, origin);

    const lead = leads[idx];
    if (myIds.indexOf(lead.dealId) === -1) {
      return jsonResponse({ error: 'Niet geautoriseerd voor deze reservering' }, 403, origin);
    }
    if (lead.status && lead.status !== 'pending') {
      return jsonResponse({ error: 'Status is al bijgewerkt: ' + lead.status, status: lead.status }, 400, origin);
    }

    lead.status = action;
    lead.statusUpdatedAt = new Date().toISOString();
    leads[idx] = lead;
    await db.put('leads', JSON.stringify(leads));

    let blockedUntil = null;
    if (action === 'no_show') {
      try { blockedUntil = await registerNoShow(db, lead.phone, lead.email); } catch (e) {}
    }

    return jsonResponse({ success: true, status: lead.status, blockedUntil }, 200, origin);
  }

  // ---- PROMOCODE: valideren (partner, bij afrekenen) ----
  if (path === '/api/promo/validate' && method === 'POST') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);
    const pr = await validatePromo(db, body.code);
    return jsonResponse({ success: true, valid: pr.valid, percent: pr.valid ? pr.percent : 0 }, 200, origin);
  }

  // ---- ADMIN: promocode aanmaken ----
  if (path === '/api/admin/promo/create' && method === 'POST') {
    const decoded = await isAdminAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);
    const code = String(body.code || '').trim().toUpperCase();
    const percent = Number(body.percent);
    if (!code || !(percent > 0 && percent <= 100)) {
      return jsonResponse({ error: 'Ongeldige code of percentage (1-100)' }, 400, origin);
    }
    const promo = {
      code, percent, active: true, usedCount: 0,
      maxUses: (body.maxUses !== undefined && body.maxUses !== null && body.maxUses !== '') ? Number(body.maxUses) : null,
      expiresAt: (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== '') ? Number(body.expiresAt) : null,
      createdAt: Date.now()
    };
    await db.put('promo_' + code, JSON.stringify(promo));
    return jsonResponse({ success: true, promo }, 200, origin);
  }

  // ---- ADMIN: promocodes lijst ----
  if (path === '/api/admin/promo/list' && method === 'GET') {
    const decoded = await isAdminAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);
    const keys = await db.list({ prefix: 'promo_' });
    const promos = [];
    for (const k of (keys.keys || [])) { try { promos.push(JSON.parse(await db.get(k.name))); } catch {} }
    return jsonResponse({ success: true, promos }, 200, origin);
  }

  // ---- ADMIN: promocode verwijderen ----
  if (path === '/api/admin/promo/delete' && method === 'POST') {
    const decoded = await isAdminAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);
    const code = String(body.code || '').trim().toUpperCase();
    if (!code) return jsonResponse({ error: 'Code ontbreekt' }, 400, origin);
    await db.delete('promo_' + code);
    return jsonResponse({ success: true }, 200, origin);
  }

  // ---- ADMIN: leads bekijken ----
  if (path === '/api/admin/leads' && method === 'GET') {
    const decoded = await isAdminAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);
    let leads = [];
    try { const existing = await db.get('leads'); leads = existing ? JSON.parse(existing) : []; } catch { leads = []; }
    leads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // nieuwste eerst
    const earlyAccess = leads.filter(l => l.type === 'early_access');
    const dealClaims = leads.filter(l => l.type === 'deal_claim');
    return jsonResponse({
      success: true,
      count: leads.length,
      earlyAccessCount: earlyAccess.length,
      dealClaimCount: dealClaims.length,
      leads
    }, 200, origin);
  }

  // ============================================
  // ADMIN: SESSIE CHECK
  // ============================================
  if (path === '/api/admin/session' && method === 'GET') {
    const decoded = await isAdminAuthorized(request, env);
    if (decoded) {
      return jsonResponse({ success: true, valid: true }, 200, origin);
    }
    return jsonResponse({ success: false, valid: false }, 401, origin);
  }

  // ============================================
  // ADMIN: INLOGGEN
  // ============================================
  if (path === '/api/admin/login' && method === 'POST') {
    console.log('[ADMIN LOGIN] Request from IP:', ip);
    if (!(await checkRateLimit(db, 'admin_' + ip, 3, 900000))) {
      return jsonResponse({ error: 'Te veel pogingen. Wacht 15 minuten.' }, 429, origin);
    }
    // Vereist dat ADMIN_USER en ADMIN_PASS als secrets zijn ingesteld — geen onveilige fallback
    if (!env.ADMIN_USER || !env.ADMIN_PASS) {
      console.error('[ADMIN LOGIN] Geweigerd: ADMIN_USER/ADMIN_PASS niet geconfigureerd');
      return jsonResponse({ error: 'Admin-login is niet geconfigureerd op de server' }, 503, origin);
    }
    const adminUser = env.ADMIN_USER;
    const adminPass = env.ADMIN_PASS;
    const { username, password } = body;
    console.log('[ADMIN LOGIN] Username:', username, 'Password provided:', !!password);
    if (username === adminUser && password === adminPass) {
      const token = await jwtSign({ role: 'admin' }, env.JWT_SECRET, 86400);
      console.log('[ADMIN LOGIN] Success for:', username);
      return jsonResponse({ success: true, token }, 200, origin);
    }
    console.log('[ADMIN LOGIN] Invalid credentials for:', username);
    return jsonResponse({ error: 'Ongeldige inloggegevens' }, 401, origin);
  }

  // ============================================
  // ADMIN: PARTNER ACTIVEREN (status wijzigen)
  // ============================================
  if (path === '/api/admin/verify-partner' && method === 'POST') {
    try {
      const decoded = await isAdminAuthorized(request, env);
      if (!decoded) {
        return jsonResponse({ error: 'Toegang geweigerd' }, 403, origin);
      }
      const { partnerId } = body;
      if (!partnerId) {
        return jsonResponse({ error: 'partnerId is verplicht' }, 400, origin);
      }
      const partner = await getPartnerById(db, partnerId);
      if (!partner) {
        return jsonResponse({ error: 'Partner niet gevonden' }, 404, origin);
      }
      partner.verified = true;
      partner.status = 'active';
      partner.verifiedAt = new Date().toISOString();
      await savePartner(db, partner);
      console.log('[ADMIN] Partner geactiveerd:', partnerId, partner.business);
      return jsonResponse({ success: true, message: 'Partner geactiveerd', partnerId }, 200, origin);
    } catch (err) {
      console.error('[ADMIN VERIFY] Error:', err);
      return jsonResponse({ error: 'Server fout: ' + err.message }, 500, origin);
    }
  }

  // ============================================
  // ADMIN: PARTNER VERWIJDEREN
  // ============================================
  if (path === '/api/admin/delete-partner' && method === 'POST') {
    try {
      const decoded = await isAdminAuthorized(request, env);
      if (!decoded) {
        return jsonResponse({ error: 'Toegang geweigerd' }, 403, origin);
      }
      const partnerId = body.partnerId || body.id;
      if (!partnerId) {
        return jsonResponse({ error: 'partnerId is verplicht' }, 400, origin);
      }
      const partner = await getPartnerById(db, partnerId);
      if (!partner) {
        return jsonResponse({ error: 'Partner niet gevonden' }, 404, origin);
      }
      const emailKey = (partner.contact || partner.email || '').toLowerCase().trim();
      // 1) Verwijder uit nieuwe structuur (partner_id + partner_email)
      await db.delete('partner_id:' + partner.id);
      if (emailKey) await db.delete('partner_email:' + emailKey);
      // 2) Verwijder uit oude array (anders blijft 409 'Email bestaat al' hangen)
      try {
        const old = await getOldPartnersArray(db);
        const filtered = old.filter(function (x) {
          return x.id !== partner.id &&
            (x.contact || '').toLowerCase().trim() !== emailKey &&
            (x.email || '').toLowerCase().trim() !== emailKey;
        });
        await db.put('partners', JSON.stringify(filtered));
      } catch (e) { console.error('[ADMIN DELETE] array-opruimen faalde:', e.message); }
      // 3) Ruim eventuele credit-pakketten/transacties van deze partner op
      try {
        const pkgs = await db.list({ prefix: 'creditpkg_' + partner.id + '_' });
        for (const k of pkgs.keys) { await db.delete(k.name); }
        const txs = await db.list({ prefix: 'partner_txs_' + partner.id + '_' });
        for (const k of txs.keys) { await db.delete(k.name); }
      } catch (e) { console.error('[ADMIN DELETE] credits-opruimen faalde:', e.message); }
      console.log('[ADMIN] Partner verwijderd:', partner.id, partner.business, emailKey);
      return jsonResponse({ success: true, message: 'Partner verwijderd', partnerId: partner.id }, 200, origin);
    } catch (err) {
      console.error('[ADMIN DELETE] Error:', err);
      return jsonResponse({ error: 'Server fout: ' + err.message }, 500, origin);
    }
  }

  // ============================================
  // ADMIN: UITLOGGEN
  // ============================================
  if (path === '/api/admin/logout' && method === 'POST') {
    return jsonResponse({ success: true }, 200, origin);
  }

  // ============================================
  // ADMIN: DATA
  // ============================================
  if (path === '/api/admin/data' && method === 'GET') {
    const decoded = await isAdminAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

    const partners = await getAllPartners(db);
    const safePartners = partners.map(p => ({
      id: p.id, business: p.business, contact: p.contact,
      nipt: p.nipt || p.nui || '', city: p.city,
      status: p.status, verified: p.verified,
      credits: p.credits || 0,
      createdAt: p.createdAt, activatedAt: p.activatedAt
    }));

    let contacts = [];
    try {
      const c = await db.get('contacts');
      contacts = c ? JSON.parse(c) : [];
    } catch { contacts = []; }

    return jsonResponse({
      success: true,
      stats: {
        totalPartners: partners.length,
        activePartners: partners.filter(p => p.verified === true || p.verified === undefined || p.verified === null).length,
        pendingPartners: partners.filter(p => p.verified === false).length,
        totalContacts: contacts.length
      },
      partners: safePartners.slice(-20).reverse(),
      contacts: contacts.slice(-20).reverse()
    }, 200, origin);
  }

  // ============================================
  // ADMIN: FATURIM / TAKSAT — wat elke partner betaald heeft (per maand)
  // ============================================
  if (path === '/api/admin/billing' && method === 'GET') {
    const decoded = await isAdminAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

    const partners = await getAllPartners(db);
    const pMap = {};
    partners.forEach(function(p){
      pMap[p.id] = { id: p.id, business: p.business || '', contact: p.contact || '', nipt: p.nipt || p.nui || '', totalPaid: 0, byMonth: {} };
    });

    const payments = [];
    const monthsSet = {};
    let grandTotal = 0;
    try {
      const list = await db.list({ prefix: 'creditpkg_' });
      for (const key of (list.keys || [])) {
        let pkg;
        try { pkg = JSON.parse(await db.get(key.name)); } catch (e) { continue; }
        const price = Number(pkg.price) || 0;
        if (price <= 0) continue; // gratis admin-toekenningen tellen niet als betaling
        const when = pkg.purchasedAt ? new Date(pkg.purchasedAt) : null;
        const month = when ? (when.getFullYear() + '-' + String(when.getMonth() + 1).padStart(2, '0')) : 'onbekend';
        monthsSet[month] = true;
        grandTotal += price;
        let row = pMap[pkg.partnerId];
        if (!row) { row = pMap[pkg.partnerId] = { id: pkg.partnerId, business: '(i panjohur)', contact: '', nipt: '', totalPaid: 0, byMonth: {} }; }
        row.totalPaid += price;
        row.byMonth[month] = (row.byMonth[month] || 0) + price;
        payments.push({
          partnerId: pkg.partnerId, business: row.business, contact: row.contact, nipt: row.nipt,
          amount: price, date: when ? when.toISOString().split('T')[0] : '', month: month,
          package: pkg.name || '', paymentRef: pkg.paymentRef || ''
        });
      }
    } catch (e) { /* leeg */ }

    const partnersArr = Object.keys(pMap).map(function(k){ return pMap[k]; }).sort(function(a,b){ return b.totalPaid - a.totalPaid; });
    const months = Object.keys(monthsSet).sort().reverse();
    payments.sort(function(a,b){ return (b.date || '').localeCompare(a.date || ''); });

    return jsonResponse({ success: true, partners: partnersArr, payments: payments, months: months, totalPaid: grandTotal }, 200, origin);
  }

  // ============================================
  // ADMIN: MARKETING — alle partners + consumenten apart
  // ============================================
  if (path === '/api/admin/marketing' && method === 'GET') {
    const decoded = await isAdminAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

    const partners = await getAllPartners(db);
    const partnerList = partners.map(function(p){
      return { id: p.id, business: p.business || '', nipt: p.nipt || p.nui || '', contact: p.contact || '', email: p.email || '', phone: p.phone || '', city: p.city || '', createdAt: p.createdAt || '' };
    });

    let leads = [];
    try { const ex = await db.get('leads'); leads = ex ? JSON.parse(ex) : []; } catch { leads = []; }
    const seen = {};
    const consumers = [];
    leads.forEach(function(l){
      var key = (l.email || '').toLowerCase() + '|' + (l.phone || '');
      if (key === '|') return;
      var isRes = (l.type === 'deal_claim') ? 1 : 0;
      if (seen[key] !== undefined) {
        consumers[seen[key]].reservations += isRes;
        if (!consumers[seen[key]].name && l.name) consumers[seen[key]].name = l.name;
        if (!consumers[seen[key]].city && l.city) consumers[seen[key]].city = l.city;
      } else {
        seen[key] = consumers.length;
        consumers.push({ name: l.name || '', email: l.email || '', phone: l.phone || '', city: l.city || '', reservations: isRes, createdAt: l.createdAt || '' });
      }
    });

    return jsonResponse({ success: true, partners: partnerList, consumers: consumers, partnerCount: partnerList.length, consumerCount: consumers.length }, 200, origin);
  }

  // ============================================
  // ADMIN: CREDITS AANPASSEN
  // ============================================
  if (path === '/api/admin/credits' && method === 'POST') {
    const decoded = await isAdminAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

    const { partnerId, credits, reason } = body;
    if (!partnerId || credits === undefined) {
      return jsonResponse({ error: 'PartnerId en credits zijn verplicht' }, 400, origin);
    }
    const partner = await getPartnerById(db, partnerId);
    if (!partner) return jsonResponse({ error: 'Niet gevonden' }, 404, origin);

    const amount = Number(credits);
    if (isNaN(amount) || amount === 0) {
      return jsonResponse({ error: 'Ongeldig aantal credits' }, 400, origin);
    }

    if (amount > 0) {
      // Maak een ECHT actief credit-pakket aan, zodat deductCredit deze credits ziet
      const purchaseId = 'purchase_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const now = Date.now();
      const pkg = {
        id: 'admin_grant',
        purchaseId,
        partnerId,
        name: 'Admin-toekenning',
        totalCredits: amount,
        remainingCredits: amount,
        usedCredits: 0,
        price: 0,
        purchasedAt: now,
        expiresAt: now + (CREDIT_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        paymentRef: 'admin:' + (reason || 'toekenning'),
        status: 'active'
      };
      await db.put('creditpkg_' + partnerId + '_' + purchaseId, JSON.stringify(pkg));
    } else {
      // Negatieve correctie: trek af van actieve pakketten (FIFO)
      let toRemove = -amount;
      const pkgs = await getActiveCreditPackages(db, partnerId);
      for (const p of pkgs) {
        if (toRemove <= 0) break;
        const take = Math.min(p.remainingCredits, toRemove);
        p.remainingCredits -= take;
        p.usedCredits += take;
        toRemove -= take;
        await db.put('creditpkg_' + partnerId + '_' + p.purchaseId, JSON.stringify(p));
      }
    }

    // Houd partner.credits + geschiedenis bij (voor weergave/log)
    partner.credits = Math.max(0, (partner.credits || 0) + amount);
    partner.creditHistory = partner.creditHistory || [];
    partner.creditHistory.push({ type: 'admin_adjustment', credits: amount, reason: reason || 'Admin', date: new Date().toISOString() });
    await savePartner(db, partner);

    // Geef het werkelijk bruikbare saldo terug (uit actieve pakketten)
    const activeNow = await getActiveCreditPackages(db, partnerId);
    const liveCredits = activeNow.reduce(function(s, p) { return s + p.remainingCredits; }, 0);

    return jsonResponse({ success: true, credits: liveCredits }, 200, origin);
  }

  // ============================================
  // ADMIN: CREDITS OVERVIEW
  // ============================================
  if (path === '/api/admin/credits' && method === 'GET') {
    const decoded = await isAdminAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

    // Get all partners and their credit data
    const allKeys = await db.list({ prefix: 'partner_id:' });
    const partners = [];
    let totalCredits = 0;
    let totalPackages = 0;

    for (const key of allKeys.keys || []) {
      try {
        const partner = JSON.parse(await db.get(key.name));
        if (partner) {
          const activePackages = await getActiveCreditPackages(db, partner.id);
          const transactions = await getCreditTransactions(db, partner.id);
          totalCredits += partner.credits || 0;
          totalPackages += activePackages.length;
          partners.push({
            id: partner.id,
            business: partner.business,
            contact: partner.contact,
            credits: partner.credits || 0,
            activePackages: activePackages.length,
            packages: activePackages,
            recentTransactions: transactions.slice(0, 5)
          });
        }
      } catch (e) { /* skip */ }
    }

    return jsonResponse({
      success: true,
      partners: partners.sort((a, b) => b.credits - a.credits),
      totalCredits,
      totalPackages,
      totalPartners: partners.length
    }, 200, origin);
  }

  // ---- ANALYTICS ----
  if (path === '/api/analytics' && method === 'POST') {
    try {
      // Gebruik al geparse body (niet request.json() want body is al consumed)
      const event = body || {};
      // Store analytics event in KV (fire and forget)
      const eventId = 'analytics_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      ctx.waitUntil(db.put(eventId, JSON.stringify({...event, timestamp: new Date().toISOString()})));
      return jsonResponse({ success: true }, 200, origin);
    } catch {
      return jsonResponse({ success: true }, 200, origin); // Soft fail
    }
  }

  // ---- PAYSERA: BETALING STARTEN (WebToPay) ----
  if (path === '/api/paysera/create-payment' && method === 'POST') {
    try {
      // Vereist een ingelogde partner
      const decoded = await isPartnerAuthorized(request, env);
      if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

      if (!env.PAYSERA_PASSWORD) {
        return jsonResponse({ error: 'Paysera niet geconfigureerd (PAYSERA_PASSWORD ontbreekt)' }, 500, origin);
      }

      const partnerId = decoded.partnerId;
      const packageKey = body.package || body.packageKey;
      const pkgDef = CREDIT_PACKAGES[packageKey];
      if (!pkgDef) return jsonResponse({ error: 'Ongeldig pakket' }, 400, origin);

      // Bedrag + valuta komen van de SERVER (pakketprijs), niet van de client — anti-fraude.
      // Prijzen staan in Lek, dus valuta = ALL (ISO-code Albanese Lek). Override mogelijk via env.
      const currency = (env.PAYSERA_CURRENCY || 'ALL').toUpperCase();
      const psPromo = await applyPromo(db, pkgDef.price, body.discountCode);
      if (psPromo.code) { await incrementPromoUse(db, psPromo.code); }
      const amountCents = Math.round(psPromo.amount * 100);

      // Uniek ordernummer + pending-order in KV zodat de callback weet wie/wat
      const orderId = 'SAV' + Date.now() + Math.floor(Math.random() * 1000);
      await db.put('payorder_' + orderId, JSON.stringify({
        orderId, partnerId, packageKey,
        amountCents, currency,
        status: 'pending',
        createdAt: Date.now()
      }), { expirationTtl: 60 * 60 * 24 * 7 });

      // Callback moet op een in Paysera bevestigd domein staan. Het workers.dev-adres
      // kun je niet bevestigen, dus wijs naar je eigen (sub)domein. Overschrijfbaar via env.
      const apiBase = env.PAYSERA_CALLBACK_BASE || 'https://api.savoraapp.com';
      const frontend = env.FRONTEND_URL || 'https://savoraapp.com';

      const params = {
        projectid: env.PAYSERA_PROJECT_ID || PAYSERA_PROJECT_ID,
        orderid: orderId,
        accepturl: frontend + '/partner-dashboard?payment=success',
        cancelurl: frontend + '/partner-dashboard?payment=cancel',
        callbackurl: apiBase + '/api/paysera/callback',
        amount: String(amountCents),
        currency: currency,
        p_email: decoded.email || '',
        test: env.PAYSERA_TEST === '1' ? '1' : '0',
        version: '1.6'
      };

      const payUrl = buildPayseraPaymentUrl(params, env.PAYSERA_PASSWORD);
      return jsonResponse({ success: true, url: payUrl, orderId }, 200, origin);
    } catch (err) {
      console.error('[PAYSERA] create-payment fout:', err.message);
      return jsonResponse({ error: 'Kon betaling niet starten' }, 500, origin);
    }
  }

  // ---- PAYPAL: order aanmaken (redirect-flow, net als Paysera) ----
  if (path === '/api/paypal/create-order' && method === 'POST') {
    try {
      const decoded = await isPartnerAuthorized(request, env);
      if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);
      if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET) {
        return jsonResponse({ error: 'PayPal niet geconfigureerd (PAYPAL_CLIENT_ID/SECRET ontbreken)' }, 500, origin);
      }
      const partnerId = decoded.partnerId;
      const packageKey = body.package || body.packageKey;
      const pkgDef = CREDIT_PACKAGES[packageKey];
      if (!pkgDef) return jsonResponse({ error: 'Ongeldig pakket' }, 400, origin);

      const token = await getPayPalAccessToken(env);
      if (!token) return jsonResponse({ error: 'PayPal authenticatie mislukt' }, 502, origin);

      const ppPromo = await applyPromo(db, (pkgDef.usd != null ? pkgDef.usd : 10), body.discountCode);
      if (ppPromo.code) { await incrementPromoUse(db, ppPromo.code); }
      const usd = Math.max(0.01, ppPromo.amount).toFixed(2);
      const frontend = env.FRONTEND_URL || 'https://savoraapp.com';

      const orderRes = await fetch(paypalBase(env) + '/v2/checkout/orders', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            description: pkgDef.name + ' (' + pkgDef.credits + ' kredite)',
            amount: { currency_code: 'USD', value: usd }
          }],
          application_context: {
            brand_name: 'Savoraapp',
            user_action: 'PAY_NOW',
            return_url: frontend + '/partner-dashboard?paypal_return=1',
            cancel_url: frontend + '/partner-dashboard?paypal_cancel=1'
          }
        })
      });
      const order = await orderRes.json();
      if (!orderRes.ok || !order.id) {
        console.error('[PAYPAL] order fout:', JSON.stringify(order).slice(0, 200));
        return jsonResponse({ error: 'Kon PayPal-order niet aanmaken' }, 502, origin);
      }
      await db.put('paypalorder_' + order.id, JSON.stringify({
        orderId: order.id, partnerId, packageKey, usd, status: 'pending', createdAt: Date.now()
      }), { expirationTtl: 60 * 60 * 24 * 3 });

      const approve = (order.links || []).find(function(l){ return l.rel === 'approve' || l.rel === 'payer-action'; });
      return jsonResponse({ success: true, orderId: order.id, url: approve ? approve.href : null }, 200, origin);
    } catch (err) {
      console.error('[PAYPAL] create-order fout:', err.message);
      return jsonResponse({ error: 'Kon PayPal-betaling niet starten' }, 500, origin);
    }
  }

  // ---- PAYPAL: vastleggen + credits toekennen ----
  if (path === '/api/paypal/capture' && method === 'POST') {
    try {
      const decoded = await isPartnerAuthorized(request, env);
      if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);
      const orderId = body.orderId;
      if (!orderId) return jsonResponse({ error: 'orderId ontbreekt' }, 400, origin);

      const pendingRaw = await db.get('paypalorder_' + orderId);
      if (!pendingRaw) return jsonResponse({ error: 'Onbekende order' }, 404, origin);
      const pending = JSON.parse(pendingRaw);
      if (pending.partnerId !== decoded.partnerId) return jsonResponse({ error: 'Order hoort niet bij deze partner' }, 403, origin);
      if (pending.status === 'completed') return jsonResponse({ success: true, alreadyDone: true }, 200, origin);

      const token = await getPayPalAccessToken(env);
      if (!token) return jsonResponse({ error: 'PayPal authenticatie mislukt' }, 502, origin);

      const capRes = await fetch(paypalBase(env) + '/v2/checkout/orders/' + orderId + '/capture', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
      });
      const cap = await capRes.json();
      if (!capRes.ok || cap.status !== 'COMPLETED') {
        console.error('[PAYPAL] capture niet voltooid:', JSON.stringify(cap).slice(0, 200));
        return jsonResponse({ error: 'Betaling niet voltooid', status: cap.status }, 402, origin);
      }

      const result = await purchaseCreditPackage(db, pending.partnerId, pending.packageKey, 'paypal_' + orderId);
      pending.status = 'completed';
      pending.completedAt = Date.now();
      await db.put('paypalorder_' + orderId, JSON.stringify(pending), { expirationTtl: 60 * 60 * 24 * 30 });

      return jsonResponse({ success: true, credits: result.credits, package: result.package }, 200, origin);
    } catch (err) {
      console.error('[PAYPAL] capture fout:', err.message);
      return jsonResponse({ error: 'Kon betaling niet vastleggen' }, 500, origin);
    }
  }

  // ---- PAYSERA: CALLBACK (server-naar-server, verifieert betaling) ----
  if (path === '/api/paysera/callback') {
    // Paysera roept dit aan met data + ss1. Bij succes MOET de body exact "OK" zijn.
    try {
      const dataParam = url.searchParams.get('data');
      const ss1 = url.searchParams.get('ss1');
      if (!dataParam || !ss1) {
        return new Response('missing data/ss1', { status: 400 });
      }
      if (!env.PAYSERA_PASSWORD) {
        return new Response('not configured', { status: 500 });
      }

      // 1) Handtekening verifiëren (ss1 = md5(data + projectwachtwoord))
      const expected = md5(dataParam + env.PAYSERA_PASSWORD);
      if (expected !== ss1) {
        console.error('[PAYSERA] ongeldige ss1-handtekening');
        return new Response('invalid sign', { status: 400 });
      }

      // 2) Data uitlezen en controleren
      const p = parsePayseraData(dataParam);
      const expectedProject = env.PAYSERA_PROJECT_ID || PAYSERA_PROJECT_ID;
      if (String(p.projectid) !== String(expectedProject)) {
        console.error('[PAYSERA] verkeerd projectid:', p.projectid);
        return new Response('bad projectid', { status: 400 });
      }

      // Status 1 = betaling geslaagd (alleen dan crediteren)
      if (String(p.status) !== '1') {
        console.log('[PAYSERA] status niet betaald:', p.status, 'order:', p.orderid);
        return new Response('OK'); // bevestig ontvangst; nog geen credits
      }

      // 3) Pending-order ophalen
      const orderKey = 'payorder_' + p.orderid;
      let order = null;
      try { const raw = await db.get(orderKey); order = raw ? JSON.parse(raw) : null; } catch {}
      if (!order) {
        console.error('[PAYSERA] onbekende order:', p.orderid);
        return new Response('unknown order', { status: 400 });
      }

      // Idempotent: al verwerkt? niets dubbel crediteren
      if (order.status === 'paid') {
        return new Response('OK');
      }

      // Bedrag/valuta controleren tegen wat wij verwachtten
      if (String(p.amount) !== String(order.amountCents) || String(p.currency).toUpperCase() !== String(order.currency).toUpperCase()) {
        console.error('[PAYSERA] bedrag/valuta mismatch voor order', p.orderid);
        return new Response('amount mismatch', { status: 400 });
      }

      // 4) Credits toekennen via bestaand pakketsysteem
      await purchaseCreditPackage(db, order.partnerId, order.packageKey, 'paysera_' + p.orderid);

      order.status = 'paid';
      order.paidAt = Date.now();
      order.payseraRequestId = p.requestid || '';
      await db.put(orderKey, JSON.stringify(order), { expirationTtl: 60 * 60 * 24 * 30 });

      console.log('[PAYSERA] betaling bevestigd, credits toegekend:', order.partnerId, order.packageKey);
      return new Response('OK');
    } catch (err) {
      console.error('[PAYSERA] callback fout:', err.message);
      return new Response('error', { status: 500 });
    }
  }

  // ============================================
  // POK PAY: betaling starten (login -> order -> redirect, net als Paysera)
  // ============================================
  if (path === '/api/pok/create-payment' && method === 'POST') {
    try {
      const decoded = await isPartnerAuthorized(request, env);
      if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);
      if (!env.POK_KEY_ID || !env.POK_KEY_SECRET || !env.POK_MERCHANT_ID) {
        return jsonResponse({ error: 'POK niet geconfigureerd (POK_KEY_ID/POK_KEY_SECRET/POK_MERCHANT_ID ontbreken)' }, 500, origin);
      }

      const partnerId = decoded.partnerId;
      const packageKey = body.package || body.packageKey;
      const pkgDef = CREDIT_PACKAGES[packageKey];
      if (!pkgDef) return jsonResponse({ error: 'Ongeldig pakket' }, 400, origin);

      // Bedrag server-side (anti-fraude). POK gebruikt ALL, hele Lek als string.
      const pokPromo = await applyPromo(db, pkgDef.price, body.discountCode);
      if (pokPromo.code) { await incrementPromoUse(db, pokPromo.code); }
      const amount = String(Math.max(1, Math.round(pokPromo.amount)));
      const currency = 'ALL';

      // Pending-order in KV zodat de webhook weet wie/wat
      const orderRef = 'SAV' + Date.now() + Math.floor(Math.random() * 1000);
      await db.put('payorder_' + orderRef, JSON.stringify({
        orderId: orderRef, provider: 'pok', partnerId, packageKey,
        amount, currency, status: 'pending', createdAt: Date.now()
      }), { expirationTtl: 60 * 60 * 24 * 7 });

      const apiBase = env.POK_API_BASE || (env.POK_ENV === 'production' ? 'https://api.pokpay.io' : 'https://api-staging.pokpay.io');
      const frontend = env.FRONTEND_URL || 'https://savoraapp.com';
      const callbackBase = env.PAYSERA_CALLBACK_BASE || 'https://api.savoraapp.com';

      // 1) Inloggen -> token
      const loginRes = await fetch(apiBase + '/auth/sdk/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId: env.POK_KEY_ID, keySecret: env.POK_KEY_SECRET })
      });
      const loginText = await loginRes.text();
      if (!loginRes.ok) {
        console.error('[POK] login mislukt HTTP', loginRes.status, loginText.slice(0, 300));
        return jsonResponse({ error: 'POK-login mislukt' }, 502, origin);
      }
      let loginData = {};
      try { loginData = JSON.parse(loginText); } catch {}
      const token = loginData?.data?.token || loginData?.token || loginData?.data?.accessToken || loginData?.accessToken || loginData?.data?.jwt;
      if (!token) {
        console.error('[POK] geen token in login-antwoord:', loginText.slice(0, 300));
        return jsonResponse({ error: 'POK-login: geen token ontvangen' }, 502, origin);
      }

      // 2) Order aanmaken
      const orderPayload = {
        amount: amount,
        currencyCode: currency,
        autoCapture: true,
        products: [{ name: pkgDef.name + ' (' + pkgDef.credits + ' kredite)', price: amount, quantity: 1 }],
        webhookUrl: callbackBase + '/api/pok/webhook',
        redirectUrl: frontend + '/partner-dashboard?payment=success&ref=' + orderRef,
        failRedirectUrl: frontend + '/partner-dashboard?payment=cancel&ref=' + orderRef,
        merchantCustomReference: orderRef,
        description: 'Savoraapp ' + pkgDef.name
      };
      const orderRes = await fetch(apiBase + '/merchants/' + env.POK_MERCHANT_ID + '/sdk-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify(orderPayload)
      });
      const orderText = await orderRes.text();
      if (!orderRes.ok) {
        console.error('[POK] order aanmaken mislukt HTTP', orderRes.status, orderText.slice(0, 400));
        return jsonResponse({ error: 'POK-order aanmaken mislukt' }, 502, origin);
      }
      let orderData = {};
      try { orderData = JSON.parse(orderText); } catch {}
      const sdkOrder = orderData?.data?.sdkOrder || orderData?.sdkOrder || orderData?.data || orderData;
      const pokOrderId = sdkOrder?.id;
      if (!pokOrderId) {
        console.error('[POK] geen order-id in antwoord:', orderText.slice(0, 400));
        return jsonResponse({ error: 'POK-order: geen id ontvangen' }, 502, origin);
      }

      // Checkout-URL: uit het antwoord halen, anders construeren
      const payBase = env.POK_PAY_BASE || (env.POK_ENV === 'production' ? 'https://pay.pokpay.io' : 'https://pay-staging.pokpay.io');
      const checkoutUrl = (sdkOrder && sdkOrder._self && sdkOrder._self.confirmUrl)
        || (sdkOrder && sdkOrder.self && (sdkOrder.self.confirmUrl || sdkOrder.self.url))
        || (payBase + '/sdk-orders/' + pokOrderId);

      // POK-order-id koppelen aan onze pending-order
      try {
        const oraw = await db.get('payorder_' + orderRef);
        const o = oraw ? JSON.parse(oraw) : null;
        if (o) { o.pokOrderId = pokOrderId; await db.put('payorder_' + orderRef, JSON.stringify(o), { expirationTtl: 60 * 60 * 24 * 7 }); }
      } catch {}

      console.log('[POK] order aangemaakt:', orderRef, 'pokOrderId:', pokOrderId);
      return jsonResponse({ success: true, url: checkoutUrl, orderId: orderRef, pokOrderId }, 200, origin);
    } catch (err) {
      console.error('[POK] create-payment fout:', err.message);
      return jsonResponse({ error: 'Kon POK-betaling niet starten' }, 500, origin);
    }
  }

  // ---- POK PAY: webhook (POK bevestigt betaling -> credits bijschrijven) ----
  if (path === '/api/pok/webhook' && method === 'POST') {
    try {
      const raw = await request.text();
      console.log('[POK] webhook ontvangen:', raw.slice(0, 600));
      let evt = {};
      try { evt = JSON.parse(raw); } catch {}

      const o = evt?.data?.sdkOrder || evt?.sdkOrder || evt?.data || evt;
      const ourRef = o?.merchantCustomReference || evt?.merchantCustomReference;
      const statusStr = String(o?.status || evt?.status || evt?.event || evt?.type || '').toLowerCase();

      if (!ourRef) {
        console.error('[POK] webhook zonder merchantCustomReference');
        return new Response('OK');
      }

      const orderKey = 'payorder_' + ourRef;
      let order = null;
      try { const oraw = await db.get(orderKey); order = oraw ? JSON.parse(oraw) : null; } catch {}
      if (!order) { console.error('[POK] onbekende order:', ourRef); return new Response('OK'); }
      if (order.status === 'paid') return new Response('OK'); // idempotent

      const paid = (o && (o.isCaptured === true || o.isCompleted === true || o.isPaid === true))
        || ['paid', 'captured', 'completed', 'complete', 'success', 'succeeded', 'capture', 'confirmed'].some(s => statusStr.includes(s));
      if (!paid) {
        console.log('[POK] webhook status nog niet betaald:', statusStr, 'order', ourRef);
        return new Response('OK');
      }

      await purchaseCreditPackage(db, order.partnerId, order.packageKey, 'pok_' + ourRef);
      order.status = 'paid';
      order.paidAt = Date.now();
      await db.put(orderKey, JSON.stringify(order), { expirationTtl: 60 * 60 * 24 * 30 });
      console.log('[POK] betaling bevestigd, credits toegekend:', order.partnerId, order.packageKey);
      return new Response('OK');
    } catch (err) {
      console.error('[POK] webhook fout:', err.message);
      return new Response('error', { status: 500 });
    }
  }

  // ---- POK PAY: verifieer bij terugkeer (fallback als webhook niet komt) ----
  if (path === '/api/pok/verify' && method === 'POST') {
    try {
      const decoded = await isPartnerAuthorized(request, env);
      if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);
      const ref = body.ref || body.orderId;
      if (!ref) return jsonResponse({ error: 'ref ontbreekt' }, 400, origin);

      const orderKey = 'payorder_' + ref;
      let order = null;
      try { const oraw = await db.get(orderKey); order = oraw ? JSON.parse(oraw) : null; } catch {}
      if (!order) return jsonResponse({ error: 'Order niet gevonden' }, 404, origin);
      if (order.partnerId !== decoded.partnerId) return jsonResponse({ error: 'Niet jouw order' }, 403, origin);
      if (order.status === 'paid') return jsonResponse({ success: true, alreadyPaid: true, credits: (CREDIT_PACKAGES[order.packageKey] || {}).credits || null }, 200, origin);

      const apiBase = env.POK_API_BASE || (env.POK_ENV === 'production' ? 'https://api.pokpay.io' : 'https://api-staging.pokpay.io');

      const loginRes = await fetch(apiBase + '/auth/sdk/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId: env.POK_KEY_ID, keySecret: env.POK_KEY_SECRET })
      });
      const loginData = await loginRes.json().catch(() => ({}));
      const token = (loginData && loginData.data && (loginData.data.accessToken || loginData.data.token)) || loginData.token;
      if (!token) { console.error('[POK] verify: geen token'); return jsonResponse({ error: 'POK-login mislukt' }, 502, origin); }

      const statRes = await fetch(apiBase + '/sdk-orders/' + order.pokOrderId, {
        method: 'GET', headers: { 'Authorization': token }
      });
      const statText = await statRes.text();
      let statData = {};
      try { statData = JSON.parse(statText); } catch {}
      const so = (statData && statData.data && statData.data.sdkOrder) || (statData && statData.sdkOrder) || (statData && statData.data) || statData;
      const statusStr = String((so && so.status) || '').toLowerCase();
      const paid = (so && (so.isCaptured === true || so.isCompleted === true || so.isPaid === true))
        || ['paid', 'captured', 'completed', 'success', 'succeeded', 'confirmed'].some(function (s) { return statusStr.includes(s); });

      if (!paid) return jsonResponse({ success: false, error: 'Betaling nog niet bevestigd' }, 200, origin);

      await purchaseCreditPackage(db, order.partnerId, order.packageKey, 'pok_' + ref);
      order.status = 'paid';
      order.paidAt = Date.now();
      await db.put(orderKey, JSON.stringify(order), { expirationTtl: 60 * 60 * 24 * 30 });
      console.log('[POK] verify: credits toegekend', order.partnerId, order.packageKey);
      return jsonResponse({ success: true, credits: (CREDIT_PACKAGES[order.packageKey] || {}).credits || null }, 200, origin);
    } catch (err) {
      console.error('[POK] verify fout:', err.message);
      return jsonResponse({ error: 'Verificatie mislukt' }, 500, origin);
    }
  }

  // ============================================
  // ADMIN: SYSTEM HEALTH CHECK
  // ============================================
  if (path === '/api/admin/health' && method === 'GET') {
    const decoded = await isAdminAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

    const tests = [];
    const startTime = Date.now();

    // -- TEST 1: Database (KV) --
    try {
      const testKey = 'health_test_' + Date.now();
      await db.put(testKey, JSON.stringify({ test: true, time: Date.now() }));
      const testData = await db.get(testKey);
      await db.delete(testKey);
      const parsed = testData ? JSON.parse(testData) : null;
      if (parsed && parsed.test) {
        tests.push({ name: 'database', label: 'Database (KV)', status: 'ok', detail: 'Lezen/schrijven werkt' });
      } else {
        tests.push({ name: 'database', label: 'Database (KV)', status: 'error', detail: 'Data komt niet correct terug' });
      }
    } catch (err) {
      tests.push({ name: 'database', label: 'Database (KV)', status: 'error', detail: err.message });
    }

    // -- TEST 2: Creditsysteem configuratie --
    try {
      const hasPackages = Object.keys(CREDIT_PACKAGES).length > 0;
      const hasExpiry = CREDIT_EXPIRY_DAYS > 0;
      const hasPostCost = POST_COST > 0;
      if (hasPackages && hasExpiry && hasPostCost) {
        tests.push({
          name: 'credits_config', label: 'Creditsysteem Config',
          status: 'ok',
          detail: Object.keys(CREDIT_PACKAGES).length + ' pakketten, ' + CREDIT_EXPIRY_DAYS + ' dagen verval, ' + POST_COST + ' credit per post'
        });
      } else {
        tests.push({ name: 'credits_config', label: 'Creditsysteem Config', status: 'warning', detail: 'Configuratie incompleet' });
      }
    } catch (err) {
      tests.push({ name: 'credits_config', label: 'Creditsysteem Config', status: 'error', detail: err.message });
    }

    // -- TEST 3: Partner Login systeem --
    try {
      const testPartner = await getPartnerByEmail(db, 'health_check_test@savoraapp.com');
      if (!testPartner) {
        // Maak een tijdelijke test partner aan
        const testPartnerData = {
          id: 'health_test_partner_' + Date.now(),
          business: 'Health Test Partner',
          contact: 'health_check_test@savoraapp.com',
          name: 'Health Test',
          password: await hashPassword('test_password_123'),
          code: '000000',
          codeExpires: Date.now() + 3600000,
          status: 'active',
          verified: true,
          credits: 10,
          createdAt: new Date().toISOString()
        };
        await savePartner(db, testPartnerData);

        // Test login
        const partner = await getPartnerByEmail(db, 'health_check_test@savoraapp.com');
        if (partner && await verifyPassword('test_password_123', partner.password)) {
          tests.push({ name: 'partner_login', label: 'Partner Login', status: 'ok', detail: 'Inloggen werkt correct' });
        } else {
          tests.push({ name: 'partner_login', label: 'Partner Login', status: 'error', detail: 'Wachtwoord verificatie mislukt' });
        }

        // Cleanup
        await db.delete('partner_id:' + testPartnerData.id);
        await db.delete('partner_email:' + testPartnerData.contact.toLowerCase());
      }
    } catch (err) {
      tests.push({ name: 'partner_login', label: 'Partner Login', status: 'error', detail: err.message });
    }

    // -- TEST 4: Credits Kopen (simulatie) --
    try {
      // Controleer of credit purchase logica bereikbaar is
      const testPartnerId = 'health_credit_test_' + Date.now();
      const purchaseResult = await purchaseCreditPackage(db, testPartnerId, 'basic', 'health_test');

      if (purchaseResult.success && purchaseResult.credits === CREDIT_PACKAGES.basic.credits) {
        tests.push({ name: 'credits_purchase', label: 'Credits Kopen', status: 'ok', detail: purchaseResult.credits + ' credits gekocht' });
      } else {
        tests.push({ name: 'credits_purchase', label: 'Credits Kopen', status: 'error', detail: purchaseResult.error || 'Aankoop mislukt' });
      }

      // Cleanup test credit package
      const pkgKeys = await db.list({ prefix: 'creditpkg_' + testPartnerId + '_' });
      for (const key of pkgKeys.keys || []) {
        await db.delete(key.name);
      }
    } catch (err) {
      tests.push({ name: 'credits_purchase', label: 'Credits Kopen', status: 'error', detail: err.message });
    }

    // -- TEST 5: Credit Aftrek bij Publicatie --
    try {
      const testPartnerId = 'health_deduct_test_' + Date.now();
      // Eerst credits toevoegen
      await purchaseCreditPackage(db, testPartnerId, 'basic', 'health_test');
      const beforeBalance = await getCreditBalance(db, testPartnerId);

      if (beforeBalance >= POST_COST) {
        const deductResult = await deductCredit(db, testPartnerId, 'health_ad_' + Date.now(), 'daily_deal');
        if (deductResult.success && deductResult.transaction) {
          tests.push({ name: 'credits_deduct', label: 'Credit Aftrek bij Publicatie', status: 'ok', detail: POST_COST + ' credit afgetrokken, resterend: ' + deductResult.remainingCredits });
        } else {
          tests.push({ name: 'credits_deduct', label: 'Credit Aftrek bij Publicatie', status: 'error', detail: deductResult.error || 'Aftrek mislukt' });
        }
      } else {
        tests.push({ name: 'credits_deduct', label: 'Credit Aftrek bij Publicatie', status: 'error', detail: 'Onvoldoende test credits' });
      }

      // Cleanup
      const pkgKeys = await db.list({ prefix: 'creditpkg_' + testPartnerId + '_' });
      for (const key of pkgKeys.keys || []) {
        await db.delete(key.name);
      }
    } catch (err) {
      tests.push({ name: 'credits_deduct', label: 'Credit Aftrek bij Publicatie', status: 'error', detail: err.message });
    }

    // -- TEST 6: Automatisch Verlopen na 24 uur --
    try {
      const testPartnerId = 'health_expiry_test_' + Date.now();
      await purchaseCreditPackage(db, testPartnerId, 'basic', 'health_test');
      const deductResult = await deductCredit(db, testPartnerId, 'health_ad_' + Date.now(), 'daily_deal');

      if (deductResult.success && deductResult.transaction) {
        const tx = deductResult.transaction;
        const expiryTime = tx.expiresAt;
        const now = Date.now();
        const hoursUntilExpiry = Math.round((expiryTime - now) / (1000 * 60 * 60));

        if (hoursUntilExpiry >= 23 && hoursUntilExpiry <= 25) {
          tests.push({ name: 'post_expiry_24h', label: 'Post verloopt na 24 uur', status: 'ok', detail: 'Post verloopt over ' + hoursUntilExpiry + ' uur' });
        } else {
          tests.push({ name: 'post_expiry_24h', label: 'Post verloopt na 24 uur', status: 'warning', detail: 'Verwacht: ~24u, Gemeten: ' + hoursUntilExpiry + 'u' });
        }
      } else {
        tests.push({ name: 'post_expiry_24h', label: 'Post verloopt na 24 uur', status: 'error', detail: 'Kon geen transactie aanmaken' });
      }

      // Cleanup
      const pkgKeys = await db.list({ prefix: 'creditpkg_' + testPartnerId + '_' });
      for (const key of pkgKeys.keys || []) {
        await db.delete(key.name);
      }
    } catch (err) {
      tests.push({ name: 'post_expiry_24h', label: 'Post verloopt na 24 uur', status: 'error', detail: err.message });
    }

    // -- TEST 7: Pakket Vervalt na 90 Dagen --
    try {
      const testPartnerId = 'health_pkg_expiry_test_' + Date.now();
      const purchaseResult = await purchaseCreditPackage(db, testPartnerId, 'basic', 'health_test');

      if (purchaseResult.success && purchaseResult.expiresAt) {
        const daysUntilExpiry = Math.round((purchaseResult.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntilExpiry >= 89 && daysUntilExpiry <= 91) {
          tests.push({ name: 'package_expiry_90d', label: 'Pakket vervalt na 90 dagen', status: 'ok', detail: 'Pakket vervalt over ' + daysUntilExpiry + ' dagen' });
        } else {
          tests.push({ name: 'package_expiry_90d', label: 'Pakket vervalt na 90 dagen', status: 'warning', detail: 'Verwacht: ~90d, Gemeten: ' + daysUntilExpiry + 'd' });
        }
      } else {
        tests.push({ name: 'package_expiry_90d', label: 'Pakket vervalt na 90 dagen', status: 'error', detail: 'Kon geen pakket aanmaken' });
      }

      // Cleanup
      const pkgKeys = await db.list({ prefix: 'creditpkg_' + testPartnerId + '_' });
      for (const key of pkgKeys.keys || []) {
        await db.delete(key.name);
      }
    } catch (err) {
      tests.push({ name: 'package_expiry_90d', label: 'Pakket vervalt na 90 dagen', status: 'error', detail: err.message });
    }

    // -- TEST 8: Geen Advertentie bij 0 Credits --
    try {
      const testPartnerId = 'health_zero_test_' + Date.now();
      // Partner zonder credits
      const zeroPartner = {
        id: testPartnerId,
        business: 'Zero Credit Test',
        contact: 'zero_test@savoraapp.com',
        name: 'Zero Test',
        password: await hashPassword('test123'),
        status: 'active',
        verified: true,
        credits: 0,
        createdAt: new Date().toISOString()
      };
      await savePartner(db, zeroPartner);

      const deductResult = await deductCredit(db, testPartnerId, 'health_ad_' + Date.now(), 'daily_deal');

      if (!deductResult.success) {
        tests.push({ name: 'zero_credits_block', label: 'Geen advertentie bij 0 credits', status: 'ok', detail: 'Correct geblokkeerd: ' + (deductResult.error || 'Geen credits') });
      } else {
        tests.push({ name: 'zero_credits_block', label: 'Geen advertentie bij 0 credits', status: 'error', detail: 'Advertentie wel geplaatst ondanks 0 credits' });
      }

      // Cleanup
      await db.delete('partner_id:' + testPartnerId);
      await db.delete('partner_email:zero_test@savoraapp.com');
    } catch (err) {
      tests.push({ name: 'zero_credits_block', label: 'Geen advertentie bij 0 credits', status: 'error', detail: err.message });
    }

    // -- TEST 9: E-mail Configuratie --
    try {
      if (env.RESEND_API_KEY) {
        tests.push({ name: 'email_config', label: 'E-mail Configuratie', status: 'ok', detail: 'Resend API key geconfigureerd' });
      } else {
        tests.push({ name: 'email_config', label: 'E-mail Configuratie', status: 'warning', detail: 'Geen Resend API key gevonden' });
      }
    } catch (err) {
      tests.push({ name: 'email_config', label: 'E-mail Configuratie', status: 'error', detail: err.message });
    }

    // -- TEST 10: Admin Login --
    try {
      if (env.ADMIN_USER && env.ADMIN_PASS) {
        tests.push({ name: 'admin_login', label: 'Admin Login', status: 'ok', detail: 'Admin credentials geconfigureerd' });
      } else {
        tests.push({ name: 'admin_login', label: 'Admin Login', status: 'error', detail: 'Admin-login UITGESCHAKELD: ADMIN_USER/ADMIN_PASS niet ingesteld' });
      }
    } catch (err) {
      tests.push({ name: 'admin_login', label: 'Admin Login', status: 'error', detail: err.message });
    }

    // -- TEST 11: JWT Configuratie --
    try {
      if (env.JWT_SECRET && env.JWT_SECRET.length > 10) {
        tests.push({ name: 'jwt_config', label: 'JWT Configuratie', status: 'ok', detail: 'JWT secret geconfigureerd' });
      } else {
        tests.push({ name: 'jwt_config', label: 'JWT Configuratie', status: 'warning', detail: 'JWT secret mogelijk te kort' });
      }
    } catch (err) {
      tests.push({ name: 'jwt_config', label: 'JWT Configuratie', status: 'error', detail: err.message });
    }

    // Samenvatting
    const passed = tests.filter(t => t.status === 'ok').length;
    const warnings = tests.filter(t => t.status === 'warning').length;
    const errors = tests.filter(t => t.status === 'error').length;
    const total = tests.length;

    return jsonResponse({
      success: true,
      summary: {
        total,
        passed,
        warnings,
        errors,
        overall: errors === 0 ? (warnings === 0 ? 'healthy' : 'degraded') : 'critical',
        responseTime: Date.now() - startTime + 'ms'
      },
      tests
    }, 200, origin);
  }

  // ============================================
  // 404
  // ============================================
  return jsonResponse({ error: 'Endpoint niet gevonden', path }, 404, origin);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (err) {
      console.error('Worker error:', err.message);
      return new Response(JSON.stringify({ error: 'Interne serverfout' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
