# ═══════════════════════════════════════════════════════════════
#  Código: Herói — Iniciar Servidor
# ═══════════════════════════════════════════════════════════════
#  Execute com:
#    powershell -ExecutionPolicy Bypass -File start.ps1
# ═══════════════════════════════════════════════════════════════

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

# Fix PATH
if (Test-Path "C:\Program Files\Git\cmd\git.exe") { $env:PATH = "C:\Program Files\Git\cmd;$env:PATH" }
if (Test-Path "C:\Program Files\nodejs\node.exe") { $env:PATH = "C:\Program Files\nodejs;$env:PATH" }

$VPython = Join-Path $Root ".venv\Scripts\python.exe"

# ─── Verify setup ───
if (-not (Test-Path $VPython)) {
    Write-Host ""
    Write-Host "  [ERRO] Ambiente nao configurado!" -ForegroundColor Red
    Write-Host "         Execute primeiro:" -ForegroundColor Yellow
    Write-Host "           powershell -ExecutionPolicy Bypass -File setup.ps1" -ForegroundColor Cyan
    Write-Host ""
    Read-Host "Pressione Enter para sair"
    exit 1
}

# ─── Test backend imports ───
$importTest = & $VPython -c "import fastapi, uvicorn" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  [ERRO] Dependencias do backend incompletas!" -ForegroundColor Red
    Write-Host "         Execute setup.ps1 novamente." -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# ─── Find IP ───
$ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi", "Ethernet" -ErrorAction SilentlyContinue |
       Where-Object { $_.IPAddress -notmatch "^169\." } |
       Select-Object -First 1).IPAddress

# ─── Banner ───
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "  ║       Código: Herói  —  Servidor Local                  ║" -ForegroundColor Magenta
Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Backend:  " -NoNewline; Write-Host "http://localhost:8000" -ForegroundColor Green
Write-Host "  API Docs: " -NoNewline; Write-Host "http://localhost:8000/docs" -ForegroundColor Green

$hasNode = $null -ne (Get-Command node -ErrorAction SilentlyContinue)
$hasNodeModules = Test-Path (Join-Path $Root "frontend\node_modules\react")

if ($hasNode -and $hasNodeModules) {
    Write-Host "  Frontend: " -NoNewline; Write-Host "http://localhost:5173" -ForegroundColor Green
    if ($ip) {
        Write-Host ""
        Write-Host "  Rede:     " -NoNewline; Write-Host "http://${ip}:5173" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "  Pressione Ctrl+C nas janelas para parar." -ForegroundColor DarkGray
Write-Host ""

# ─── Start Backend ───
$backendCmd = "cd `"$Root`"; & `"$VPython`" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Codigo: Heroi — Backend' -ForegroundColor Cyan; Write-Host ''; $backendCmd"

# ─── Start Frontend ───
if ($hasNode -and $hasNodeModules) {
    Start-Sleep -Seconds 2
    $frontDir = Join-Path $Root "frontend"
    $frontendCmd = "cd `"$frontDir`"; npm run dev -- --host"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Codigo: Heroi — Frontend' -ForegroundColor Cyan; Write-Host ''; $frontendCmd"
} elseif (-not $hasNode) {
    Write-Host "  [AVISO] Node.js nao encontrado. Apenas o backend esta rodando." -ForegroundColor Yellow
} else {
    Write-Host "  [AVISO] Frontend nao instalado. Execute setup.ps1 primeiro." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Servidor(es) iniciando em janelas separadas..." -ForegroundColor Green
Write-Host ""
