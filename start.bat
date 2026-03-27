@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║       Codigo: Heroi  —  Servidor Local                  ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

:: Fix PATH for tools not in PATH
if exist "C:\Program Files\Git\cmd\git.exe" set "PATH=C:\Program Files\Git\cmd;%PATH%"
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"

set "VPYTHON=%ROOT%\.venv\Scripts\python.exe"

:: ─── Check venv exists ───
if not exist "%VPYTHON%" (
    echo  [ERRO] Ambiente nao configurado!
    echo         Execute primeiro: setup.bat
    echo         Ou: powershell -ExecutionPolicy Bypass -File setup.ps1
    pause
    exit /b 1
)

:: ─── Test backend imports ───
"%VPYTHON%" -c "import fastapi, uvicorn" >nul 2>&1
if errorlevel 1 (
    echo  [ERRO] Dependencias do backend incompletas!
    echo         Execute setup.bat ou setup.ps1 novamente.
    pause
    exit /b 1
)

:: ─── Find local IP ───
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "IP=%%a"
    set "IP=!IP: =!"
    goto :got_ip
)
:got_ip

echo  Backend:  http://localhost:8000
echo  API Docs: http://localhost:8000/docs

:: Check if frontend is available
set "HAS_FRONTEND=0"
where node >nul 2>&1 && if exist "%ROOT%\frontend\node_modules\react" set "HAS_FRONTEND=1"

if "%HAS_FRONTEND%"=="1" (
    echo  Frontend: http://localhost:5173
    if defined IP (
        echo.
        echo  Rede local: http://!IP!:5173
    )
)

echo.
echo  Pressione Ctrl+C nas janelas para parar.
echo.

:: ─── Start backend in a new window ───
start "Codigo Heroi — Backend" cmd /k "cd /d "%ROOT%" && "%VPYTHON%" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"

:: ─── Start frontend (if available) ───
if "%HAS_FRONTEND%"=="1" (
    timeout /t 2 /nobreak >nul
    start "Codigo Heroi — Frontend" cmd /k "cd /d "%ROOT%\frontend" && npm run dev -- --host"
) else (
    where node >nul 2>&1
    if errorlevel 1 (
        echo  [AVISO] Node.js nao encontrado. Apenas backend disponivel.
    ) else (
        echo  [AVISO] Frontend nao instalado. Execute setup.bat primeiro.
    )
)

echo.
echo  Servidores iniciando em janelas separadas...
echo.
echo Servidores iniciados. Pode fechar esta janela.
echo.
pause
