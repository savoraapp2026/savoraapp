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
  const allowed = [
    'https://savoraapp.com',
    'https://www.savoraapp.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://savoraapp.sparkling-scene-16e3.workers.dev',
    'https://api.savoraapp.com',
    'https://tf6qb34cfkmra.kimi.show'
  ];
  const allowedPatterns = [
    /^https:\/\/[^.]+\.savoraapp-eh5\.pages\.dev$/,
    /^https:\/\/[^.]+\.savoraapp\.pages\.dev$/,
    /^https:\/\/[^.]+\.savoraapp\.workers\.dev$/
  ];
  const isAllowed = allowed.includes(origin) || allowedPatterns.some(p => p.test(origin));
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
  basic:    { id: 'basic',    name: 'Pako Baze',     credits: 20,  price: 500,  label: 'Pako Baze' },
  standard: { id: 'standard', name: 'Pako Standarte', credits: 50,  price: 1000, label: 'Pako Standarte' },
  premium:  { id: 'premium',  name: 'Pako Premium',   credits: 120, price: 1800, label: 'Pako Premium' }
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
    return jsonResponse({ status: 'ok', version: '2.3.1-secure', time: new Date().toISOString() }, 200, origin);
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
      credits: 0,
      creditHistory: [],
      createdAt: new Date().toISOString()
    };

    await savePartner(db, partner);

    // Stuur email via Resend (fire and forget via ctx.waitUntil)
    if (ctx && env.RESEND_API_KEY) {
      ctx.waitUntil(
        fetch('https://api.resend.com/emails', {
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
        }).catch(() => {})
      );
    }

    return jsonResponse({
      success: true,
      message: 'Registratie ontvangen. Controleer je email en voer de verificatiecode in om je account te activeren.',
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

    return jsonResponse({
      success: true,
      message: 'Account geverifieerd! Je kunt nu inloggen.',
      business: partner.business
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

    return jsonResponse({
      success: true,
      credits: liveCredits,
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

    partner.credits = (partner.credits || 0) + credits;
    partner.creditHistory = partner.creditHistory || [];
    partner.creditHistory.push({ type: 'admin_adjustment', credits, reason: reason || 'Admin', date: new Date().toISOString() });
    await savePartner(db, partner);

    return jsonResponse({ success: true, credits: partner.credits }, 200, origin);
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
      const amountCents = pkgDef.price * 100;

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
