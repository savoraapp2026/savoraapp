# Savoraapp - Food Surplus Marketplace

## Projectstructuur

```
savoraapp_package/
  backend/
    server.js          # Express API server (poort 3000)
  public/              # Frontend bestanden
    index.html         # Homepage
    partner.html       # Partner registratie
    partner-dashboard.html  # Partner dashboard
    admin.html         # Admin dashboard
    contact.html       # Contact pagina
    faq.html           # FAQ pagina
    privacy-policy.html
    terms-of-service.html
    cookie-policy.html
    *.css              # Stylesheets
  data/                # JSON database (wordt automatisch aangemaakt)
  package.json
  README.md
```

## Installatie

### Vereisten
- Node.js 18+ geinstalleerd

### Stap 1 - Dependencies installeren

Open PowerShell in de `savoraapp_package` map:

```powershell
cd C:\savoraapp\savoraapp_package
npm install
```

Er worden 3 packages geinstalleerd: express, cors, body-parser.

### Stap 2 - Backend starten

```powershell
cd C:\savoraapp\savoraapp_package\backend
node server.js
```

De server draait op: http://localhost:3000

### Stap 3 - Frontend starten

Open een **nieuw** PowerShell venster:

```powershell
cd C:\savoraapp\savoraapp_package\public
python -m http.server 8000
```

Of als je Node.js hebt:

```powershell
cd C:\savoraapp\savoraapp_package\public
npx serve -p 8000
```

### Stap 4 - Openen in browser

Ga naar: http://localhost:8000

## API Endpoints

| Methode | Endpoint | Beschrijving |
|---------|----------|--------------|
| GET | /api/health | Health check |
| POST | /api/partner/register | Partner registratie |
| POST | /api/partner/verify | Code verificatie |
| POST | /api/partner/resend | Code opnieuw versturen |
| POST | /api/partner/login | Partner login |
| GET | /api/partner/session | Sessie check |
| POST | /api/partner/logout | Uitloggen |
| POST | /api/contact | Contact formulier |
| POST | /api/credits/purchase | Credits kopen |
| GET | /api/credits/:partnerId | Credits ophalen |
| POST | /api/advertisements | Advertentie plaatsen |
| GET | /api/advertisements | Alle advertenties |
| GET | /api/advertisements/:partnerId | Partner advertenties |
| PATCH | /api/advertisements/:id | Advertentie updaten |
| POST | /api/admin/login | Admin login |
| GET | /api/admin/data | Admin dashboard data |
| GET | /api/admin/emails | Email logs |
| GET | /api/admin/credits | Credits overzicht |
| GET | /api/admin/advertisements | Advertenties overzicht |

## Gegevens

Alle gegevens worden opgeslagen in JSON bestanden in de `data/` map:
- partners.json
- sessions.json
- contacts.json
- credits.json
- advertisements.json
- emails.json

## Beveiliging

- Geen wachtwoorden worden naar de client gestuurd
- XSS bescherming via esc() functie
- Rate limiting op login (max 5 pogingen per 15 min)
- 30-min sessie timeout op partner dashboard
- CORS alleen vanaf localhost:8000

## Admin login
- Gebruikersnaam: `admin`
- Wachtwoord: `savora2026`

## Belangrijk
- De backend MOET draaien op poort 3000
- De frontend MOET draaien op poort 8000
- Email wordt verzonden via Resend.com API
- Bij email storing wordt de code op het scherm getoond
