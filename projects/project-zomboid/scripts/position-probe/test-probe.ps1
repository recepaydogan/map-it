param([string]$TargetJavaPath)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'resolve-jdk.ps1')
$jdkBin = Resolve-JdkBin
if (-not $TargetJavaPath) { $TargetJavaPath = Join-Path $jdkBin 'java.exe' }
$probeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../.runtime-data/position-probe'))
$fixtureRoot = Join-Path $probeRoot 'fixture'
$outputRoot = Join-Path $probeRoot ('test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $fixtureRoot, $outputRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'test-player.java') -Destination (Join-Path $fixtureRoot 'IsoPlayer.java')
& (Join-Path $jdkBin 'javac.exe') --release 17 -d $fixtureRoot (Join-Path $fixtureRoot 'IsoPlayer.java')
if ($LASTEXITCODE -ne 0) { throw 'Fixture compilation failed' }
$testProcess = Start-Process -FilePath $TargetJavaPath -ArgumentList @('-cp', ('"' + $fixtureRoot + '"'), 'zombie.characters.IsoPlayer') -WindowStyle Hidden -PassThru
try {
    Start-Sleep -Milliseconds 700
    $agentJar = Get-Content -LiteralPath (Join-Path $probeRoot 'agent-path.txt') -Raw
    & (Join-Path $jdkBin 'java.exe') --add-modules jdk.attach -cp (Join-Path $probeRoot 'classes') AttachProbe $testProcess.Id $agentJar $outputRoot
    if ($LASTEXITCODE -ne 0) { throw 'Fixture attach failed' }
    $snapshotPath = Join-Path $outputRoot 'position.json'
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    while (-not (Test-Path -LiteralPath $snapshotPath)) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'No position after player became available' }
        Start-Sleep -Milliseconds 200
    }
    $first = Get-Content -LiteralPath $snapshotPath -Raw | ConvertFrom-Json
    if ($first.x -ne 1234.5 -or $first.y -ne 6789.25 -or $first.z -ne 2) { throw 'Incorrect coordinates' }
    if ($first.dx -ne 0.6 -or $first.dy -ne -0.8) { throw 'Facing direction was not preserved and normalized' }
    Start-Sleep -Milliseconds 600
    $next = Get-Content -LiteralPath $snapshotPath -Raw | ConvertFrom-Json
    if ($next.sequence -le $first.sequence -or $next.updatedAt -le $first.updatedAt) { throw 'Samples did not advance' }
    New-Item -ItemType File -Path (Join-Path $outputRoot 'stop') | Out-Null
    Start-Sleep -Milliseconds 500
    if ((Get-Content (Join-Path $outputRoot 'status.txt') -Raw) -ne 'stopped') { throw 'Stop signal failed' }
    Write-Output 'Attach, null-player recovery, coordinates, sample progression and stop checks passed.'
} finally {
    if (-not $testProcess.HasExited) { Stop-Process -Id $testProcess.Id }
}
