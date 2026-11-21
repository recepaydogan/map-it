import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')

const candidateDirectories = [
  process.env.VALHEIM_INSTALL_DIR,
  'C:/Program Files (x86)/Steam/steamapps/common/Valheim',
  'C:/Program Files/Steam/steamapps/common/Valheim',
].filter(Boolean)

export const findValheimInstallDirectory = () => {
  for (const candidate of candidateDirectories) {
    const resolved = path.resolve(candidate)
    if (fs.existsSync(path.join(resolved, 'valheim.exe'))) return resolved
  }

  throw new Error(
    'Valheim installation was not found. Set VALHEIM_INSTALL_DIR to the game directory.',
  )
}

export const getValheimPaths = () => {
  const installDirectory = findValheimInstallDirectory()
  const dataDirectory = path.join(installDirectory, 'valheim_Data')
  const softReferenceDirectory = path.join(dataDirectory, 'StreamingAssets', 'SoftRef')

  return {
    installDirectory,
    dataDirectory,
    managedDirectory: path.join(dataDirectory, 'Managed'),
    assemblyPath: path.join(dataDirectory, 'Managed', 'assembly_valheim.dll'),
    softReferenceDirectory,
    manifestPath: path.join(softReferenceDirectory, 'manifest_extended'),
    manifestPaths: [
      path.join(softReferenceDirectory, 'manifest'),
      path.join(softReferenceDirectory, 'manifest_extended'),
    ],
    bundleDirectory: path.join(softReferenceDirectory, 'Bundles'),
  }
}

export const projectRoot = root
