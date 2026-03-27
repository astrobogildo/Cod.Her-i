@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo ============================================================
echo          Código: Herói — Instalador Automático
echo ============================================================
echo.

:: ─── Detect project root (where this script lives) ───
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

:: ─── Colors via powershell (fallback to plain text) ───
set "PS=powershell -NoProfile -Command"

:: ─── 1. Check Python ───
echo [1/6] Verificando Python...
set "PYTHON="
where python >nul 2>&1 && set "PYTHON=python"
if not defined PYTHON (
    where python3 >nul 2>&1 && set "PYTHON=python3"
)
if not defined PYTHON (
    if exist "C:\Program Files\Python\python.exe" set "PYTHON=C:\Program Files\Python\python.exe"
)
if not defined PYTHON (
    for /f "delims=" %%i in ('dir /b /s "C:\Python*\python.exe" 2^>nul') do set "PYTHON=%%i"
)

if not defined PYTHON (
    echo [ERRO] Python nao encontrado!
    echo        Baixe em: https://www.python.org/downloads/
    echo        Marque "Add Python to PATH" durante a instalacao.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('"%PYTHON%" --version 2^>^&1') do set "PYVER=%%v"
echo        OK: !PYVER! [%PYTHON%]

:: ─── 2. Check Node.js ───
echo.
echo [2/6] Verificando Node.js...
set "NODE="
where node >nul 2>&1 && set "NODE=node"
if not defined NODE (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE=C:\Program Files\nodejs\node.exe"
        set "PATH=C:\Program Files\nodejs;%PATH%"
    )
)

if not defined NODE (
    echo [AVISO] Node.js nao encontrado!
    echo         Baixe em: https://nodejs.org/
    echo         Tentando continuar apenas com o backend...
    set "SKIP_FRONTEND=1"
) else (
    for /f "delims=" %%v in ('node --version 2^>^&1') do set "NODEVER=%%v"
    echo        OK: Node !NODEVER!
    set "SKIP_FRONTEND=0"
)

:: ─── 3. Check Git ───
echo.
echo [3/6] Verificando Git...
set "GIT="
where git >nul 2>&1 && set "GIT=git"
if not defined GIT (
    if exist "C:\Program Files\Git\cmd\git.exe" (
        set "GIT=C:\Program Files\Git\cmd\git.exe"
        set "PATH=C:\Program Files\Git\cmd;%PATH%"
    )
)
if defined GIT (
    for /f "delims=" %%v in ('git --version 2^>^&1') do set "GITVER=%%v"
    echo        OK: !GITVER!
) else (
    echo [INFO] Git nao encontrado. Nao e obrigatorio para rodar.
)

:: ─── 4. Create Python virtual env + install deps ───
echo.
echo [4/6] Configurando ambiente Python (backend)...
if not exist "%ROOT%\.venv\Scripts\python.exe" (
    echo        Criando virtual environment...
    "%PYTHON%" -m venv "%ROOT%\.venv"
    if errorlevel 1 (
        echo [ERRO] Falha ao criar venv.
        pause
        exit /b 1
    )
)
echo        Virtual environment OK.

echo        Instalando dependencias do backend...
"%ROOT%\.venv\Scripts\pip.exe" install --quiet --upgrade pip >nul 2>&1
"%ROOT%\.venv\Scripts\pip.exe" install --quiet -r "%ROOT%\backend\requirements.txt"
if errorlevel 1 (
    echo [ERRO] Falha ao instalar dependencias Python.
    echo        Tente manualmente: .venv\Scripts\pip install -r backend\requirements.txt
    pause
    exit /b 1
)
echo        Dependencias do backend instaladas.

:: ─── 5. Install frontend deps ───
echo.
echo [5/6] Configurando frontend...
if "%SKIP_FRONTEND%"=="1" (
    echo        [PULANDO] Node.js nao disponivel.
) else (
    cd /d "%ROOT%\frontend"
    if not exist "node_modules" (
        echo        Instalando dependencias (npm install)...
        call npm install --silent 2>nul
        if errorlevel 1 (
            echo [AVISO] npm install falhou. Tente manualmente: cd frontend ^&^& npm install
        ) else (
            echo        Dependencias do frontend instaladas.
        )
    ) else (
        echo        node_modules ja existe, OK.
    )
    cd /d "%ROOT%"
)

:: ─── 6. Summary ───
echo.
echo ============================================================
echo                     Tudo pronto!
echo ============================================================
echo.
echo Para iniciar o servidor:
echo.
echo   start.bat
echo.
echo Ou manualmente:
echo   Backend:  .venv\Scripts\python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
if "%SKIP_FRONTEND%"=="0" (
    echo   Frontend: cd frontend ^&^& npm run dev
)
echo.
echo Acesse: http://localhost:5173  (ou http://SEU_IP:5173 na rede local)
echo.
pause
