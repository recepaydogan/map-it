$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$output = Join-Path $projectRoot 'public\plugins'
$sources = @(
    (Join-Path $projectRoot 'native\position-reader\position-reader.cs'),
    (Join-Path $projectRoot 'native\position-reader\root-layout.cs'),
    (Join-Path $projectRoot 'native\position-reader\arena-locator.cs')
)
$manifestPath = Join-Path $projectRoot 'public\manifest.json'
$hasher = [Security.Cryptography.SHA256]::Create()
try {
    $inputHashes = @($sources) + @($PSCommandPath, $compiler) | ForEach-Object {
        $stream = [IO.File]::OpenRead($_)
        try { [BitConverter]::ToString($hasher.ComputeHash($stream)) }
        finally { $stream.Dispose() }
    }
    $sourceHash = ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes(($inputHashes -join '-'))))).Replace('-', '').ToLowerInvariant().Substring(0, 12)
}
finally { $hasher.Dispose() }
$fileName = "enshrouded-position-reader-$sourceHash.dll"
$target = Join-Path $output $fileName
New-Item -ItemType Directory -Path $output -Force | Out-Null
if (-not (Test-Path -LiteralPath $target)) {
    $staging = Join-Path $output ('.build-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $staging | Out-Null
    $stagedDll = Join-Path $staging $fileName
    try {
        & $compiler /nologo /target:library /platform:x64 /optimize+ /warnaserror+ "/out:$stagedDll" @sources
        if ($LASTEXITCODE -ne 0) { throw 'Position reader compilation failed.' }
        Move-Item -LiteralPath $stagedDll -Destination $target
    } finally {
        if (Test-Path -LiteralPath $stagedDll) { Remove-Item -LiteralPath $stagedDll -Force }
        Remove-Item -LiteralPath $staging
    }
}
$manifest = [IO.File]::ReadAllText($manifestPath)
$pattern = 'plugins/enshrouded-position-reader(?:-[^"/]+)?\.dll'
if ([regex]::Matches($manifest, $pattern).Count -ne 1) { throw 'Expected exactly one position reader DLL reference in manifest.' }
$updatedManifest = [regex]::Replace($manifest, $pattern, "plugins/$fileName")
if ($updatedManifest -ne $manifest) { [IO.File]::WriteAllText($manifestPath, $updatedManifest) }
# Public assets ship in release packages; keep only the DLL named by the manifest.
Get-ChildItem -LiteralPath $output -Filter 'enshrouded-position-reader*.dll' -File |
    Where-Object { $_.Name -ne $fileName } |
    Remove-Item -Force
Write-Output "Position reader ready: $fileName"
