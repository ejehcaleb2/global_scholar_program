$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot 'backend/.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Install the project virtual environment using README.md first.' }
& $python (Join-Path $PSScriptRoot 'verify.py')
exit $LASTEXITCODE
