param([int]$GameProcessId = 0)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'resolve-jdk.ps1')
$jdkBin = Resolve-JdkBin
$probeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../.runtime-data/position-probe'))
if ($GameProcessId -eq 0) {
    $games = @(Get-Process -Name ProjectZomboid64 -ErrorAction SilentlyContinue)
    if ($games.Count -ne 1) { throw 'Expected one running ProjectZomboid64 process; enter a world first' }
    $GameProcessId = $games[0].Id
}
$targetProcess = Get-Process -Id $GameProcessId
if ($targetProcess.ProcessName -ne 'ProjectZomboid64') { throw 'Target is not ProjectZomboid64' }
$outputRoot = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Zomboid/Lua/PZInteractiveMapNative'
$agentJar = Get-Content -LiteralPath (Join-Path $probeRoot 'agent-path.txt') -Raw
& (Join-Path $jdkBin 'java.exe') --add-modules jdk.attach -cp (Join-Path $probeRoot 'classes') AttachProbe $GameProcessId $agentJar $outputRoot
if ($LASTEXITCODE -ne 0) { throw 'Attach failed; see Java diagnostic output' }
Write-Output $outputRoot
