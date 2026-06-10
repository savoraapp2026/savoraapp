@echo off
chcp 65001 >nul
echo ==========================================
echo  Savoraapp - Frontend Deploy Script
echo ==========================================
echo.
echo [INFO] Dit script maakt een ZIP van de public map
echo        zodat je deze kunt uploaden naar Cloudflare Pages.
echo.

set TIMESTAMP=%date:~6,4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%
set TIMESTAMP=%TIMESTAMP: =0%
set ZIPNAME=frontend-deploy-%TIMESTAMP%.zip

echo [1/2] ZIP maken van public map...
cd public
if not exist "index.html" (
  echo [FOUT] index.html niet gevonden in public map!
  echo Zorg dat dit script in de Savoraapp.com map staat.
  pause
  exit /b 1
)

powershell -Command "Compress-Archive -Path * -DestinationPath ..\%ZIPNAME% -Force"
cd ..

if exist "%ZIPNAME%" (
  echo [2/2] ZIP gemaakt: %ZIPNAME%
  echo.
  echo ==========================================
  echo  SUCCES!
  echo ==========================================
  echo.
  echo Upload nu dit bestand naar Cloudflare Pages:
  echo   %CD%\%ZIPNAME%
  echo.
  echo Stappen:
  echo   1. Ga naar https://dash.cloudflare.com
  echo   2. Klik op Workers & Pages ^> Pages
  echo   3. Klik je project aan (savoraapp-eh5)
  echo   4. Klik "Create Deployment"
  echo   5. Upload %ZIPNAME%
  echo   6. Klik "Deploy"
  echo.
  start explorer /select,"%CD%\%ZIPNAME%"
) else (
  echo [FOUT] ZIP maken mislukt.
)

pause
