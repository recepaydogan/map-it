[CmdletBinding()]
param(
    [string]$ClientDirectory = 'C:\Program Files (x86)\World of Warcraft\_forever_',
    [switch]$PrepareOnly
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$clientRoot = [IO.Path]::GetFullPath($ClientDirectory).TrimEnd('\', '/')
if (-not [IO.Path]::IsPathRooted($ClientDirectory) -or
    -not $clientRoot.EndsWith('\_forever_', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'ClientDirectory must be an absolute path ending in _forever_.'
}
$outputRoot = Join-Path $projectRoot '.local\live-sync-prototype'
$addonRoot = Join-Path $outputRoot 'wfm-live-sync-prototype'
New-Item -ItemType Directory -Path $addonRoot -Force | Out-Null
$collector = [IO.File]::ReadAllText((Join-Path $projectRoot 'addons\position-bridge\character-snapshot.lua'))
if (-not $collector.Contains('WFM_CharacterDB')) { throw 'Character collector database name changed.' }
$collector = $collector.Replace('WFM_CharacterDB', 'WFM_LocalCharacterDB')
$publisher = [IO.File]::ReadAllText((Join-Path $projectRoot 'addons\live-sync-prototype\live-sync.lua'))
$source = "do`n$collector`nend`n`n$publisher`n"
$toc = @"
## Interface: 16001
## Title: WFM Local Live Sync Prototype
## Notes: Local transport experiment; no SavedVariables or production addon changes.
## Version: 0.0.1-local

live-sync.lua
"@
$utf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $addonRoot 'live-sync.lua'), $source, $utf8)
[IO.File]::WriteAllText((Join-Path $addonRoot 'wfm-live-sync-prototype.toc'), $toc, $utf8)
if (-not $PrepareOnly) {
    if (-not (Test-Path -LiteralPath (Join-Path $clientRoot 'Wow.exe') -PathType Leaf)) { throw 'Forever client executable not found.' }
    $destination = Join-Path $clientRoot 'Interface\AddOns\wfm-live-sync-prototype'
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    foreach ($name in @('live-sync.lua', 'wfm-live-sync-prototype.toc')) {
        $target = Join-Path $destination $name
        if (Test-Path -LiteralPath $target) {
            $backup = Join-Path $outputRoot ('backup-' + [Guid]::NewGuid().ToString('N') + '-' + $name)
            Copy-Item -LiteralPath $target -Destination $backup
            if ((Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $backup).Hash) { throw 'Backup verification failed.' }
        }
        Copy-Item -LiteralPath (Join-Path $addonRoot $name) -Destination $target -Force
        if ((Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath (Join-Path $addonRoot $name)).Hash) { throw 'Installed file verification failed.' }
    }
    Write-Output "Local prototype installed: $destination"
    Write-Output 'Load once with /reload. A newly discovered addon may require a game restart. Subsequent data updates need neither.'
}
Write-Output "Prepared addon: $addonRoot"
