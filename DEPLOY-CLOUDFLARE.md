# Savoraapp.com - Cloudflare Deploy Handleiding

## Stap 1: Installeer Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

## Stap 2: Maak een KV Namespace

```bash
wrangler kv:namespace create "SAVORAPP_DB"
```

Kopieer de ID die je terugkrijgt en plak deze in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SAVORAPP_DB"
id = "JOUW_KV_NAMESPACE_ID_HIER"
```

## Stap 3: Zet Secrets

```bash
wrangler secret put JWT_SECRET
# Voer een sterke secret in (minimaal 32 karakters)
# Genereer: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

wrangler secret put PAYSERA_PASSWORD
wrangler secret put RESEND_API_KEY
wrangler secret put ADMIN_PASS
```

## Stap 4: Deploy de Worker

```bash
wrangler deploy
```

Je krijgt een URL zoals: `https://savoraapp-api.jouw-naam.workers.dev`

## Stap 5: Update Frontend API URL

In `public/js/config.js`, voeg je domein toe:

```javascript
var API_URLS = {
  localhost: 'http://localhost:3000',
  '127.0.0.1': 'http://127.0.0.1:3000',
  'savoraapp.com': 'https://savoraapp-api.jouw-naam.workers.dev',
  'www.savoraapp.com': 'https://savoraapp-api.jouw-naam.workers.dev'
};
```

## Stap 6: Deploy Frontend (Cloudflare Pages)

```bash
# Installeer pages
npm install -g @cloudflare/pages-cli

# Deploy public/ map
wrangler pages deploy public --project-name=savoraapp
```

Of gebruik Git integration:
1. Push naar GitHub
2. Connect repo in Cloudflare Dashboard
3. Set build command: `echo "No build"`
4. Set output directory: `public`

## URLs na deploy

| Component | URL |
|-----------|-----|
| Frontend (Pages) | `https://savoraapp.pages.dev` of je eigen domein |
| Backend API (Worker) | `https://savoraapp-api.jouw-naam.workers.dev` |

## Environment Variables (.env lokaal)

```env
PORT=3000
JWT_SECRET=jouw_sterke_secret
PAYSERA_PASSWORD=...
ADMIN_PASS=...
RESEND_API_KEY=...
```

## Belangrijke verschillen

| Express (lokaal) | Cloudflare Worker |
|-------------------|-------------------|
| `node server.js` | `wrangler deploy` |
| JSON bestanden als DB | Cloudflare KV |
| `jsonwebtoken` package | Web Crypto API |
| `localhost:3000` | `workers.dev` URL |
| CORS via npm cors | CORS via headers |
