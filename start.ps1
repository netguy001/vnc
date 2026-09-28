<#
.SYNOPSIS
    ServerConsole One-Command Local Development Launcher
.DESCRIPTION
    Checks prerequisites, initializes configuration, builds required dependencies,
    spawns all microservices with process tracking and health checks, and opens the browser.
.PARAMETER NoBrowser
    Do not automatically open the browser once ready.
.PARAMETER Force
    Automatically terminate any conflicting processes on required ports.
.PARAMETER NoMock
    Do not start local mock VNC and SSH test servers.
#>

[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [switch]$Force,
    [switch]$NoMock
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

# Set UTF-8 encoding for console output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Banner {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "               SERVERCONSOLE LOCAL LAUNCHER                 " -ForegroundColor White
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([string]$Step, [string]$Message)
    Write-Host "[$Step] " -NoNewline -ForegroundColor DarkGray
    Write-Host "$Message" -NoNewline -ForegroundColor White
}

function Write-StepSuccess {
    param([string]$Detail = "OK")
    Write-Host " ................. " -NoNewline -ForegroundColor DarkGray
    Write-Host "[$Detail]" -ForegroundColor Green
}

function Write-StepFail {
    param([string]$Detail = "FAILED")
    Write-Host " ................. " -NoNewline -ForegroundColor DarkGray
    Write-Host "[$Detail]" -ForegroundColor Red
}

$TrackedProcesses = @{}
$PidsFile = Join-Path $ProjectRoot "logs\pids.json"

function Ensure-Directories {
    $dirs = @("logs", "data")
    foreach ($d in $dirs) {
        $p = Join-Path $ProjectRoot $d
        if (!(Test-Path $p)) {
            New-Item -ItemType Directory -Path $p -Force | Out-Null
        }
    }
}

function Stop-TrackedServices {
    Write-Host "`nStopping ServerConsole services..." -ForegroundColor Yellow
    foreach ($name in $TrackedProcesses.Keys) {
        $proc = $TrackedProcesses[$name]
        if ($proc -and !$proc.HasExited) {
            try {
                Write-Host "Stopping $name (PID $($proc.Id))..." -ForegroundColor DarkGray
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                # Also kill any child processes of this PID
                Get-CimInstance Win32_Process -Filter "ParentProcessId=$($proc.Id)" -ErrorAction SilentlyContinue |
                    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
            } catch {}
        }
    }
    if (Test-Path $PidsFile) {
        Remove-Item $PidsFile -Force -ErrorAction SilentlyContinue
    }
    Write-Host "All ServerConsole services stopped.`n" -ForegroundColor Green
}

# Register Ctrl+C and exit handler if interactive
try {
    if ([Environment]::UserInteractive -and ![Console]::IsInputRedirected) {
        [Console]::TreatControlCAsInput = $false
    }
} catch {}

try {
    Write-Banner
    Ensure-Directories

    # -------------------------------------------------------------
    # Step 1: Check Node.js
    # -------------------------------------------------------------
    Write-Step "1/7" "Checking Node.js environment"
    $nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
    if (!$nodeCmd) {
        Write-StepFail "NOT FOUND"
        Write-Host "`n[ERROR] Node.js is not installed or not in PATH." -ForegroundColor Red
        Write-Host "Please install Node.js LTS (v20+ or v22+) from https://nodejs.org" -ForegroundColor Yellow
        exit 1
    }
    $nodeVer = (node -v).Trim()
    Write-StepSuccess "$nodeVer"

    # -------------------------------------------------------------
    # Step 2: Check npm
    # -------------------------------------------------------------
    Write-Step "2/7" "Checking npm package manager"
    $npmCmd = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
    if (!$npmCmd) {
        $npmCmd = Get-Command "npm" -ErrorAction SilentlyContinue
    }
    if (!$npmCmd) {
        Write-StepFail "NOT FOUND"
        Write-Host "`n[ERROR] npm is not found in PATH." -ForegroundColor Red
        exit 1
    }
    $npmVer = (npm -v).Trim()
    Write-StepSuccess "v$npmVer"

    # -------------------------------------------------------------
    # Step 3: Check & Install Dependencies
    # -------------------------------------------------------------
    Write-Step "3/7" "Verifying workspace dependencies"
    $nodeModules = Join-Path $ProjectRoot "node_modules"
    $sharedDist = Join-Path $ProjectRoot "packages\shared\dist"
    $serverDist = Join-Path $ProjectRoot "apps\server\dist"

    if (!(Test-Path $nodeModules)) {
        Write-Host " (Installing npm packages...)" -ForegroundColor DarkYellow
        & npm install | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-StepFail "INSTALL ERROR"
            exit 1
        }
    }

    # Ensure shared and server are compiled
    if (!(Test-Path $sharedDist) -or !(Test-Path $serverDist)) {
        & npm run build --workspace=@server-console/shared | Out-Null
        & npm run build --workspace=@server-console/server | Out-Null
    }
    Write-StepSuccess

    # -------------------------------------------------------------
    # Step 4: Environment Configuration & Database
    # -------------------------------------------------------------
    Write-Step "4/7" "Configuring environment & database"
    $envFile = Join-Path $ProjectRoot ".env"
    $envExample = Join-Path $ProjectRoot ".env.example"

    if (!(Test-Path $envFile)) {
        if (Test-Path $envExample) {
            Copy-Item $envExample $envFile
            # Generate a 32-byte secure hex key for MASTER_KEY
            $bytes = New-Object byte[] 32
            [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
            $hexKey = -join ($bytes | ForEach-Object { $_.ToString("x2") })
            $envContent = Get-Content $envFile -Raw
            $envContent = $envContent -replace 'MASTER_KEY=.*', "MASTER_KEY=$hexKey"
            Set-Content $envFile $envContent
        }
    }
    Write-StepSuccess

    # -------------------------------------------------------------
    # Port Occupancy Check
    # -------------------------------------------------------------
    $requiredPorts = @(5173, 3001)
    if (!$NoMock) {
        $requiredPorts += 5901
        $requiredPorts += 2222
    }

    foreach ($port in $requiredPorts) {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($conns) {
            $conflictPid = $conns[0].OwningProcess
            $procName = "Unknown"
            try { $procName = (Get-Process -Id $conflictPid -ErrorAction SilentlyContinue).ProcessName } catch {}

            Write-Host "`n[PORT CONFLICT] Port $port is already in use by PID $conflictPid ($procName)." -ForegroundColor Yellow
            if ($Force) {
                Write-Host "Force flag active. Terminating PID $conflictPid..." -ForegroundColor DarkYellow
                Stop-Process -Id $conflictPid -Force -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 800
            } else {
                $choice = Read-Host "Choose action: [K] Kill process $conflictPid, [U] Use existing service, [A] Abort (default: A)"
                if ($choice -match '^[kK]$') {
                    Stop-Process -Id $conflictPid -Force -ErrorAction SilentlyContinue
                    Start-Sleep -Milliseconds 800
                } elseif ($choice -match '^[uU]$') {
                    Write-Host "Proceeding with existing process on port $port." -ForegroundColor DarkGray
                } else {
                    Write-Host "Startup aborted by user." -ForegroundColor Red
                    exit 0
                }
            }
        }
    }

    # -------------------------------------------------------------
    # Step 5: Start Local Mock Servers (VNC & SSH)
    # -------------------------------------------------------------
    if (!$NoMock) {
        Write-Step "5/7" "Starting mock VNC (5901) & SSH (2222)"
        $mockVncLog = Join-Path $ProjectRoot "logs\mock-vnc.log"
        $mockSshLog = Join-Path $ProjectRoot "logs\mock-ssh.log"
        $mockScript = Join-Path $ProjectRoot "apps\server\dist\mock\runner.js"

        $mockProc = Start-Process -FilePath "node" `
            -ArgumentList "`"$mockScript`"" `
            -WorkingDirectory (Join-Path $ProjectRoot "apps\server") `
            -RedirectStandardOutput $mockVncLog `
            -RedirectStandardError $mockSshLog `
            -PassThru `
            -NoNewWindow

        $TrackedProcesses["MockServers"] = $mockProc

        # Wait for port 5901 to become available
        $vncReady = $false
        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Milliseconds 250
            $conn = Get-NetTCPConnection -LocalPort 5901 -State Listen -ErrorAction SilentlyContinue
            if ($conn) { $vncReady = $true; break }
        }
        if ($vncReady) {
            Write-StepSuccess "Ports 5901/2222"
        } else {
            Write-StepFail "TIMEOUT"
            Write-Host "Check logs at: $mockVncLog" -ForegroundColor Yellow
        }
    } else {
        Write-Step "5/7" "Skipping mock servers (-NoMock)"
        Write-StepSuccess "SKIPPED"
    }

    # -------------------------------------------------------------
    # Step 6: Start Backend API
    # -------------------------------------------------------------
    Write-Step "6/7" "Starting Backend API server"
    $backendLog = Join-Path $ProjectRoot "logs\backend.log"
    $backendErrLog = Join-Path $ProjectRoot "logs\backend-error.log"
    $backendScript = Join-Path $ProjectRoot "apps\server\dist\index.js"

    $backendProc = Start-Process -FilePath "node" `
        -ArgumentList "`"$backendScript`"" `
        -WorkingDirectory (Join-Path $ProjectRoot "apps\server") `
        -RedirectStandardOutput $backendLog `
        -RedirectStandardError $backendErrLog `
        -PassThru `
        -NoNewWindow

    $TrackedProcesses["Backend"] = $backendProc

    # Health check polling for backend
    $backendHealthy = $false
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 300
        try {
            $res = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($res.status -eq 'ok') {
                $backendHealthy = $true
                break
            }
        } catch {}
    }

    if ($backendHealthy) {
        Write-StepSuccess "Port 3001"
    } else {
        Write-StepFail "CRASH"
        Write-Host "`n[ERROR] Backend failed to start. Last log lines:" -ForegroundColor Red
        if (Test-Path $backendLog) {
            Get-Content $backendLog -Tail 15 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
        }
        if (Test-Path $backendErrLog) {
            Get-Content $backendErrLog -Tail 15 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkRed }
        }
        Stop-TrackedServices
        exit 1
    }

    # -------------------------------------------------------------
    # Step 7: Start React/Vite Frontend
    # -------------------------------------------------------------
    Write-Step "7/7" "Starting Frontend web client"
    $frontendLog = Join-Path $ProjectRoot "logs\frontend.log"
    $frontendErrLog = Join-Path $ProjectRoot "logs\frontend-error.log"
    $viteScript = Join-Path $ProjectRoot "node_modules\vite\bin\vite.js"

    $frontendProc = Start-Process -FilePath "node" `
        -ArgumentList "`"$viteScript`" --host 0.0.0.0 --port 5173" `
        -WorkingDirectory (Join-Path $ProjectRoot "apps\web") `
        -RedirectStandardOutput $frontendLog `
        -RedirectStandardError $frontendErrLog `
        -PassThru `
        -NoNewWindow

    $TrackedProcesses["Frontend"] = $frontendProc

    # Health check polling for frontend
    $frontendHealthy = $false
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 350
        try {
            $res = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($res.StatusCode -eq 200) {
                $frontendHealthy = $true
                break
            }
        } catch {}
    }

    if ($frontendHealthy) {
        Write-StepSuccess "Port 5173"
    } else {
        Write-StepFail "CRASH"
        Write-Host "`n[ERROR] Frontend failed to respond. Last log lines:" -ForegroundColor Red
        if (Test-Path $frontendLog) {
            Get-Content $frontendLog -Tail 15 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
        }
        if (Test-Path $frontendErrLog) {
            Get-Content $frontendErrLog -Tail 15 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkRed }
        }
        Stop-TrackedServices
        exit 1
    }

    # Save PIDs to file for external stop script
    $pidData = @{
        startedAt = (Get-Date).ToString("o")
        backendPid = if ($TrackedProcesses["Backend"]) { $TrackedProcesses["Backend"].Id } else { $null }
        frontendPid = if ($TrackedProcesses["Frontend"]) { $TrackedProcesses["Frontend"].Id } else { $null }
        mockServersPid = if ($TrackedProcesses["MockServers"]) { $TrackedProcesses["MockServers"].Id } else { $null }
    }
    $pidData | ConvertTo-Json | Set-Content $PidsFile

    # -------------------------------------------------------------
    # Ready Banner & URLs
    # -------------------------------------------------------------
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "                 SERVERCONSOLE IS READY!                    " -ForegroundColor White
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Web Console:       " -NoNewline -ForegroundColor DarkGray
    Write-Host "http://localhost:5173" -ForegroundColor Cyan
    Write-Host "  Backend API:       " -NoNewline -ForegroundColor DarkGray
    Write-Host "http://localhost:3001" -ForegroundColor Cyan
    Write-Host "  Health Status:     " -NoNewline -ForegroundColor DarkGray
    Write-Host "http://localhost:3001/api/health" -ForegroundColor DarkCyan
    if (!$NoMock) {
        Write-Host "  Mock VNC Desktop:  " -NoNewline -ForegroundColor DarkGray
        Write-Host "127.0.0.1:5901 (RFB 3.8, No Auth)" -ForegroundColor Yellow
        Write-Host "  Mock SSH / SFTP:   " -NoNewline -ForegroundColor DarkGray
        Write-Host "127.0.0.1:2222 (User: admin, Pass: admin)" -ForegroundColor Yellow
    }
    Write-Host "  Log Directory:     " -NoNewline -ForegroundColor DarkGray
    Write-Host "$ProjectRoot\logs" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green

    # Open browser automatically
    if (!$NoBrowser) {
        Write-Host "Opening web console in your default browser..." -ForegroundColor DarkGray
        Start-Process "http://localhost:5173"
    }

    Write-Host "ServerConsole is running. Press [Ctrl+C] to stop all services." -ForegroundColor White
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host ""

    # Keep alive and monitor services via port health checks.
    # NOTE: Vite spawns grandchild processes so HasExited on the parent
    # fires immediately and is unreliable. We check ports instead.
    $watchdogFailCounts = @{ Backend = 0; Frontend = 0 }
    while ($true) {
        Start-Sleep -Seconds 3

        # Check Backend port 3001
        try {
            $null = Invoke-WebRequest -Uri "http://127.0.0.1:3001/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            $watchdogFailCounts["Backend"] = 0
        } catch {
            $watchdogFailCounts["Backend"]++
            if ($watchdogFailCounts["Backend"] -ge 5) {
                Write-Host "`n[WARNING] Backend API (port 3001) stopped responding." -ForegroundColor Red
                Stop-TrackedServices; exit 1
            }
        }

        # Check Frontend port 5173
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect("127.0.0.1", 5173)
            $tcp.Close()
            $watchdogFailCounts["Frontend"] = 0
        } catch {
            $watchdogFailCounts["Frontend"]++
            if ($watchdogFailCounts["Frontend"] -ge 5) {
                Write-Host "`n[WARNING] Frontend (port 5173) stopped responding." -ForegroundColor Red
                Stop-TrackedServices; exit 1
            }
        }
    }

}
catch {
    Write-Host "`n[LAUNCHER EXCEPTION] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "$($_.InvocationInfo.PositionMessage)" -ForegroundColor DarkRed
}
finally {
    Stop-TrackedServices
}
