function Resolve-JdkBin {
    $projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
    $candidates = @()
    if ($env:JAVA_HOME) { $candidates += (Join-Path $env:JAVA_HOME 'bin') }
    $candidates += (Join-Path $projectRoot '.runtime-data/toolchains/jdk-17/bin')
    $pathJavac = Get-Command javac -ErrorAction SilentlyContinue
    if ($pathJavac) { $candidates += (Split-Path -Parent $pathJavac.Source) }

    foreach ($bin in $candidates) {
        $tools = @('java', 'javac', 'jar', 'jlink') | ForEach-Object { Join-Path $bin ($_.ToString() + '.exe') }
        if (@($tools | Where-Object { -not (Test-Path -LiteralPath $_) }).Count -gt 0) { continue }
        $version = (& $tools[1] -version 2>&1) -join ' '
        if ($LASTEXITCODE -eq 0 -and $version -match '^javac 17(\.|$)') { return $bin }
    }

    throw 'JDK 17 with java, javac, jar and jlink is required. Set JAVA_HOME, add it to PATH, or unpack it into .runtime-data/toolchains/jdk-17.'
}
