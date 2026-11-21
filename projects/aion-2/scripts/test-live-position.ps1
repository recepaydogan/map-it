$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$testBinary = Join-Path $env:TEMP 'game-map-tracker-tests.exe'
$sources = @('access-probe-plugin.cs', 'position-scanner.cs', 'process-memory.cs', 'engine-roots.cs', 'engine-reflection.cs', 'local-player-resolver.cs', 'discovery-cache.cs', 'tracker-tests.cs', 'engine-memory-fixture.cs', 'discovery-cache-tests.cs') |
    ForEach-Object { Join-Path $root "native\access-probe\$_" }
& "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:exe /platform:x64 /optimize+ /warnaserror+ /r:System.Core.dll /r:System.Web.Extensions.dll "/out:$testBinary" @sources
if ($LASTEXITCODE -ne 0) { throw 'Tracker test compilation failed.' }
& $testBinary
if ($LASTEXITCODE -ne 0) { throw 'Tracker tests failed.' }
