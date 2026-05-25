// ============================================
// Savoraapp API - Cloudflare Worker v2.1
// - Backwards compatible met oude plaintext wachtwoorden
// - Ondersteunt BEIDE KV structuren (oud array + nieuw per-key)
// - Automatische migratie bij eerste login
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
    'http://127.0.0.1:3000'
  ];
  const allowedOrigin = allowed.includes(origin) ? origin : 'https://savoraapp.com';
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

// ----- Rate Limiting -----
const rateLimitMap = new Map();
function checkRateLimit(key, max = 5, windowMs = 900000) {
  const now = Date.now();
  const entry = rateLimitMap.get(key) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
  entry.count++;
  rateLimitMap.set(key, entry);
  return entry.count <= max;
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

// ===== MAIN ROUTER =====
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const origin = request.headers.get('Origin') || '';
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  let body = {};
  if (['POST', 'PATCH', 'PUT'].includes(method)) {
    try { body = await request.json(); } catch { body = {}; }
  }

  const db = env.VERIFICATION_KV;

  // ---- HEALTH ----
  if (path === '/api/health') {
    return jsonResponse({ status: 'ok', version: '2.1.0', time: new Date().toISOString() }, 200, origin);
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
        'POST /api/admin/credits'
      ]
    }, 200, origin);
  }

  // ============================================
  // REGISTER
  // ============================================
  if (path === '/api/partner/register' && method === 'POST') {
    // Ondersteunt zowel oud veld (contact) als nieuw (email)
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
      nipt,        // nieuw veld
      nui: nipt,   // alias voor frontend compatibiliteit
      city,
      password: await hashPassword(password), // altijd gehashed opslaan
      code,
      codeExpires: Date.now() + (35 * 24 * 60 * 60 * 1000),
      status: 'pending',
      verified: false,
      credits: 0,
      creditHistory: [],
      createdAt: new Date().toISOString()
    };

    await savePartner(db, partner);

    // DEV: log code (in productie: stuur via email)
    console.log(`[DEV] Code voor ${contact}: ${code}`);

    return jsonResponse({
      success: true,
      message: 'Registratie ontvangen. Controleer je email voor de verificatiecode.',
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
    if (partner.verified) return jsonResponse({ error: 'Account is al geverifieerd' }, 400, origin);

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
    if (!checkRateLimit('resend_' + ip, 3, 3600000)) {
      return jsonResponse({ error: 'Te veel verzoeken. Wacht een uur.' }, 429, origin);
    }

    const email = (body.email || body.contact || '').toLowerCase().trim();
    const id = body.id;

    let partner = email ? await getPartnerByEmail(db, email) : null;
    if (!partner && id) partner = await getPartnerById(db, id);
    if (!partner) return jsonResponse({ error: 'Niet gevonden' }, 404, origin);
    if (partner.verified) return jsonResponse({ error: 'Al geverifieerd' }, 400, origin);

    const newCode = generateCode();
    partner.code = newCode;
    partner.codeExpires = Date.now() + (35 * 24 * 60 * 60 * 1000);
    await savePartner(db, partner);

    console.log(`[DEV] Nieuwe code voor ${partner.contact}: ${newCode}`);

    return jsonResponse({ success: true, message: 'Nieuwe code verstuurd' }, 200, origin);
  }

  // ============================================
  // LOGIN — met automatische wachtwoord migratie
  // ============================================
  if (path === '/api/partner/login' && method === 'POST') {
    if (!checkRateLimit('login_' + ip, 5, 900000)) {
      return jsonResponse({ error: 'Te veel pogingen. Wacht 15 minuten.' }, 429, origin);
    }

    const email = (body.email || body.contact || '').toLowerCase().trim();
    const password = body.password;

    if (!email || !password) {
      return jsonResponse({ error: 'Email en wachtwoord zijn verplicht' }, 400, origin);
    }

    const partner = await getPartnerByEmail(db, email);
    if (!partner) {
      return jsonResponse({ error: 'Ongeldige inloggegevens' }, 401, origin);
    }

    if (!partner.verified || partner.status !== 'active') {
      return jsonResponse({ error: 'Account niet geverifieerd. Controleer je email.' }, 403, origin);
    }

    // Wachtwoord check — ondersteunt plaintext (oud) EN gehashed (nieuw)
    const passwordOk = await verifyPassword(password, partner.password);
    if (!passwordOk) {
      return jsonResponse({ error: 'Ongeldige inloggegevens' }, 401, origin);
    }

    // AUTOMATISCHE MIGRATIE: als wachtwoord nog plaintext was → nu hashen
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

    return jsonResponse({
      success: true,
      token,
      partnerId: partner.id,
      name: partner.name || partner.business,
      business: partner.business,
      email: partner.contact,
      nui: partner.nipt || partner.nui || '',   // beide velden voor compatibiliteit
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
    if (!checkRateLimit('forgot_' + ip, 3, 3600000)) {
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
    // Altijd zelfde response (voorkomt email enumeration)
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
  // CREDITS OPHALEN
  // ============================================
  if (path.startsWith('/api/credits/') && method === 'GET') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

    const partner = await getPartnerById(db, decoded.partnerId);
    return jsonResponse({
      success: true,
      credits: partner ? (partner.credits || 0) : 0,
      history: partner ? (partner.creditHistory || []) : []
    }, 200, origin);
  }

  // ============================================
  // CREDITS KOPEN
  // ============================================
  if (path === '/api/credits/purchase' && method === 'POST') {
    const decoded = await isPartnerAuthorized(request, env);
    if (!decoded) return jsonResponse({ error: 'Niet geautoriseerd' }, 401, origin);

    const { package: pkg, amount, credits } = body;
    if (!pkg || !amount || !credits) {
      return jsonResponse({ error: 'Pakket, bedrag en credits zijn verplicht' }, 400, origin);
    }

    const partner = await getPartnerById(db, decoded.partnerId);
    if (!partner) return jsonResponse({ error: 'Partner niet gevonden' }, 404, origin);

    partner.credits = (partner.credits || 0) + credits;
    partner.creditHistory = partner.creditHistory || [];
    partner.creditHistory.push({
      type: 'purchase', package: pkg, amount, credits,
      date: new Date().toISOString()
    });

    await savePartner(db, partner);
    return jsonResponse({ success: true, credits: partner.credits }, 200, origin);
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
  // ADMIN: INLOGGEN
  // ============================================
  if (path === '/api/admin/login' && method === 'POST') {
    if (!checkRateLimit('admin_' + ip, 3, 900000)) {
      return jsonResponse({ error: 'Te veel pogingen. Wacht 15 minuten.' }, 429, origin);
    }
    if (!env.ADMIN_USER || !env.ADMIN_PASS) {
      return jsonResponse({ error: 'Server niet geconfigureerd' }, 500, origin);
    }
    const { username, password } = body;
    if (username === env.ADMIN_USER && password === env.ADMIN_PASS) {
      const token = await jwtSign({ role: 'admin' }, env.JWT_SECRET, 86400);
      return jsonResponse({ success: true, token }, 200, origin);
    }
    return jsonResponse({ error: 'Ongeldige inloggegevens' }, 401, origin);
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
      // password wordt NOOIT meegestuurd
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
        activePartners: partners.filter(p => p.verified).length,
        pendingPartners: partners.filter(p => !p.verified).length,
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
  // 404
  // ============================================
  return jsonResponse({ error: 'Endpoint niet gevonden', path }, 404, origin);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      console.error('Worker error:', err.message);
      return new Response(JSON.stringify({ error: 'Interne serverfout' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};