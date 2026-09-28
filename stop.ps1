<#
.SYNOPSIS
    ServerConsole Process Terminator
.DESCRIPTION
    Safely stops all ServerConsole child processes using tracked PIDs.
#>

$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "`nStopping ServerConsole services..." -ForegroundColor Yellow

$PidsFile = Join-Path $ProjectRoot "logs\pids.json"
$StoppedAny = $false

if (Test-Path $PidsFile) {
    try {
        $pidsData = Get-Content $PidsFile -Raw | ConvertFrom-Json
        $pidsToKill = @($pidsData.backendPid, $pidsData.frontendPid, $pidsData.mockServersPid) | Where-Object { $_ -ne $null }

        foreach ($pidToKill in $pidsToKill) {
            $p = Get-Process -Id $pidToKill -ErrorAction SilentlyContinue
            if ($p) {
                Write-Host "Terminating $($p.ProcessName) (PID $pidToKill)..." -ForegroundColor DarkGray
                # Kill children first
                Get-CimInstance Win32_Process -Filter "ParentProcessId=$pidToKill" -ErrorAction SilentlyContinue |
                    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
                $StoppedAny = $true
            }
        }
        Remove-Item $PidsFile -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Host "Warning: Could not read pids.json ($($_.Exception.Message))" -ForegroundColor DarkYellow
    }
}

# Scan ServerConsole specific ports (5173, 3001, 5901, 2222) to catch any orphaned child processes
$ports = @(5173, 3001, 5901, 2222)
foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        $pidNum = $conn.OwningProcess
        if ($pidNum -gt 0) {
            $proc = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
            if ($proc -and ($proc.ProcessName -match "node|cmd")) {
                Write-Host "Terminating orphaned process on port $port (PID $pidNum, $($proc.ProcessName))..." -ForegroundColor DarkGray
                Stop-Process -Id $pidNum -Force -ErrorAction SilentlyContinue
                $StoppedAny = $true
            }
        }
    }
}

if ($StoppedAny) {
    Write-Host "ServerConsole services stopped successfully.`n" -ForegroundColor Green
} else {
    Write-Host "No active ServerConsole services were found running.`n" -ForegroundColor DarkGray
}
