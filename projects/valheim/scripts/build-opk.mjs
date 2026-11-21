import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { collectRequiredOpkFiles } from './opk-content.mjs'

const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'dist')
const npmEntryPoint = process.env.npm_execpath

if (!npmEntryPoint) {
  throw new Error('npm_execpath is missing. Run this script through npm run build:opk.')
}

const runNpmScript = (scriptName) => {
  execFileSync(process.execPath, [npmEntryPoint, 'run', scriptName], {
    cwd: root,
    stdio: 'inherit',
  })
}

if (fs.existsSync(dist)) fs.rmSync(dist, { recursive: true, force: true })

runNpmScript('validate')
runNpmScript('build:icons')
runNpmScript('build')

const { manifest, requiredFiles: requiredOpkFiles } = collectRequiredOpkFiles(dist)

const packageName = `valheim-map-${manifest.meta.version}`
const zipPath = path.join(root, `${packageName}.zip`)
const opkPath = path.join(root, `${packageName}.opk`)
for (const file of [zipPath, opkPath]) {
  if (fs.existsSync(file)) fs.rmSync(file)
}

const escapedDist = dist.replaceAll("'", "''")
const escapedZip = zipPath.replaceAll("'", "''")
execFileSync(
  'powershell.exe',
  ['-NoProfile', '-Command', `Compress-Archive -Path '${escapedDist}\\*' -DestinationPath '${escapedZip}' -CompressionLevel Optimal`],
  { cwd: root, stdio: 'inherit' },
)

const escapedRequiredFiles = requiredOpkFiles
  .map((file) => `'${file.replaceAll("'", "''").replaceAll('\\', '/')}'`)
  .join(',')
const validateArchive = [
  'Add-Type -AssemblyName System.IO.Compression.FileSystem',
  `$archive = [System.IO.Compression.ZipFile]::OpenRead('${escapedZip}')`,
  'try {',
  '  $entries = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)',
  '  foreach ($entry in $archive.Entries) { [void]$entries.Add($entry.FullName.Replace("\\", "/")) }',
  `  foreach ($required in @(${escapedRequiredFiles})) { if (-not $entries.Contains($required)) { throw "Missing packaged OPK file: $required" } }`,
  '} finally { $archive.Dispose() }',
].join('; ')
execFileSync('powershell.exe', ['-NoProfile', '-Command', validateArchive], {
  cwd: root,
  stdio: 'inherit',
})

fs.renameSync(zipPath, opkPath)
console.log(`OPK created and verified (${requiredOpkFiles.length} required files): ${opkPath}`)
