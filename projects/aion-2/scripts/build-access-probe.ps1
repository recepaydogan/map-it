$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$source = Join-Path $root 'native\access-probe'
$output = Join-Path $root 'public\plugins'
$manifestPath = Join-Path $root 'public\manifest.json'
$sourceNames = @('access-probe-plugin.cs', 'position-scanner.cs', 'process-memory.cs', 'engine-roots.cs', 'engine-reflection.cs', 'local-player-resolver.cs', 'discovery-cache.cs')
$sourcePaths = $sourceNames | ForEach-Object { Join-Path $source $_ }
function Get-BuildInputHash($path) {
    $hasher = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($path)
    try { return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $hasher.Dispose() }
}
# Include the compiler and build recipe: flags/toolchain changes must also get
# a fresh filename. Reusing an unchanged binary avoids non-deterministic MVIDs.
$buildInputs = @($sourcePaths) + @($PSCommandPath, $compiler)
$sourceHashes = ($buildInputs | ForEach-Object { Get-BuildInputHash $_ }) -join '-'
$hasher = [Security.Cryptography.SHA256]::Create()
try { $pluginHash = ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($sourceHashes)))).Replace('-', '').ToLowerInvariant().Substring(0, 16) }
finally { $hasher.Dispose() }
$pluginName = "access-probe-plugin-$pluginHash.dll"
New-Item -ItemType Directory -Path $output -Force | Out-Null

$pluginPath = Join-Path $output $pluginName
if (Test-Path -LiteralPath $pluginPath) {
    Write-Output "Reusing unchanged native plug-in: $pluginName"
} else {
    $stagingDirectory = Join-Path $output ('.build-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stagingDirectory | Out-Null
    $stagedPlugin = Join-Path $stagingDirectory $pluginName
    try {
        & $compiler /nologo /target:library /platform:x64 /optimize+ /warnaserror+ /r:System.Core.dll /r:System.Web.Extensions.dll "/out:$stagedPlugin" @sourcePaths
        if ($LASTEXITCODE -ne 0) { throw 'Access probe plug-in compilation failed.' }
        # A failed compiler never leaves a partial file in the reusable cache.
        if (!(Test-Path -LiteralPath $pluginPath)) { Move-Item -LiteralPath $stagedPlugin -Destination $pluginPath }
    } finally {
        if (Test-Path -LiteralPath $stagedPlugin) { Remove-Item -LiteralPath $stagedPlugin -Force }
        Remove-Item -LiteralPath $stagingDirectory
    }
}
$manifest = [IO.File]::ReadAllText($manifestPath)
$pattern = 'plugins/access-probe-plugin(?:-[^"/]+)?\.dll'
if ([regex]::Matches($manifest, $pattern).Count -ne 1) { throw 'Expected exactly one access probe plug-in reference.' }
$updatedManifest = [regex]::Replace($manifest, $pattern, "plugins/$pluginName")
if ($updatedManifest -ne $manifest) { [IO.File]::WriteAllText($manifestPath, $updatedManifest) }
Get-ChildItem -LiteralPath $output -Filter 'access-probe-plugin*.dll' -File |
    Where-Object { $_.Name -ne $pluginName } |
    Remove-Item -Force
$oldHelper = Join-Path $output 'access-probe-helper.exe'
if (Test-Path -LiteralPath $oldHelper) { Remove-Item -LiteralPath $oldHelper -Force }
Write-Output "Access probe binaries ready: $pluginName"

