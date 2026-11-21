$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$cacheRoot = Join-Path $projectRoot 'tools\cache\ilspycmd'
$version = '9.1.0.7988'
$packagePath = Join-Path $cacheRoot "ilspycmd.$version.zip"
$installPath = Join-Path $cacheRoot $version

if (Test-Path (Join-Path $installPath 'tools\net8.0\any\ilspycmd.dll')) {
  Write-Output "ILSpyCmd $version is already installed."
  exit 0
}

New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
Invoke-WebRequest -Uri "https://api.nuget.org/v3-flatcontainer/ilspycmd/$version/ilspycmd.$version.nupkg" -OutFile $packagePath
Expand-Archive -LiteralPath $packagePath -DestinationPath $installPath -Force
Write-Output "ILSpyCmd $version installed at $installPath"
