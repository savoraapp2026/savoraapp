@echo off
chcp 65001 >nul
echo ========================================
echo  SAVORAPP.COM - SECRETS INSTELLEN
echo ========================================
echo.
echo Dit script stelt alle secrets in voor Cloudflare.
echo Je moet dit maar 1x doen!
echo.
echo Druk op een toets om te beginnen...
pause >nul

cd /d "C:\Savoraapp.com"

echo.
echo [1/6] JWT_SECRET instellen...
echo    (gebruik: savoraapp_jwt_geheim_2026_veilig)
call npx wrangler secret put JWT_SECRET

echo.
echo [2/6] ADMIN_PASS instellen...
echo    (gebruik: Savora2026!)
call npx wrangler secret put ADMIN_PASS

echo.
echo [3/6] RESEND_API_KEY instellen...
echo    (gebruik: re_XCvJyLXW_MsH8iCW1Dh6nPvffYb8af5Gk)
call npx wrangler secret put RESEND_API_KEY

echo.
echo [4/6] PAYSERA_PASSWORD instellen...
echo    (jouw Paysera merchant password)
call npx wrangler secret put PAYSERA_PASSWORD

echo.
echo [5/6] FRONTEND_URL instellen...
echo    (gebruik: https://savoraapp.com)
call npx wrangler secret put FRONTEND_URL

echo.
echo [6/6] Worker deployen...
call npx wrangler deploy

echo.
echo ========================================
echo  ✅ ALLE SECRETS INGESTELD!
echo ========================================
echo.
pause
