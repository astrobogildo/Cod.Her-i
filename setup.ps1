# ═══════════════════════════════════════════════════════════════
#  Código: Herói — Instalador PowerShell (Recomendado)
# ═══════════════════════════════════════════════════════════════
#  Execute com:
#    powershell -ExecutionPolicy Bypass -File setup.ps1
# ═══════════════════════════════════════════════════════════════

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$Errors = 0
$SkipFrontend = $false

function Write-Step($num, $total, $msg) {
    Write-Host ""
    Write-Host "[$num/$total] $msg" -ForegroundColor Cyan
}

function Write-Ok($msg) {
    Write-Host "  [OK] $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "  [AVISO] $msg" -ForegroundColor Yellow
}

function Write-Err($msg) {
    Write-Host "  [ERRO] $msg" -ForegroundColor Red
}

function Write-Info($msg) {
    Write-Host "  $msg" -ForegroundColor White
}

# ─── Banner ───
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "  ║       Código: Herói  —  Instalador Automático           ║" -ForegroundColor Magenta
Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Magenta

# ═══════════════════════════════════════════════════════════════
# 1. PYTHON
# ═══════════════════════════════════════════════════════════════
Write-Step 1 6 "Verificando Python..."

$PythonExe = $null
$PythonSearchPaths = @(
    "python",
    "python3",
    "py",
    "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
    "C:\Python313\python.exe",
    "C:\Python312\python.exe",
    "C:\Python311\python.exe",
    "C:\Program Files\Python313\python.exe",
    "C:\Program Files\Python312\python.exe"
)

foreach ($p in $PythonSearchPaths) {
    try {
        $ver = & $p --version 2>&1
        if ($ver -match "Python \d") {
            $PythonExe = $p
            break
        }
    } catch {}
}

# Also try Windows Store python via py launcher
if (-not $PythonExe) {
    try {
        $ver = & py -3 --version 2>&1
        if ($ver -match "Python \d") { $PythonExe = "py -3" }
    } catch {}
}

if (-not $PythonExe) {
    Write-Err "Python nao encontrado!"
    Write-Host "         Baixe em: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "         IMPORTANTE: Marque 'Add Python to PATH' durante a instalacao." -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

$PyVer = & $PythonExe --version 2>&1
Write-Ok "$PyVer"
$resolvedPython = (Get-Command $PythonExe -ErrorAction SilentlyContinue).Source
if ($resolvedPython) { Write-Info "Caminho: $resolvedPython" }

# ═══════════════════════════════════════════════════════════════
# 2. NODE.JS
# ═══════════════════════════════════════════════════════════════
Write-Step 2 6 "Verificando Node.js..."

$NodeExe = $null
$NpmExe = $null

$NodeSearchPaths = @(
    "node",
    "C:\Program Files\nodejs\node.exe"
)

foreach ($n in $NodeSearchPaths) {
    try {
        $ver = & $n --version 2>&1
        if ($ver -match "v\d") {
            $NodeExe = $n
            if ($n -ne "node") { $env:PATH = "C:\Program Files\nodejs;$env:PATH" }
            break
        }
    } catch {}
}

if ($NodeExe) {
    $NpmExe = "npm"
    $NodeVer = & $NodeExe --version 2>&1
    Write-Ok "Node.js $NodeVer"
} else {
    Write-Warn "Node.js nao encontrado."
    Write-Host "         Baixe em: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "         O frontend nao sera instalado agora." -ForegroundColor Yellow
    $SkipFrontend = $true
}

# ═══════════════════════════════════════════════════════════════
# 3. GIT (opcional)
# ═══════════════════════════════════════════════════════════════
Write-Step 3 6 "Verificando Git (opcional)..."

$GitExe = $null
try { $GitExe = (Get-Command git -ErrorAction SilentlyContinue).Source } catch {}
if (-not $GitExe -and (Test-Path "C:\Program Files\Git\cmd\git.exe")) {
    $GitExe = "C:\Program Files\Git\cmd\git.exe"
    $env:PATH = "C:\Program Files\Git\cmd;$env:PATH"
}

if ($GitExe) {
    $GitVer = & git --version 2>&1
    Write-Ok "$GitVer"
} else {
    Write-Info "Git nao encontrado. Nao e obrigatorio."
}

# ═══════════════════════════════════════════════════════════════
# 4. VIRTUAL ENVIRONMENT + BACKEND DEPS
# ═══════════════════════════════════════════════════════════════
Write-Step 4 6 "Configurando ambiente Python (backend)..."

$VenvDir = Join-Path $Root ".venv"
$VPython = Join-Path $VenvDir "Scripts\python.exe"
$VPip = Join-Path $VenvDir "Scripts\pip.exe"

# 4a. Create venv
if (-not (Test-Path $VPython)) {
    Write-Info "Criando virtual environment..."
    $result = & $PythonExe -m venv $VenvDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "venv falhou, tentando sem pip..."
        & $PythonExe -m venv --without-pip $VenvDir 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Nao foi possivel criar ambiente virtual."
            Read-Host "Pressione Enter para sair"
            exit 1
        }
    }
}
Write-Ok "Virtual environment pronto"

# 4b. Ensure pip exists
if (-not (Test-Path $VPip)) {
    Write-Info "Instalando pip no venv..."
    & $VPython -m ensurepip --upgrade 2>&1 | Out-Null
    if (-not (Test-Path $VPip)) {
        Write-Info "Baixando get-pip.py..."
        $getPip = Join-Path $env:TEMP "get-pip.py"
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        (New-Object Net.WebClient).DownloadFile("https://bootstrap.pypa.io/get-pip.py", $getPip)
        & $VPython $getPip 2>&1 | Out-Null
    }
}

# 4c. Upgrade pip
Write-Info "Atualizando pip..."
& $VPython -m pip install --upgrade pip 2>&1 | Select-String -Pattern "Success|already" | Out-String | ForEach-Object { $_.Trim() }

# 4d. Install backend packages one by one
Write-Host ""
Write-Info "Instalando dependencias do backend:"
Write-Host "  ─────────────────────────────────────" -ForegroundColor DarkGray

$reqFile = Join-Path $Root "backend\requirements.txt"
$packages = Get-Content $reqFile | Where-Object { $_ -match '\S' -and $_ -notmatch '^\s*#' }
$pkgTotal = $packages.Count
$pkgNum = 0
$pkgFail = 0

foreach ($pkg in $packages) {
    $pkgNum++
    $pkgClean = $pkg.Trim()
    Write-Host ""
    Write-Host "  [$pkgNum/$pkgTotal] " -NoNewline -ForegroundColor White
    Write-Host "$pkgClean" -ForegroundColor Yellow

    $output = & $VPython -m pip install $pkgClean 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Falhou. Tentando sem cache..."
        $output = & $VPython -m pip install --no-cache-dir $pkgClean 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Nao foi possivel instalar $pkgClean"
            $output | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkRed }
            $pkgFail++
            continue
        }
    }

    # Show key line from output
    $statusLine = $output | Select-String -Pattern "Successfully installed|already satisfied|Requirement already" | Select-Object -First 1
    if ($statusLine) {
        Write-Host "    $($statusLine.Line.Trim())" -ForegroundColor DarkGreen
    } else {
        Write-Ok "Instalado"
    }
}

Write-Host ""
if ($pkgFail -gt 0) {
    Write-Warn "$pkgFail pacote(s) falharam. Tente: .venv\Scripts\pip install -r backend\requirements.txt"
    $Errors++
} else {
    Write-Ok "Todas as $pkgTotal dependencias do backend instaladas!"
}

# ═══════════════════════════════════════════════════════════════
# 5. FRONTEND DEPS
# ═══════════════════════════════════════════════════════════════
Write-Step 5 6 "Configurando frontend..."

if ($SkipFrontend) {
    Write-Info "[PULANDO] Node.js nao disponivel."
} else {
    $frontDir = Join-Path $Root "frontend"
    $nodeModules = Join-Path $frontDir "node_modules\react"

    if (Test-Path $nodeModules) {
        Write-Ok "Dependencias do frontend ja instaladas."
    } else {
        Set-Location $frontDir
        Write-Info "Executando npm install (pode levar alguns minutos)..."
        Write-Host ""

        & $NpmExe install 2>&1 | ForEach-Object { Write-Host "  $_" }

        if ($LASTEXITCODE -ne 0) {
            Write-Warn "npm install falhou."
            Write-Host "         Tente manualmente: cd frontend; npm install" -ForegroundColor Yellow
            $Errors++
        } else {
            Write-Host ""
            Write-Ok "Dependencias do frontend instaladas!"
        }
        Set-Location $Root
    }
}

# ═══════════════════════════════════════════════════════════════
# 6. VERIFICACAO FINAL
# ═══════════════════════════════════════════════════════════════
Write-Step 6 6 "Verificacao final..."

Write-Info "Testando imports do backend..."
$testResult = & $VPython -c "
import sys
modules = ['fastapi', 'uvicorn', 'sqlalchemy', 'aiosqlite', 'jose', 'bcrypt', 'pydantic']
ok = []
fail = []
for m in modules:
    try:
        __import__(m)
        ok.append(m)
    except ImportError:
        fail.append(m)
if fail:
    print(f'FAIL:{chr(44).join(fail)}')
    sys.exit(1)
else:
    print(f'OK:{len(ok)} modulos')
" 2>&1

if ($testResult -match "^OK:") {
    Write-Ok "$($testResult -replace 'OK:', '') importados com sucesso"
} else {
    $failedMods = ($testResult -replace 'FAIL:', '')
    Write-Err "Modulos faltando: $failedMods"
    Write-Host "         Execute: .venv\Scripts\pip install -r backend\requirements.txt" -ForegroundColor Yellow
    $Errors++
}

# ─── Summary ───
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
if ($Errors -eq 0) {
    Write-Host "  ║            INSTALACAO COMPLETA!                         ║" -ForegroundColor Green
} else {
    Write-Host "  ║       INSTALACAO COMPLETA (com $Errors aviso(s))             ║" -ForegroundColor Yellow
}
Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Para iniciar o servidor:" -ForegroundColor White
Write-Host ""
Write-Host "    .\start.bat" -ForegroundColor Cyan
Write-Host "    # ou" -ForegroundColor DarkGray
Write-Host "    powershell -ExecutionPolicy Bypass -File start.ps1" -ForegroundColor Cyan
Write-Host ""

if (-not $SkipFrontend) {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi", "Ethernet" -ErrorAction SilentlyContinue |
           Where-Object { $_.IPAddress -notmatch "^169\." } |
           Select-Object -First 1).IPAddress
    Write-Host "  Acesse: http://localhost:5173" -ForegroundColor Green
    if ($ip) {
        Write-Host "  Rede:   http://${ip}:5173" -ForegroundColor Green
    }
} else {
    Write-Host "  Acesse: http://localhost:8000/docs  (apenas backend)" -ForegroundColor Green
}

Write-Host ""
Read-Host "Pressione Enter para sair"
