$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$virtualEnvironment = Join-Path $projectRoot '.venv'
$python = Join-Path $virtualEnvironment 'Scripts\python.exe'

if (-not (Test-Path $python)) {
  python -m venv $virtualEnvironment
}

& $python -m pip install --disable-pip-version-check -r (Join-Path $projectRoot 'tools\requirements.txt')
