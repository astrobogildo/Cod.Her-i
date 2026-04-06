@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title Codigo: Heroi - RPG Digital

:: ────────────────────────────────────────────────────────
:: Config
:: ────────────────────────────────────────────────────────
set "ROOT=%~dp0"
if "!ROOT:~-1!"=="\" set "ROOT=!ROOT:~0,-1!"
cd /d "!ROOT!" || (echo ERRO: Caminho invalido. & pause & exit /b 1)

set "VENV=!ROOT!\.venv"
set "VPYTHON=!VENV!\Scripts\python.exe"
set "FRONTEND=!ROOT!\frontend"
set "MARKER=!ROOT!\.setup_done"

cls
echo.
echo   ====================================================
echo        CODIGO: HEROI  -  RPG Digital v2.0
echo   ====================================================
echo.
echo   [1] Iniciar jogo
echo   [2] Resetar banco de dados (apagar todos os dados)
echo   [3] Sair
echo.
set /p "_MENU=   Escolha [1/2/3]: "
if "!_MENU!"=="2" goto :reset_db
if "!_MENU!"=="3" exit /b 0
goto :continue_start

:reset_db
echo.
echo   ATENCAO: Isso apaga TODOS os dados (usuarios, personagens, mesas).
echo   O primeiro usuario a se registrar sera o Admin.
set /p "_CONFIRM=   Tem certeza? (S/N): "
if /i not "!_CONFIRM!"=="S" (
    echo   Cancelado.
    timeout /t 2 /nobreak >nul
    goto :eof
)
if exist "!ROOT!\codigo_heroi.db" (
    del "!ROOT!\codigo_heroi.db"
    echo   Banco de dados apagado!
) else (
    echo   Banco ja estava limpo.
)
echo   Ao iniciar, registre uma nova conta - ela sera Admin automaticamente.
echo.
pause
exit /b 0

:continue_start

:: ────────────────────────────────────────────────────────
:: Fast path: already configured? Just start.
:: ────────────────────────────────────────────────────────
if not exist "!MARKER!" goto :setup
if not exist "!VPYTHON!" goto :setup
if not exist "!FRONTEND!\node_modules\.package-lock.json" goto :setup

:: Verifica se todos os modulos importam corretamente
"!VPYTHON!" -c "import fastapi,uvicorn,sqlalchemy,greenlet,jose,bcrypt,alembic" >nul 2>&1
if errorlevel 1 (
    echo   Detectada atualizacao de dependencias...
    del "!MARKER!" >nul 2>&1
    goto :setup
)

echo   Ambiente OK. Iniciando servidores...
goto :start_servers

:: ============================================================
::  SETUP (primeira execucao)
:: ============================================================
:setup
echo   Preparando ambiente (so acontece na primeira vez)...
echo   Pode levar alguns minutos.
echo.

:: ──── 1. PYTHON ────────────────────────────────────────
echo   [1/4] Verificando Python...
call :find_python
if not defined PYTHON (
    echo          Nao encontrado. Instalando...
    call :install_python
    call :find_python
)
if not defined PYTHON (
    echo.
    echo   ERRO: Python nao encontrado.
    echo         Instale em: https://www.python.org/downloads/
    echo         MARQUE "Add Python to PATH" na instalacao!
    echo         Depois execute este arquivo novamente.
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('"!PYTHON!" --version 2^>^&1') do echo          %%v

:: ──── 2. NODE.JS ───────────────────────────────────────
echo.
echo   [2/4] Verificando Node.js...
call :find_node
if not defined NODE (
    echo          Nao encontrado. Instalando...
    call :install_node
    call :find_node
)
if not defined NODE (
    echo.
    echo   ERRO: Node.js nao encontrado.
    echo         Instale em: https://nodejs.org/
    echo         Depois execute este arquivo novamente.
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node --version 2^>^&1') do echo          Node %%v

:: ──── 3. BACKEND ───────────────────────────────────────
echo.
echo   [3/4] Configurando backend...

if not exist "!VPYTHON!" (
    echo          Criando ambiente virtual...
    "!PYTHON!" -m venv "!VENV!" 2>nul
    if not exist "!VPYTHON!" (
        echo   ERRO: Falha ao criar ambiente virtual.
        pause
        exit /b 1
    )
)
echo          Ambiente virtual OK

echo          Atualizando pip...
"!VPYTHON!" -m pip install --upgrade pip >nul 2>&1

echo          Instalando dependencias:
set "_N=0"
for /f "usebackq delims=" %%p in ("!ROOT!\backend\requirements.txt") do (
    set "_L=%%p"
    if not "!_L!"=="" if not "!_L:~0,1!"=="#" (
        set /a _N+=1
        echo            [!_N!] %%p
        "!VPYTHON!" -m pip install "%%p" >nul 2>&1
    )
)

echo          Verificando modulos...
"!VPYTHON!" -c "import fastapi,uvicorn,sqlalchemy,greenlet,jose,bcrypt,alembic" >nul 2>&1
if errorlevel 1 (
    echo          Algum pacote falhou, reinstalando tudo...
    "!VPYTHON!" -m pip install --no-cache-dir -r "!ROOT!\backend\requirements.txt"
    "!VPYTHON!" -c "import fastapi,uvicorn,sqlalchemy,greenlet,jose,bcrypt,alembic" >nul 2>&1
    if errorlevel 1 (
        echo   ERRO: Dependencias do backend falharam.
        echo         Tente: .venv\Scripts\pip install -r backend\requirements.txt
        pause
        exit /b 1
    )
)
echo          Backend OK!

:: ──── 4. FRONTEND ──────────────────────────────────────
echo.
echo   [4/4] Configurando frontend...
if exist "!FRONTEND!\node_modules\.package-lock.json" (
    echo          Ja instalado.
) else (
    echo          Instalando pacotes npm...
    echo          (pode levar alguns minutos)
    cd /d "!FRONTEND!"
    call npm install --no-fund --no-audit 2>&1
    cd /d "!ROOT!"
    if not exist "!FRONTEND!\node_modules\.package-lock.json" (
        echo   ERRO: npm install falhou.
        echo         Tente: cd frontend ^& npm install
        pause
        exit /b 1
    )
    echo          Frontend OK!
)

:: Marca setup como completo
echo.>"!MARKER!"

echo.
echo   ====================================================
echo        Configuracao completa!
echo   ====================================================

:: ============================================================
::  START SERVERS
:: ============================================================
:start_servers
echo.

:: Ja rodando?
set "_RUNNING="
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8000.*LISTEN"') do set "_RUNNING=1"
if defined _RUNNING (
    echo   Servidores ja estao rodando!
    start http://localhost:5173
    goto :show_status
)

:: Cria scripts temporarios (evita problemas de aspas)
(
echo @echo off
echo title Backend - Codigo Heroi
echo cd /d "!ROOT!"
echo "!VPYTHON!" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
echo echo.
echo echo Backend parou. Pressione uma tecla...
echo pause ^>nul
) > "%TEMP%\ch_backend.cmd"

(
echo @echo off
echo title Frontend - Codigo Heroi
echo cd /d "!FRONTEND!"
echo call npm run dev -- --host
echo echo.
echo echo Frontend parou. Pressione uma tecla...
echo pause ^>nul
) > "%TEMP%\ch_frontend.cmd"

:: Inicia backend (minimizado)
echo   Iniciando backend...
start /min "" "%TEMP%\ch_backend.cmd"

:: Aguarda backend ficar pronto (max 30s)
set /a _W=0
:wait_backend
if !_W! GEQ 30 (
    echo          Backend demorou, continuando...
    goto :do_frontend
)
curl.exe -sf http://localhost:8000/health >nul 2>&1
if not errorlevel 1 (
    echo          Backend pronto!
    goto :do_frontend
)
set /a _W+=1
timeout /t 1 /nobreak >nul
goto :wait_backend

:do_frontend
:: Inicia frontend (minimizado)
echo   Iniciando frontend...
start /min "" "%TEMP%\ch_frontend.cmd"

:: Aguarda frontend (max 15s)
set /a _W=0
:wait_frontend
if !_W! GEQ 15 goto :open_browser
curl.exe -sf http://localhost:5173 >nul 2>&1
if not errorlevel 1 (
    echo          Frontend pronto!
    goto :open_browser
)
set /a _W+=1
timeout /t 1 /nobreak >nul
goto :wait_frontend

:open_browser
timeout /t 1 /nobreak >nul
start http://localhost:5173

:: ────────────────────────────────────────────────────────
:: STATUS
:: ────────────────────────────────────────────────────────
:show_status
echo.

set "LOCAL_IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "_TMP=%%a"
    set "_TMP=!_TMP: =!"
    if not "!_TMP!"=="" if not "!_TMP:~0,3!"=="169" (
        if not defined LOCAL_IP set "LOCAL_IP=!_TMP!"
    )
)

echo   ====================================================
echo          SERVIDOR RODANDO!
echo   ====================================================
echo.
echo     Jogo:  http://localhost:5173
if defined LOCAL_IP (
echo     Rede:  http://!LOCAL_IP!:5173
echo.
echo     Jogadores na mesma rede WiFi podem acessar
echo     pelo endereco de Rede acima.
)
echo.
echo   ----------------------------------------------------
echo     Pressione qualquer tecla para PARAR os servidores
echo   ----------------------------------------------------
echo.
pause >nul

echo   Parando servidores...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8000.*LISTEN"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5173.*LISTEN"') do taskkill /f /pid %%a >nul 2>&1
:: Limpa janelas restantes
taskkill /fi "WINDOWTITLE eq Backend - Codigo Heroi" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq Frontend - Codigo Heroi" /f >nul 2>&1
del "%TEMP%\ch_backend.cmd" 2>nul
del "%TEMP%\ch_frontend.cmd" 2>nul
echo   Pronto. Ate a proxima sessao!
timeout /t 2 /nobreak >nul
exit /b 0

:: ============================================================
::  SUBROUTINES
:: ============================================================

:find_python
set "PYTHON="
:: Procura no PATH (ignora stub do Windows Store)
for /f "delims=" %%i in ('where python 2^>nul') do if not defined PYTHON (
    set "_CHK=%%i"
    if "!_CHK:WindowsApps=!"=="!_CHK!" (
        "%%i" --version >nul 2>&1
        if not errorlevel 1 set "PYTHON=%%i"
    )
)
if defined PYTHON goto :eof
for /f "delims=" %%i in ('where python3 2^>nul') do if not defined PYTHON (
    "%%i" --version >nul 2>&1
    if not errorlevel 1 set "PYTHON=%%i"
)
if defined PYTHON goto :eof
:: Procura em caminhos comuns
for %%d in (
    "%LOCALAPPDATA%\Programs\Python\Python313"
    "%LOCALAPPDATA%\Programs\Python\Python312"
    "%LOCALAPPDATA%\Programs\Python\Python311"
    "C:\Python313" "C:\Python312" "C:\Python311"
    "%ProgramFiles%\Python313" "%ProgramFiles%\Python312"
) do if not defined PYTHON (
    if exist "%%~d\python.exe" (
        set "PYTHON=%%~d\python.exe"
        set "PATH=%%~d;%%~d\Scripts;!PATH!"
    )
)
goto :eof

:find_node
set "NODE="
for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE set "NODE=%%i"
if defined NODE goto :eof
if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE=C:\Program Files\nodejs\node.exe"
    set "PATH=C:\Program Files\nodejs;!PATH!"
)
goto :eof

:install_python
where winget >nul 2>&1 || goto :python_curl
echo          Instalando via winget...
winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements --silent 2>nul
call :refresh_path
goto :eof
:python_curl
where curl.exe >nul 2>&1 || goto :python_manual
echo          Baixando Python 3.12...
curl.exe -Lo "%TEMP%\python-install.exe" "https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe" 2>nul
if exist "%TEMP%\python-install.exe" (
    echo          Instalando Python...
    start /wait "" "%TEMP%\python-install.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_pip=1
    timeout /t 3 /nobreak >nul
    call :refresh_path
    del "%TEMP%\python-install.exe" 2>nul
)
goto :eof
:python_manual
start https://www.python.org/downloads/
echo          Instale o Python, marque "Add to PATH" e execute novamente.
pause
exit /b 1

:install_node
where winget >nul 2>&1 || goto :node_curl
echo          Instalando via winget...
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent 2>nul
call :refresh_path
goto :eof
:node_curl
where curl.exe >nul 2>&1 || goto :node_manual
echo          Baixando Node.js 22 LTS...
curl.exe -Lo "%TEMP%\node-install.msi" "https://nodejs.org/dist/v22.12.0/node-v22.12.0-x64.msi" 2>nul
if exist "%TEMP%\node-install.msi" (
    echo          Instalando Node.js...
    start /wait msiexec /i "%TEMP%\node-install.msi" /qn
    timeout /t 5 /nobreak >nul
    call :refresh_path
    del "%TEMP%\node-install.msi" 2>nul
)
goto :eof
:node_manual
start https://nodejs.org/
echo          Instale o Node.js e execute novamente.
pause
exit /b 1

:refresh_path
for /f "usebackq tokens=2,*" %%A in (`reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul`) do set "SPATH=%%B"
for /f "usebackq tokens=2,*" %%A in (`reg query "HKCU\Environment" /v Path 2^>nul`) do set "UPATH=%%B"
set "PATH=!SPATH!;!UPATH!"
goto :eof
