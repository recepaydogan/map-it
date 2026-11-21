param([string]$OutputDirectory = 'dist')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'resolve-jdk.ps1')
$jdkBin = Resolve-JdkBin
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$probeRoot = Join-Path $projectRoot '.runtime-data/position-probe'
& (Join-Path $PSScriptRoot 'build-probe.ps1')
$source = Join-Path $probeRoot 'source/AutoPosition.java'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'auto-position.java') -Destination $source
& (Join-Path $jdkBin 'javac.exe') --release 17 --add-modules jdk.attach -d (Join-Path $probeRoot 'classes') $source
if ($LASTEXITCODE -ne 0) { throw 'Automatic launcher compilation failed' }
$runtimeRoot = Join-Path $probeRoot 'runtime-17'
if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'bin/java.exe'))) {
    & (Join-Path $jdkBin 'jlink.exe') --add-modules java.base,java.instrument,jdk.attach --strip-debug --no-header-files --no-man-pages --compress=2 --output $runtimeRoot
    if ($LASTEXITCODE -ne 0) { throw 'Bundled runtime build failed' }
}
$destination = Join-Path ([IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDirectory))) 'native-position'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$agentJar = [IO.File]::ReadAllText((Join-Path $probeRoot 'agent-path.txt'), [Text.Encoding]::UTF8)
Copy-Item -LiteralPath $agentJar -Destination $destination -Force
[IO.File]::WriteAllText((Join-Path $destination 'agent-name.txt'), [IO.Path]::GetFileName($agentJar), [Text.UTF8Encoding]::new($false))
& (Join-Path $jdkBin 'jar.exe') --create --file (Join-Path $destination 'launcher.jar') --main-class AutoPosition -C (Join-Path $probeRoot 'classes') AutoPosition.class
if ($LASTEXITCODE -ne 0) { throw 'Automatic launcher packaging failed' }
# Keep the runtime's legal notices and release metadata with the binaries.
New-Item -ItemType Directory -Force -Path (Join-Path $destination 'runtime') | Out-Null
$runtimeHasher = [Security.Cryptography.SHA256]::Create()
try {
    Get-ChildItem -LiteralPath $runtimeRoot -Recurse -File | ForEach-Object {
        $relativePath = $_.FullName.Substring($runtimeRoot.Length).TrimStart('\')
        $targetPath = Join-Path (Join-Path $destination 'runtime') $relativePath
        $unchanged = $false
        if (Test-Path -LiteralPath $targetPath) {
            $sourceHash = [BitConverter]::ToString($runtimeHasher.ComputeHash([IO.File]::ReadAllBytes($_.FullName)))
            $targetHash = [BitConverter]::ToString($runtimeHasher.ComputeHash([IO.File]::ReadAllBytes($targetPath)))
            $unchanged = $sourceHash -eq $targetHash
        }
        if (-not $unchanged) {
            New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($targetPath)) | Out-Null
            Copy-Item -LiteralPath $_.FullName -Destination $targetPath -Force
        }
    }
} finally {
    $runtimeHasher.Dispose()
}
Write-Output $destination
