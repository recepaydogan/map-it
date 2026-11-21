$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'resolve-jdk.ps1')
$jdkBin = Resolve-JdkBin
$probeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../.runtime-data/position-probe'))
$sourceRoot = Join-Path $probeRoot 'source'
$classesRoot = Join-Path $probeRoot 'classes'
New-Item -ItemType Directory -Force -Path $sourceRoot, $classesRoot | Out-Null
$agentSource = Join-Path $PSScriptRoot 'position-probe.java'
# A new class and JAR let a stopped probe be updated without restarting the game.
$agentHasher = [Security.Cryptography.SHA256]::Create()
try {
    $agentHash = [BitConverter]::ToString($agentHasher.ComputeHash([IO.File]::ReadAllBytes($agentSource))).Replace('-', '')
} finally {
    $agentHasher.Dispose()
}
$agentClass = 'PositionProbe_' + $agentHash.Substring(0, 16)
$agentJava = Join-Path $sourceRoot ($agentClass + '.java')
[IO.File]::WriteAllText($agentJava, ([IO.File]::ReadAllText($agentSource).Replace('public final class PositionProbe', ('public final class ' + $agentClass))), [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'attach-probe.java') -Destination (Join-Path $sourceRoot 'AttachProbe.java')
& (Join-Path $jdkBin 'javac.exe') --release 17 --add-modules jdk.attach -d $classesRoot $agentJava (Join-Path $sourceRoot 'AttachProbe.java')
if ($LASTEXITCODE -ne 0) { throw 'Probe compilation failed' }
$manifestPath = Join-Path $probeRoot 'manifest.mf'
[IO.File]::WriteAllText($manifestPath, "Manifest-Version: 1.0`nAgent-Class: $agentClass`n`n", [Text.UTF8Encoding]::new($false))
$agentJar = Join-Path $probeRoot ($agentClass + '.jar')
# The running game may hold this content-addressed JAR open. Reuse it when
# the source hash is unchanged instead of overwriting the loaded agent.
if (Test-Path -LiteralPath $agentJar) {
    $agentEntries = & (Join-Path $jdkBin 'jar.exe') --list --file $agentJar
    if ($LASTEXITCODE -ne 0 -or $agentEntries -notcontains ($agentClass + '.class')) {
        throw 'Existing probe package is invalid'
    }
} else {
    & (Join-Path $jdkBin 'jar.exe') --create --file $agentJar --manifest $manifestPath -C $classesRoot ($agentClass + '.class')
    if ($LASTEXITCODE -ne 0) { throw 'Probe packaging failed' }
}
[IO.File]::WriteAllText((Join-Path $probeRoot 'agent-path.txt'), $agentJar, [Text.UTF8Encoding]::new($false))
Write-Output $probeRoot
