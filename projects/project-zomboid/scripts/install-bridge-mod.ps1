$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot "bridge-mod\ProjectZomboidInteractiveMap"
$userProfilePath = [Environment]::GetFolderPath("UserProfile")
$modsPath = Join-Path $userProfilePath "Zomboid\mods"
$targetPath = Join-Path $modsPath "ProjectZomboidInteractiveMap"

if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Bridge mod source was not found: $sourcePath"
}

$sourceCommonPath = Join-Path $sourcePath "common"
$sourceBuildPath = Join-Path $sourcePath "42"
if (-not (Test-Path -LiteralPath $sourceCommonPath) -or -not (Test-Path -LiteralPath $sourceBuildPath)) {
    throw "Bridge mod does not have the required Build 42 common and version folders."
}

$resolvedModsPath = [IO.Path]::GetFullPath($modsPath).TrimEnd([IO.Path]::DirectorySeparatorChar)
$resolvedTargetPath = [IO.Path]::GetFullPath($targetPath).TrimEnd([IO.Path]::DirectorySeparatorChar)
if (-not $resolvedTargetPath.StartsWith($resolvedModsPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Bridge mod target is outside the Project Zomboid mods folder: $resolvedTargetPath"
}

New-Item -ItemType Directory -Path $modsPath -Force | Out-Null
New-Item -ItemType Directory -Path $targetPath -Force | Out-Null

foreach ($childName in @("mod.info", "media", "common", "42")) {
    $childPath = Join-Path $targetPath $childName
    if (Test-Path -LiteralPath $childPath) {
        Remove-Item -LiteralPath $childPath -Recurse -Force
    }
}

Copy-Item -LiteralPath $sourceCommonPath -Destination $targetPath -Recurse -Force
Copy-Item -LiteralPath $sourceBuildPath -Destination $targetPath -Recurse -Force

Write-Output "Bridge mod installed to $targetPath"
