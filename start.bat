@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo ============================================================
echo       Código: Herói — Iniciando Servidor Local
echo ============================================================

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

:: Fix PATH for tools not in PATH
if exist "C:\Program Files\Git\cmd\git.exe" set "PATH=C:\Program Files\Git\cmd;%PATH%"
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"

:: ─── Check venv exists ───
if not exist "%ROOT%\.venv\Scripts\python.exe" (
    echo [ERRO] Ambiente nao configurado. Execute setup.bat primeiro!
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

echo.
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
if defined IP (
    echo.
    echo  Rede local: http://!IP!:5173
)
echo.
echo  Pressione Ctrl+C em qualquer janela para parar.
echo ============================================================
echo.

:: ─── Start backend in a new window ───
start "Código Herói — Backend" cmd /k "cd /d "%ROOT%" && .venv\Scripts\python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"

:: ─── Start frontend (if node available) ───
where node >nul 2>&1
if %errorlevel%==0 (
    if exist "%ROOT%\frontend\node_modules" (
        timeout /t 2 /nobreak >nul
        start "Código Herói — Frontend" cmd /k "cd /d "%ROOT%\frontend" && npm run dev -- --host"
    ) else (
        echo [AVISO] Frontend nao instalado. Execute setup.bat primeiro.
    )
) else (
    echo [AVISO] Node.js nao encontrado. Apenas backend disponivel.
)

echo.
echo Servidores iniciados. Pode fechar esta janela.
echo.
pause
