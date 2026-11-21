param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$ProcessName,
  [ValidateRange(1, 3600)]
  [int]$DurationSeconds = 300,
  [ValidateRange(1, 60)]
  [int]$IntervalSeconds = 2,
  [string]$OutputPath
)

$startedAt = Get-Date
if (-not $OutputPath) {
  $reportDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'reports'
  New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
  $OutputPath = Join-Path $reportDirectory ('game-detection-process-{0}.jsonl' -f $startedAt.ToString('yyyyMMdd-HHmmss'))
}

Write-Output "Recording process evidence to $OutputPath"
$deadline = $startedAt.AddSeconds($DurationSeconds)
do {
  $gameIds = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | ForEach-Object Id)
  $overwolfIds = @(Get-Process -Name 'Overwolf' -ErrorAction SilentlyContinue | ForEach-Object Id)
  $browserIds = @(Get-Process -Name 'OverwolfBrowser' -ErrorAction SilentlyContinue | ForEach-Object Id)
  [pscustomobject]@{
    at = (Get-Date).ToUniversalTime().ToString('o')
    processName = $ProcessName
    gameProcessIds = $gameIds
    overwolfProcessIds = $overwolfIds
    overwolfBrowserProcessIds = $browserIds
  } | ConvertTo-Json -Compress -Depth 3 | Add-Content -LiteralPath $OutputPath -Encoding utf8
  if ((Get-Date) -ge $deadline) { break }
  Start-Sleep -Seconds $IntervalSeconds
} while ($true)

Write-Output "Process evidence saved to $OutputPath"
