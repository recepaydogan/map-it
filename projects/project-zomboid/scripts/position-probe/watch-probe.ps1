param([int]$DurationMinutes = 15)
$ErrorActionPreference = 'Stop'
if ($DurationMinutes -lt 1 -or $DurationMinutes -gt 60) { throw 'Duration must be between 1 and 60 minutes' }
$game = @(Get-Process -Name ProjectZomboid64 -ErrorAction SilentlyContinue)
if ($game.Count -ne 1) { throw 'Expected one running game' }
$gameId = $game[0].Id
$outputRoot = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Zomboid/Lua/PZInteractiveMapNative'
$deadline = [DateTime]::UtcNow.AddMinutes($DurationMinutes)
try {
    while ([DateTime]::UtcNow -lt $deadline -and (Get-Process -Id $gameId -ErrorAction SilentlyContinue)) {
        if (Test-Path -LiteralPath (Join-Path $outputRoot 'stop')) { break }
        $statusPath = Join-Path $outputRoot 'status.txt'
        $status = if (Test-Path -LiteralPath $statusPath) { Get-Content -LiteralPath $statusPath -Raw } else { '' }
        if ($status -eq 'failed') { throw (Get-Content -LiteralPath (Join-Path $outputRoot 'error.txt') -Raw) }
        if ($status -ne 'running') { & (Join-Path $PSScriptRoot 'run-probe.ps1') -GameProcessId $gameId }
        Start-Sleep -Seconds 1
    }
} finally {
    if (Test-Path -LiteralPath $outputRoot) {
        New-Item -ItemType File -Force -Path (Join-Path $outputRoot 'stop') | Out-Null
    }
}
