$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sources = @('position-reader.cs', 'position-layout.cs') | ForEach-Object { Join-Path $projectRoot "native\position-reader\$_" }
$output = Join-Path $projectRoot 'public\plugins'
$research = Join-Path $projectRoot 'artifacts\live-tracker-research-2026-10-29'
New-Item -ItemType Directory -Path $output -Force | Out-Null
New-Item -ItemType Directory -Path $research -Force | Out-Null
$hasher = [Security.Cryptography.SHA256]::Create()
try {
    $sourceHashes = ($sources | ForEach-Object {
        $stream = [IO.File]::OpenRead($_)
        try { [BitConverter]::ToString($hasher.ComputeHash($stream)) }
        finally { $stream.Dispose() }
    }) -join ''
    $hash = ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::ASCII.GetBytes($sourceHashes)))).Replace('-', '').ToLowerInvariant().Substring(0, 12)
}
finally { $hasher.Dispose() }
$fileName = "phantom-blade-position-reader-$hash.dll"
$target = Join-Path $output $fileName
if (-not (Test-Path -LiteralPath $target)) {
    & $compiler /nologo /target:library /platform:x64 /optimize+ /warnaserror+ /reference:System.Web.Extensions.dll "/out:$target" $sources
    if ($LASTEXITCODE -ne 0) { throw 'Position reader compilation failed.' }
}
$probe = Join-Path $research "position-reader-$hash.exe"
if (-not (Test-Path -LiteralPath $probe)) {
    & $compiler /nologo /target:exe /define:CONSOLE /platform:x64 /optimize+ /warnaserror+ /reference:System.Web.Extensions.dll "/out:$probe" $sources
    if ($LASTEXITCODE -ne 0) { throw 'Position probe compilation failed.' }
}
$manifestPath = Join-Path $projectRoot 'public\manifest.json'
$manifest = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
$plugin = @{ file = "plugins/$fileName"; class = 'PhantomBladeCompanion.PositionReader' }
if (-not $manifest.data.PSObject.Properties['extra-objects']) {
    $manifest.data | Add-Member -NotePropertyName 'extra-objects' -NotePropertyValue ([pscustomobject]@{})
}
$manifest.data.'extra-objects' | Add-Member -NotePropertyName 'phantom-blade-position-reader' -NotePropertyValue $plugin -Force
$updated = ($manifest | ConvertTo-Json -Depth 30) + [Environment]::NewLine
if ($updated -ne [IO.File]::ReadAllText($manifestPath)) { [IO.File]::WriteAllText($manifestPath, $updated, [Text.UTF8Encoding]::new($false)) }
Get-ChildItem -LiteralPath $output -Filter 'phantom-blade-position-reader-*.dll' -File |
    Where-Object { $_.Name -ne $fileName } | Remove-Item -Force
Write-Output "Position reader ready: $fileName"
