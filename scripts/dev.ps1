param([switch]$PassThru)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
foreach ($relative in @('backend/.env', 'app/.env.local', 'backend/.venv/Scripts/python.exe', 'app/node_modules')) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $relative))) {
        throw "Missing $relative. Follow README.md before starting the app."
    }
}
foreach ($port in @(8000, 3000)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        throw "Port $port is already occupied. Stop its server before starting this copy."
    }
}

function Start-DevelopmentWindow([string]$directory, [string]$command) {
    $quotedDirectory = $directory.Replace("'", "''")
    $script = "Set-Location -LiteralPath '$quotedDirectory'; $command"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    Start-Process powershell.exe -WindowStyle Normal -ArgumentList @('-NoProfile', '-NoExit', '-EncodedCommand', $encoded) -PassThru
}

$backendProcess = Start-DevelopmentWindow (Join-Path $projectRoot 'backend') '.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000'
try {
    $frontendProcess = Start-DevelopmentWindow (Join-Path $projectRoot 'app') 'npm run dev -- --hostname 127.0.0.1 --port 3000'
} catch {
    Stop-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue
    throw
}
Write-Host "Started $projectRoot at http://127.0.0.1:3000 (API http://127.0.0.1:8000)."
if ($PassThru) {
    [pscustomobject]@{ Root = $projectRoot; BackendWindowPid = $backendProcess.Id; FrontendWindowPid = $frontendProcess.Id }
}
