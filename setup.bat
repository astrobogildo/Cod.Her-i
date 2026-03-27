@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║       Codigo: Heroi  —  Instalador Automatico          ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
echo  Se preferir, use o instalador PowerShell (recomendado):
echo    powershell -ExecutionPolicy Bypass -File setup.ps1
echo.

:: ─── Detect project root ───
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

set "ERROS=0"
set "SKIP_FRONTEND=0"

:: ═══════════════════════════════════════════════════════════════
:: 1. PYTHON
:: ═══════════════════════════════════════════════════════════════
echo [1/6] Verificando Python...
set "PYTHON="
where python >nul 2>&1 && for /f "delims=" %%i in ('where python') do set "PYTHON=%%i"
if not defined PYTHON where python3 >nul 2>&1 && for /f "delims=" %%i in ('where python3') do set "PYTHON=%%i"
if not defined PYTHON if exist "C:\Python312\python.exe" set "PYTHON=C:\Python312\python.exe"
if not defined PYTHON if exist "C:\Python313\python.exe" set "PYTHON=C:\Python313\python.exe"
if not defined PYTHON if exist "C:\Python311\python.exe" set "PYTHON=C:\Python311\python.exe"
if not defined PYTHON if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PYTHON=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PYTHON if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set "PYTHON=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
if not defined PYTHON if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PYTHON=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"

if not defined PYTHON (
    echo   [ERRO] Python nao encontrado!
    echo          Baixe em: https://www.python.org/downloads/
    echo          IMPORTANTE: Marque "Add Python to PATH" durante a instalacao.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('"%PYTHON%" --version 2^>^&1') do set "PYVER=%%v"
echo   OK: !PYVER!
echo       Caminho: %PYTHON%

:: ═══════════════════════════════════════════════════════════════
:: 2. NODE.JS
:: ═══════════════════════════════════════════════════════════════
echo.
echo [2/6] Verificando Node.js...
set "NODE="
set "NPM="
where node >nul 2>&1 && set "NODE=node" && set "NPM=npm"
if not defined NODE if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE=C:\Program Files\nodejs\node.exe"
    set "NPM=C:\Program Files\nodejs\npm.cmd"
    set "PATH=C:\Program Files\nodejs;%PATH%"
)

if not defined NODE (
    echo   [AVISO] Node.js nao encontrado.
    echo           Baixe em: https://nodejs.org/
    echo           O frontend nao sera instalado agora.
    set "SKIP_FRONTEND=1"
) else (
    for /f "delims=" %%v in ('node --version 2^>^&1') do set "NODEVER=%%v"
    echo   OK: Node !NODEVER!
)

:: ═══════════════════════════════════════════════════════════════
:: 3. GIT (opcional)
:: ═══════════════════════════════════════════════════════════════
echo.
echo [3/6] Verificando Git (opcional)...
set "GIT="
where git >nul 2>&1 && set "GIT=git"
if not defined GIT if exist "C:\Program Files\Git\cmd\git.exe" (
    set "GIT=C:\Program Files\Git\cmd\git.exe"
    set "PATH=C:\Program Files\Git\cmd;%PATH%"
)
if defined GIT (
    for /f "delims=" %%v in ('git --version 2^>^&1') do set "GITVER=%%v"
    echo   OK: !GITVER!
) else (
    echo   [INFO] Git nao encontrado. Nao e obrigatorio.
)

:: ═══════════════════════════════════════════════════════════════
:: 4. VIRTUAL ENVIRONMENT + BACKEND DEPS
:: ═══════════════════════════════════════════════════════════════
echo.
echo [4/6] Configurando ambiente Python (backend)...
echo.

:: 4a. Create venv if needed
if not exist "%ROOT%\.venv\Scripts\python.exe" (
    echo   Criando virtual environment...
    "%PYTHON%" -m venv "%ROOT%\.venv"
    if errorlevel 1 (
        echo   [ERRO] Falha ao criar venv. Tentando alternativa...
        "%PYTHON%" -m venv --without-pip "%ROOT%\.venv"
        if errorlevel 1 (
            echo   [ERRO] Nao foi possivel criar ambiente virtual.
            echo          Verifique se o Python esta instalado corretamente.
            pause
            exit /b 1
        )
    )
)
echo   Virtual environment: OK
echo.

:: 4b. Ensure pip is available
set "VPYTHON=%ROOT%\.venv\Scripts\python.exe"
set "VPIP=%ROOT%\.venv\Scripts\pip.exe"

if not exist "%VPIP%" (
    echo   pip nao encontrado no venv. Instalando pip...
    "%VPYTHON%" -m ensurepip --upgrade
    if errorlevel 1 (
        echo   [AVISO] ensurepip falhou, tentando get-pip...
        curl -sS https://bootstrap.pypa.io/get-pip.py -o "%TEMP%\get-pip.py"
        "%VPYTHON%" "%TEMP%\get-pip.py"
    )
)

:: 4c. Upgrade pip (show output)
echo   Atualizando pip...
"%VPYTHON%" -m pip install --upgrade pip 2>&1 | findstr /i "success install already"
echo.

:: 4d. Install each backend package individually with progress
echo   Instalando dependencias do backend:
echo   ─────────────────────────────────────
set "PKG_NUM=0"
set "PKG_FAIL=0"
for /f "usebackq tokens=* delims=" %%p in ("%ROOT%\backend\requirements.txt") do (
    set "PKG=%%p"
    if not "!PKG!"=="" if not "!PKG:~0,1!"=="#" (
        set /a PKG_NUM+=1
        echo.
        echo   [!PKG_NUM!] Instalando: %%p
        "%VPYTHON%" -m pip install "%%p" 2>&1 | findstr /v /i "already notice warning"
        if errorlevel 1 (
            echo        [FALHA] %%p — tentando novamente...
            "%VPYTHON%" -m pip install --no-cache-dir "%%p"
            if errorlevel 1 (
                echo        [ERRO] Nao foi possivel instalar %%p
                set /a PKG_FAIL+=1
            )
        )
    )
)
echo.
if !PKG_FAIL! GTR 0 (
    echo   [AVISO] !PKG_FAIL! pacote(s) falharam.
    echo           Tente: .venv\Scripts\pip install -r backend\requirements.txt
    set /a ERROS+=1
) else (
    echo   Todas as !PKG_NUM! dependencias do backend instaladas com sucesso!
)

:: ═══════════════════════════════════════════════════════════════
:: 5. FRONTEND DEPS
:: ═══════════════════════════════════════════════════════════════
echo.
echo [5/6] Configurando frontend...

if "%SKIP_FRONTEND%"=="1" (
    echo   [PULANDO] Node.js nao disponivel.
    goto :step6
)

cd /d "%ROOT%\frontend"
if exist "node_modules\react" (
    echo   Dependencias do frontend ja instaladas, OK.
) else (
    echo   Instalando dependencias (npm install)...
    echo   Isso pode levar alguns minutos na primeira vez...
    echo.
    call npm install 2>&1
    if errorlevel 1 (
        echo.
        echo   [AVISO] npm install falhou.
        echo           Tente manualmente: cd frontend ^& npm install
        set /a ERROS+=1
    ) else (
        echo.
        echo   Dependencias do frontend instaladas com sucesso!
    )
)
cd /d "%ROOT%"

:: ═══════════════════════════════════════════════════════════════
:: 6. VERIFICACAO FINAL
:: ═══════════════════════════════════════════════════════════════
:step6
echo.
echo [6/6] Verificacao final...

:: Test Python imports
echo   Testando imports do backend...
"%VPYTHON%" -c "import fastapi; import uvicorn; import sqlalchemy; import jose; import bcrypt; print('   Todos os modulos OK!')" 2>&1
if errorlevel 1 (
    echo   [ERRO] Alguns modulos nao foram importados corretamente.
    echo          Execute: .venv\Scripts\pip install -r backend\requirements.txt
    set /a ERROS+=1
)

echo.
echo  ╔══════════════════════════════════════════════════════════╗
if !ERROS! EQU 0 (
    echo  ║              INSTALACAO COMPLETA!                       ║
) else (
    echo  ║         INSTALACAO COMPLETA (com !ERROS! aviso(s^)^)        ║
)
echo  ╚══════════════════════════════════════════════════════════╝
echo.
echo  Para iniciar o servidor, execute:
echo.
echo    start.bat
echo.
echo  Ou use o PowerShell:
echo    powershell -ExecutionPolicy Bypass -File start.ps1
echo.
if "%SKIP_FRONTEND%"=="0" (
    echo  Acesse: http://localhost:5173
) else (
    echo  Acesse: http://localhost:8000/docs  (apenas backend^)
)
echo.
pause
