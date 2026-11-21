$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$version = '9.1.0.7988'
$decompiler = Join-Path $projectRoot "tools\cache\ilspycmd\$version\tools\net8.0\any\ilspycmd.dll"
$outputDirectory = Join-Path $projectRoot 'data\generated\decompiled'
$utilsOutputDirectory = Join-Path $projectRoot 'data\generated\decompiled-utils'
$gameDirectory = if ($env:VALHEIM_INSTALL_DIR) { $env:VALHEIM_INSTALL_DIR } else { 'C:\Program Files (x86)\Steam\steamapps\common\Valheim' }
$managedDirectory = Join-Path $gameDirectory 'valheim_Data\Managed'
$assembly = Join-Path $managedDirectory 'assembly_valheim.dll'
$utilsAssembly = Join-Path $managedDirectory 'assembly_utils.dll'

if (-not (Test-Path $decompiler)) {
  throw 'ILSpyCmd is not installed. Run npm run setup:decompiler first.'
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
dotnet $decompiler -p -o $outputDirectory -r $managedDirectory $assembly
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

New-Item -ItemType Directory -Force -Path $utilsOutputDirectory | Out-Null
dotnet $decompiler -p -o $utilsOutputDirectory -r $managedDirectory $utilsAssembly
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
