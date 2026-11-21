param([int]$ExistingWorkerId = 0)

$ErrorActionPreference = 'Stop'
$localeWorkspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $localeWorkspace
$env:PYTHONUTF8 = '1'

if ($ExistingWorkerId -gt 0) {
    $localeWorker = Get-CimInstance Win32_Process -Filter "ProcessId = $ExistingWorkerId"
    if ($localeWorker) {
        if ($localeWorker.Name -ne 'python.exe' -or $localeWorker.CommandLine -notlike '*scripts/build-content-locales.py*') {
            throw 'The expected locale worker PID belongs to a different process.'
        }
        Write-Output "Waiting for the current locale builder, PID $ExistingWorkerId."
        Wait-Process -Id $ExistingWorkerId
    }
}

Write-Output 'Starting the cached full-language retry with the latest reviewed contexts.'
python scripts/build-content-locales.py --languages tr,de,fr,it,es,ru,pl,ja,ko,pt-BR,th,zh-Hans,zh-Hant,uk --workers 2 --sync-ui
if ($LASTEXITCODE -ne 0) { throw "Content retry failed with exit code $LASTEXITCODE" }

# The builder retains failed batches without exporting an incomplete vector.
# Check actual files instead of treating its zero exit code as full coverage.
node --experimental-strip-types --test --test-name-pattern 'official|preserves authored|every supplemental' src/i18n/locale-packs.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Some language packs still need repair; retained all successful caches.' }

python scripts/complete-ui-plurals.py
if ($LASTEXITCODE -ne 0) { throw "Counted UI translation failed with exit code $LASTEXITCODE" }

npm run test:localization:release
if ($LASTEXITCODE -ne 0) { throw 'The full localization release audit still has unresolved findings.' }

Write-Output 'Translation and content gates passed. Final rendered verification, language activation and the production build remain.'
