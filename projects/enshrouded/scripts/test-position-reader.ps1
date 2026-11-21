$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sources = @('position-reader.cs', 'root-layout.cs', 'arena-locator.cs', 'position-reader-tests.cs') |
    ForEach-Object { Join-Path $projectRoot "native\position-reader\$_" }
$output = Join-Path $env:TEMP ('enshrouded-reader-tests-' + [Guid]::NewGuid().ToString('N') + '.exe')
try {
    & $compiler /nologo /target:exe /platform:x64 /optimize+ /warnaserror+ "/out:$output" @sources
    if ($LASTEXITCODE -ne 0) { throw 'Native reader test compilation failed.' }
    & $output
    if ($LASTEXITCODE -ne 0) { throw 'Native reader tests failed.' }
} finally {
    if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Force }
}
