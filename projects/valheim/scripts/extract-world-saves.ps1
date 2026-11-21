$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
  throw 'Data tools are not installed. Run npm run setup:data-tools first.'
}

& $python (Join-Path $projectRoot 'tools\extract-world-saves.py')
