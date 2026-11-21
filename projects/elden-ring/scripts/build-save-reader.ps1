$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sources = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'native\save-reader') -Filter '*.cs' -File | Sort-Object Name | ForEach-Object FullName)
$hasher = [Security.Cryptography.SHA256]::Create()
try {
    $hashInput = (@($sources) + @($PSCommandPath) | ForEach-Object {
        [BitConverter]::ToString($hasher.ComputeHash([IO.File]::ReadAllBytes($_)))
    }) -join ''
    $hash = [BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($hashInput))).Replace('-', '').ToLowerInvariant().Substring(0, 12)
}
finally { $hasher.Dispose() }
$output = Join-Path $projectRoot 'public\plugins'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$fileName = "elden-ring-save-reader-$hash.dll"
$target = Join-Path $output $fileName
if (-not (Test-Path -LiteralPath $target)) {
    & $compiler /nologo /target:library /platform:x64 /optimize+ /warnaserror+ /reference:System.Web.Extensions.dll "/out:$target" @sources
    if ($LASTEXITCODE -ne 0) { throw 'Save reader compilation failed.' }
}
$manifestPath = Join-Path $projectRoot 'public\manifest.json'
$manifest = [IO.File]::ReadAllText($manifestPath)
$updated = [regex]::Replace($manifest, 'plugins/elden-ring-save-reader(?:-[a-f0-9]+)?\.dll', "plugins/$fileName")
if ($updated -ne $manifest) { [IO.File]::WriteAllText($manifestPath, $updated) }
Write-Output "Save reader ready: $fileName"
