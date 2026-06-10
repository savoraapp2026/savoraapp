@echo off
chcp 65001 >nul
echo ==========================================
echo  Savoraapp - Worker Deploy Script
echo ==========================================
echo.

REM Controleer of wrangler geïnstalleerd is
where wrangler >nul 2>nul
if %errorlevel% neq 0 (
  echo [INFO] Wrangler niet gevonden. Installeren...
  call npm install -g wrangler
)

echo [1/3] Controleer of wrangler.toml bestaat...
if not exist "wrangler.toml" (
  echo [FOUT] wrangler.toml niet gevonden!
  echo Zorg dat dit script in de Savoraapp.com map staat.
  pause
  exit /b 1
)

echo [2/3] Controleer of worker.js bestaat...
if not exist "worker.js" (
  echo [FOUT] worker.js niet gevonden!
  pause
  exit /b 1
)

echo [3/3] Deploy worker naar Cloudflare...
call wrangler deploy worker.js

if %errorlevel% equ 0 (
  echo.
  echo ==========================================
  echo  DEPLOY SUCCESVOL!
  echo ==========================================
  echo.
  echo De nieuwe worker.js is nu live.
  echo Test de login op: https://savoraapp.sparkling-scene-16e3.workers.dev/api/partner/login
  echo.
) else (
  echo.
  echo [FOUT] Deploy mislukt. Controleer je internetverbinding en API token.
  echo.
  echo Tip: Log eerst in met: wrangler login
  echo.
)

pause
