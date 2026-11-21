$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
  throw 'Python data environment is missing. Run npm run setup:data-tools first.'
}

& $python (Join-Path $projectRoot 'tools\extract-location-contents.py')
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
