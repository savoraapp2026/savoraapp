# Automatische Deploy via GitHub Actions

## Wat je nodig hebt

- GitHub account (gratis)
- Deze repository geupload naar GitHub

## Stap 1: Maak GitHub repository

1. Ga naar [github.com](https://github.com)
2. Klik "New repository"
3. Naam: `savoraapp`
4. Klik "Create repository"

## Stap 2: Upload code

```bash
cd C:\savoraapp\Savoraapp.com
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/JOUW-NAAM/savoraapp.git
git push -u origin main
```

## Stap 3: Cloudflare API Token aanmaken

1. Ga naar [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Klik "Create Token"
3. Klik "Use template" bij "Edit Cloudflare Workers"
4. Account Resources: Include - Jouw account
5. Zone Resources: Include - Jouw zone (savoraapp.com)
6. Klik "Continue to summary"
7. Klik "Create token"
8. Kopieer de token

## Stap 4: Secrets toevoegen in GitHub

1. Ga naar je repository op GitHub
2. Klik "Settings" → "Secrets and variables" → "Actions"
3. Klik "New repository secret"
4. Voeg toe:

| Secret naam | Waarde |
|-------------|--------|
| `CLOUDFLARE_API_TOKEN` | Jouw API token |
| `CLOUDFLARE_ACCOUNT_ID` | de262f98ef47a3a6c986661d98a0c217 |

## Stap 5: Test de automatische deploy

Nu deployt alles automatisch bij elke push:

1. Wijzig een bestand
2. Commit en push:
```bash
git add .
git commit -m "Update"
git push
```
3. Ga naar "Actions" tab in GitHub
4. Zie de automatische deploy starten!

## Manueel triggeren

Ga naar "Actions" → "Deploy to Cloudflare" → "Run workflow"
