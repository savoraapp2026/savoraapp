@echo off
chcp 65001 >nul
echo ========================================
echo  SAVORAPP.COM - AUTOMATISCHE DEPLOY
echo ========================================
echo.

set PROJECT_DIR=C:\savoraapp\Savoraapp.com

if not exist "%PROJECT_DIR%\public\index.html" (
  echo ❌ FOUT: Map niet gevonden op %PROJECT_DIR%
  echo    Pak eerst de ZIP uit naar C:\savoraapp\
  pause
  exit /b 1
)

echo [1/3] Deploy Worker (backend)...
cd /d "%PROJECT_DIR%"
call npx wrangler deploy
if %errorlevel% neq 0 (
  echo ❌ Worker deploy mislukt
  pause
  exit /b 1
)
echo ✅ Worker deployed!
echo.

echo [2/3] Deploy Frontend (Pages)...
cd /d "%PROJECT_DIR%\public"
call npx wrangler pages deploy . --project-name=savoraapp --branch=main
if %errorlevel% neq 0 (
  echo ❌ Frontend deploy mislukt
  pause
  exit /b 1
)
echo ✅ Frontend deployed!
echo.

echo [3/3] Test URLs...
echo    Frontend:  https://savoraapp.com
echo    Preview:   https://main.savoraapp.pages.dev
echo    Worker:    https://savoraapp-api.sparkling-scene-16e3.workers.dev
echo.
echo ========================================
echo  ✅ DEPLOY KLAAR!
echo ========================================
pause
