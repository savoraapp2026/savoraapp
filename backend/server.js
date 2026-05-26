require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const https = require('https');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'savora_fallback_secret_change_me';

// ===== CORS - Alleen nodig voor externe origins =====
const corsOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:8000',
  process.env.FRONTEND_URL_ALT || 'http://127.0.0.1:8000'
].filter(Boolean);

app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ===== CONFIG (uit .env) =====
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'Savoraapp <noreply@savoraapp.com>';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'savora2026';

// ===== DATABASE =====
const DB_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

function readDB(name) {
  const f = path.join(DB_DIR, `${name}.json`);
  if (!fs.existsSync(f)) return [];
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return []; }
}
function writeDB(name, data) {
  fs.writeFileSync(path.join(DB_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

// ===== RATE LIMITING =====
const loginAttempts = {};
function checkRateLimit(ip) {
  const now = Date.now();
  if (!loginAttempts[ip]) loginAttempts[ip] = [];
  loginAttempts[ip] = loginAttempts[ip].filter(t => now - t < 15 * 60 * 1000);
  if (loginAttempts[ip].length >= 5) return false;
  loginAttempts[ip].push(now);
  return true;
}

// ===== RESEND EMAIL =====
function sendEmailViaResend(to, subject, html) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      from: RESEND_FROM, to: [to], subject, html,
      text: html.replace(/<[^>]*>/g, '')
    });
    const req = https.request({
      hostname: 'api.resend.com', port: 443, path: '/emails', method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const logs = readDB('emails');
            logs.push({ to, subject, id: r.id, sentAt: new Date().toISOString() });
            writeDB('emails', logs);
            resolve({ success: true, id: r.id });
          } else reject(new Error(r.message || 'Email failed'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function generateCode() { return Math.floor(100000 + Math.random() * 900000).toString(); }

// ===== JWT HELPERS =====
function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

function isAuthorized(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return false;
  const decoded = verifyToken(token);
  return decoded !== null;
}

// ===== HEALTH =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', provider: 'resend.com', time: new Date().toISOString() });
});

// ===== PARTNER: REGISTER =====
app.post('/api/partner/register', async (req, res) => {
  const { business, contact, password, nipt, city } = req.body;
  if (!business || !contact || !password || !nipt || !city) {
    return res.status(400).json({ error: 'Alle velden verplicht' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Wachtwoord minimaal 6 tekens' });

  // Check of email al geregistreerd is
  const partners = readDB('partners');
  const existing = partners.find(p => p.contact === contact);
  if (existing) {
    return res.status(409).json({ 
      error: 'Dit e-mailadres is al geregistreerd. Log in met je bestaande account.',
      alreadyRegistered: true 
    });
  }

  const code = generateCode();
  const registration = {
    id: Date.now().toString(),
    business, contact, password, nipt, city, code,
    status: 'pending', verified: false,
    createdAt: new Date().toISOString()
  };
  const allPartners = readDB('partners');
  allPartners.push(registration);
  writeDB('partners', allPartners);

  try {
    await sendEmailViaResend(contact, 'Savoraapp Verificatiecode', `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="width:48px;height:48px;background:linear-gradient(135deg,#10B981,#34D399);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:24px;">S</div>
          <h1 style="color:#10B981;margin-top:12px;">Savora<span style="color:#34D399;">app</span></h1>
        </div>
        <h2>Welkom als partner!</h2>
        <p>Bedankt voor je aanmelding.</p>
        <div style="background:#F1F5F9;border-radius:16px;padding:24px;text-align:center;margin:24px 0;">
          <p style="color:#64748B;font-size:14px;">Je verificatiecode (24 uur geldig):</p>
          <p style="font-size:36px;font-weight:800;color:#10B981;letter-spacing:8px;">${code}</p>
        </div>
        <p style="font-size:14px;color:#64748B;">Voer deze code in op de website.</p>
        <div style="border-top:1px solid #E2E8F0;padding-top:16px;font-size:12px;color:#94A3B8;">
          <p>Bedrijf: ${business}<br>NIPT: ${nipt}<br>Stad: ${city}</p>
        </div>
      </div>`);
    res.json({ success: true, message: 'Verificatiecode verstuurd', id: registration.id });
  } catch (err) {
    res.json({ success: true, message: 'Email mislukt', id: registration.id, code, emailFailed: true });
  }
});

// ===== PARTNER: VERIFY =====
app.post('/api/partner/verify', (req, res) => {
  const { id, code } = req.body;
  const partners = readDB('partners');
  const partner = partners.find(p => p.id === id);
  if (!partner) return res.status(404).json({ error: 'Niet gevonden' });
  if (partner.code !== code) return res.status(400).json({ error: 'Ongeldige code' });

  partner.verified = true;
  partner.status = 'active';
  partner.activated = true;
  partner.activatedAt = new Date().toISOString();
  partner.verifiedAt = new Date().toISOString();
  partner.role = 'partner';

  // Echte JWT token genereren
  const token = jwt.sign({ partnerId: partner.id, role: 'partner' }, JWT_SECRET, { expiresIn: '7d' });
  writeDB('partners', partners);

  res.json({ success: true, message: 'Bevestigd', token: token, partnerId: partner.id, partner: { business: partner.business, city: partner.city, name: partner.business } });
});

// ===== PARTNER: RESEND =====
app.post('/api/partner/resend', async (req, res) => {
  const { id, email } = req.body;
  const partners = readDB('partners');
  var partner = null;
  if (id) partner = partners.find(p => p.id === id);
  if (!partner && email) partner = partners.find(p => p.contact === email);
  if (!partner) return res.status(404).json({ error: 'Niet gevonden' });

  const newCode = generateCode();
  partner.code = newCode;
  writeDB('partners', partners);

  try {
    await sendEmailViaResend(partner.contact, 'Savoraapp - Nieuwe Code', `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2>Nieuwe verificatiecode</h2>
        <div style="background:#F1F5F9;border-radius:16px;padding:24px;text-align:center;">
          <p style="font-size:36px;font-weight:800;color:#10B981;letter-spacing:8px;">${newCode}</p>
          <p style="color:#64748B;font-size:12px;">24 uur geldig</p>
        </div>
      </div>`);
    res.json({ success: true, message: 'Code verstuurd' });
  } catch (err) {
    res.json({ success: true, message: 'Email failed', code: newCode, emailFailed: true });
  }
});

// ===== PARTNER: LOGIN =====
app.post('/api/partner/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email en wachtwoord invullen' });

  const partners = readDB('partners');
  const partner = partners.find(p => p.contact === email && p.password === password);
  if (!partner) return res.status(401).json({ error: 'Ongeldig' });
  if (!partner.verified) return res.status(403).json({ error: 'Account nog niet geverifieerd. Voer eerst je verificatiecode in.' });
  if (partner.status !== 'active') return res.status(403).json({ error: 'Account niet actief. Neem contact op met support.' });

  // Echte JWT token genereren
  const token = jwt.sign({ partnerId: partner.id, role: 'partner' }, JWT_SECRET, { expiresIn: '7d' });
  writeDB('partners', partners);

  res.json({ success: true, token, partnerId: partner.id, name: partner.name || partner.business, business: partner.business, email: partner.contact });
});

// ===== PARTNER: SESSION =====
app.get('/api/partner/session', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Niet ingelogd' });

  // Alleen JWT tokens accepteren
  const decoded = verifyToken(token);
  if (!decoded || !decoded.partnerId) return res.status(401).json({ error: 'Ongeldig token' });

  const partners = readDB('partners');
  const partner = partners.find(p => p.id === decoded.partnerId);
  if (!partner) return res.status(404).json({ error: 'Niet gevonden' });
  if (!partner.verified) return res.status(403).json({ error: 'Account niet geverifieerd' });

  res.json({ success: true, partnerId: partner.id, name: partner.name || partner.business, business: partner.business, email: partner.contact, verified: partner.verified, status: partner.status, role: partner.role });
});

// ===== PARTNER: LOGOUT =====
app.post('/api/partner/logout', (req, res) => {
  // Bij JWT: client-side verwijdert token uit localStorage
  // Server-side: voeg token toe aan blacklist (optioneel)
  res.json({ success: true });
});

// ===== CONTACT =====
app.post('/api/contact', (req, res) => {
  const { name, phone, email, city, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Naam, email, bericht verplicht' });

  const msgs = readDB('contacts');
  msgs.push({ id: Date.now().toString(), name, phone, email, city, message, createdAt: new Date().toISOString() });
  writeDB('contacts', msgs);
  res.json({ success: true, message: 'Verzonden' });
});

// ===== CREDITS SYSTEM WITH HISTORY =====
function loadCredits() { return readDB('credits_v2'); }
function saveCredits(data) { writeDB('credits_v2', data); }

function getOrCreateCreditUser(partnerId) {
  const credits = loadCredits();
  let user = credits.find(c => c.partnerId === partnerId);
  if (!user) {
    user = { partnerId, credits: 0, history: [], createdAt: new Date().toISOString() };
    credits.push(user);
    saveCredits(credits);
  }
  return user;
}

function addCreditHistory(partnerId, type, amount, description) {
  const credits = loadCredits();
  const user = credits.find(c => c.partnerId === partnerId);
  if (user) {
    user.history.push({
      type, amount,
      description: description || type,
      date: new Date().toISOString()
    });
    saveCredits(credits);
  }
}

app.post('/api/credits/purchase', (req, res) => {
  const { partnerId, amount } = req.body;
  if (!partnerId || amount === undefined || amount === null) {
    return res.status(400).json({ error: 'partnerId en amount verplicht' });
  }

  const credits = loadCredits();
  let user = credits.find(c => c.partnerId === partnerId);
  if (!user) {
    user = { partnerId, credits: 0, history: [], createdAt: new Date().toISOString() };
    credits.push(user);
  }

  user.credits += Number(amount);
  user.history.push({
    type: 'purchase',
    amount: Number(amount),
    description: 'Credits gekocht',
    date: new Date().toISOString()
  });

  saveCredits(credits);

  // Also save legacy format for admin compatibility
  const legacy = readDB('credits');
  legacy.push({
    id: Date.now().toString(),
    partnerId,
    package: 'direct',
    amount: 0,
    credits: Number(amount),
    status: 'completed',
    createdAt: new Date().toISOString()
  });
  writeDB('credits', legacy);

  res.json({ success: true, credits: user.credits, history: user.history });
});

app.get('/api/credits/:partnerId', (req, res) => {
  const credits = loadCredits();
  const user = credits.find(c => c.partnerId === req.params.partnerId);
  res.json({
    credits: user ? user.credits : 0,
    history: user ? user.history.slice(-20).reverse() : [],
    totalPurchases: user ? user.history.filter(h => h.type === 'purchase').reduce((s, h) => s + h.amount, 0) : 0,
    totalSpent: user ? user.history.filter(h => h.type === 'spend').reduce((s, h) => s + h.amount, 0) : 0
  });
});

// ===== PAYSERA PAYMENT INTEGRATION =====
const PAYSERA_PROJECT_ID = process.env.PAYSERA_PROJECT_ID || 'savoraapp';
const PAYSERA_PASSWORD = process.env.PAYSERA_PASSWORD || 'savora_paysera_secret_2026';
const SESSION_SECRET = process.env.SESSION_SECRET || 'savora_default_secret_change_me';
const PAYSERA_CALLBACK_IPS = ['127.0.0.1', '::1', '52.59.140.15', '54.93.56.24'];

function validatePayseraSignature(data, password) {
  const crypto = require('crypto');
  const params = Object.keys(data).sort().reduce((acc, key) => {
    if (key !== 'ss1' && key !== 'ss2' && data[key] !== undefined) {
      acc[key] = String(data[key]);
    }
    return acc;
  }, {});
  const signString = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&') + '&' + encodeURIComponent(password);
  return crypto.createHash('md5').update(signString).digest('hex');
}

function isPayseraIP(ip) {
  return PAYSERA_CALLBACK_IPS.includes(ip);
}

app.post('/api/paysera/create-payment', (req, res) => {
  const { partnerId, amount } = req.body;
  if (!partnerId || !amount) return res.status(400).json({ error: 'partnerId en amount verplicht' });

  const orderId = Date.now().toString();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';
  const apiUrl = process.env.API_BASE_URL || 'http://localhost:3000';
  const payseraUrl = `https://www.paysera.com/pay/?orderid=${orderId}&amount=${amount}&currency=LEK&projectid=${PAYSERA_PROJECT_ID}&accepturl=${frontendUrl}/partner-dashboard.html?paysera=success&cancelurl=${frontendUrl}/partner-dashboard.html?paysera=cancel&callbackurl=${apiUrl}/api/paysera/callback`;

  // Save pending order
  const orders = readDB('paysera_orders');
  orders.push({ orderId, partnerId, amount, status: 'pending', createdAt: new Date().toISOString() });
  writeDB('paysera_orders', orders);

  res.json({ success: true, url: payseraUrl, orderId });
});

app.post('/api/paysera/callback', (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress;

  // Security: IP whitelist check
  if (!isPayseraIP(clientIP)) {
    console.warn(`[PAYSERA] Callback rejected from IP: ${clientIP}`);
    return res.status(403).json({ error: 'IP not whitelisted' });
  }

  const { partnerId, amount, status, orderId, ss1, ss2 } = req.body;

  // Security: Signature validation
  const computedSig = validatePayseraSignature(req.body, PAYSERA_PASSWORD);
  if (ss1 && ss1 !== computedSig) {
    console.warn('[PAYSERA] Invalid signature');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  // Verify order exists
  const orders = readDB('paysera_orders');
  const order = orders.find(o => o.orderId === orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (status === '1' || status === 'success') {
    // Betaling ontvangen, maar credits pas na admin-goedkeuring
    order.status = 'paid_pending_approval';
    order.paidAt = new Date().toISOString();
    writeDB('paysera_orders', orders);

    // Log voor admin review (credits worden NIET automatisch toegevoegd)
    console.log(`[PAYSERA] Payment received, awaiting admin approval: partner=${partnerId}, amount=${amount}, order=${orderId}`);
  }

  res.sendStatus(200);
});

// ===== ADVERTISEMENTS =====
app.post('/api/advertisements', (req, res) => {
  const { partnerId, title, description, price, quantity, category, pickupTime } = req.body;
  if (!partnerId || !title || !price) return res.status(400).json({ error: 'Titel, prijs, partnerId verplicht' });

  const ad = { id: Date.now().toString(), partnerId, title, description, price, quantity, category, pickupTime, status: 'active', views: 0, reservations: 0, createdAt: new Date().toISOString() };
  const all = readDB('advertisements');
  all.push(ad);
  writeDB('advertisements', all);
  res.json({ success: true, ad });
});

app.get('/api/advertisements', (req, res) => {
  res.json({ advertisements: readDB('advertisements').reverse() });
});

app.get('/api/advertisements/:partnerId', (req, res) => {
  res.json({ advertisements: readDB('advertisements').filter(a => a.partnerId === req.params.partnerId).reverse() });
});

app.patch('/api/advertisements/:id', (req, res) => {
  const all = readDB('advertisements');
  const ad = all.find(a => a.id === req.params.id);
  if (!ad) return res.status(404).json({ error: 'Niet gevonden' });
  ad.status = req.body.status || ad.status;
  if (req.body.title) ad.title = req.body.title;
  if (req.body.price) ad.price = req.body.price;
  writeDB('advertisements', all);
  res.json({ success: true, ad });
});

// ===== ADMIN =====
app.post('/api/admin/login', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Te veel pogingen' });

  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    // Echte JWT token genereren
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Ongeldig' });
  }
});

app.get('/api/admin/data', (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Niet geautoriseerd' });
  const partners = readDB('partners');
  const contacts = readDB('contacts');
  const emails = readDB('emails');
  const credits = readDB('credits');
  const ads = readDB('advertisements');
  res.json({
    stats: {
      partners: partners.length,
      activePartners: partners.filter(p => p.verified).length,
      contacts: contacts.length,
      pendingVerifications: partners.filter(p => !p.verified).length,
      emails: emails.length,
      credits: credits.length,
      totalCreditsSold: credits.reduce((s, c) => s + c.credits, 0),
      advertisements: ads.length,
      activeAds: ads.filter(a => a.status === 'active').length
    },
    partners: partners.slice(-10).reverse(),
    contacts: contacts.slice(-10).reverse(),
    credits: credits.slice(-10).reverse(),
    advertisements: ads.slice(-10).reverse()
  });
});

app.post('/api/admin/logout', (req, res) => {
  // Bij JWT: client-side verwijdert token uit localStorage
  res.json({ success: true });
});

app.get('/api/admin/emails', (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Niet geautoriseerd' });
  res.json({ emails: readDB('emails').slice(-50).reverse() });
});

app.get('/api/admin/credits', (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Niet geautoriseerd' });
  res.json({ credits: readDB('credits').slice(-50).reverse() });
});

app.get('/api/admin/advertisements', (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Niet geautoriseerd' });
  const ads = readDB('advertisements');
  const partners = readDB('partners');
  res.json({ advertisements: ads.map(ad => {
    const p = partners.find(pt => pt.id === ad.partnerId);
    return { ...ad, partnerName: p ? p.business : 'Onbekend' };
  }).reverse() });
});

// ===== ADMIN: PAYMENT APPROVAL =====
app.get('/api/admin/payments/pending', (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Niet geautoriseerd' });

  const orders = readDB('paysera_orders');
  const partners = readDB('partners');

  // Alleen orders die betaald zijn maar nog niet goedgekeurd
  const pending = orders
    .filter(o => o.status === 'paid_pending_approval')
    .map(o => {
      const p = partners.find(pt => pt.id === o.partnerId);
      return {
        orderId: o.orderId,
        partnerId: o.partnerId,
        partnerName: p ? p.business : 'Onbekend',
        partnerEmail: p ? p.contact : '',
        amount: o.amount,
        currency: o.currency || 'LEK',
        paidAt: o.paidAt,
        requestedAt: o.createdAt
      };
    })
    .reverse();

  res.json({ success: true, payments: pending, count: pending.length });
});

app.post('/api/admin/payments/:orderId/approve', (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Niet geautoriseerd' });

  const orders = readDB('paysera_orders');
  const order = orders.find(o => o.orderId === req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order niet gevonden' });
  if (order.status !== 'paid_pending_approval') return res.status(400).json({ error: 'Order is niet in afwachting van goedkeuring' });

  const partnerId = order.partnerId;
  const amount = Number(order.amount);

  // 1. Credits toevoegen aan partner
  const credits = loadCredits();
  let user = credits.find(c => c.partnerId === partnerId);
  if (!user) {
    user = { partnerId, credits: 0, history: [], createdAt: new Date().toISOString() };
    credits.push(user);
  }
  user.credits += amount;
  user.history.push({
    type: 'paysera_payment_approved',
    amount: amount,
    description: `Paysera betaling goedgekeurd (order ${order.orderId})`,
    date: new Date().toISOString()
  });
  saveCredits(credits);

  // 2. Order status updaten
  order.status = 'completed';
  order.approvedAt = new Date().toISOString();
  order.approvedBy = 'admin';
  writeDB('paysera_orders', orders);

  // 3. Legacy log
  const legacy = readDB('credits');
  legacy.push({
    id: Date.now().toString(),
    partnerId,
    package: 'paysera',
    amount: order.amount,
    credits: amount,
    status: 'completed',
    payseraOrderId: order.orderId,
    approved: true,
    createdAt: new Date().toISOString()
  });
  writeDB('credits', legacy);

  res.json({ success: true, message: `Credits toegevoegd: ${amount} LEK voor partner ${partnerId}` });
});

app.post('/api/admin/payments/:orderId/reject', (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Niet geautoriseerd' });

  const orders = readDB('paysera_orders');
  const order = orders.find(o => o.orderId === req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order niet gevonden' });
  if (order.status !== 'paid_pending_approval') return res.status(400).json({ error: 'Order is niet in afwachting van goedkeuring' });

  order.status = 'rejected';
  order.rejectedAt = new Date().toISOString();
  order.rejectedBy = 'admin';
  writeDB('paysera_orders', orders);

  res.json({ success: true, message: 'Betaling afgewezen' });
});

// ===== 404 HANDLER =====
app.use((req, res) => {
  res.status(404).json({ error: 'Niet gevonden', path: req.path });
});

// ===== START =====
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('  SAVORAPP.COM');
  console.log('  http://localhost:' + PORT);
  console.log('  API: /api/...');
  console.log('  Static: ' + PUBLIC_DIR);
  console.log('  Email: ' + RESEND_FROM);
  console.log('='.repeat(50));
});
