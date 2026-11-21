import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getValheimPaths, projectRoot } from './lib/valheim-paths.mjs'

const normalizePath = (value) => value.replaceAll('\\', '/')

const classifyAsset = (assetPath) => {
  const value = assetPath.toLowerCase()
  if (value.includes('/characters/')) return 'characters'
  if (value.includes('/items/')) return 'items'
  if (value.includes('/recipes/')) return 'recipes'
  if (value.includes('/locations/') || value.includes('/location')) return 'locations'
  if (value.includes('/world/')) return 'world'
  if (value.includes('/pieces/')) return 'pieces'
  if (value.includes('/statuseffects/')) return 'status-effects'
  if (value.includes('/ui/')) return 'ui'
  if (value.includes('/audio/') || /\.(wav|mp3|ogg)$/i.test(value)) return 'audio'
  if (/\.(png|jpg|jpeg|tga|psd)$/i.test(value)) return 'textures'
  if (/\.prefab$/i.test(value)) return 'prefabs'
  if (/\.asset$/i.test(value)) return 'scriptable-objects'
  return 'other'
}

const parseManifest = (content) => {
  const dependencies = new Map()
  const assets = []
  const lines = content.split(/\r?\n/)
  let section = 'header'
  let currentDependencyBundle = null
  let currentAsset = null

  for (const line of lines) {
    if (line === 'bundle dependencies:') {
      section = 'dependencies'
      continue
    }
    if (line === 'asset locations:') {
      section = 'assets'
      continue
    }

    if (section === 'dependencies') {
      const bundleMatch = line.match(/^- bundle: (.+)$/)
      if (bundleMatch) {
        currentDependencyBundle = bundleMatch[1]
        dependencies.set(currentDependencyBundle, [])
        continue
      }
      const dependencyMatch = line.match(/^  - (.+)$/)
      if (dependencyMatch && currentDependencyBundle) {
        dependencies.get(currentDependencyBundle).push(dependencyMatch[1])
      }
      continue
    }

    if (section === 'assets') {
      const assetMatch = line.match(/^- asset ID: (.+)$/)
      if (assetMatch) {
        if (currentAsset) assets.push(currentAsset)
        currentAsset = { assetId: assetMatch[1], bundle: '', path: '', category: '' }
        continue
      }
      const bundleMatch = line.match(/^  bundle: (.+)$/)
      if (bundleMatch && currentAsset) {
        currentAsset.bundle = bundleMatch[1]
        continue
      }
      const pathMatch = line.match(/^  path in bundle: (.+)$/)
      if (pathMatch && currentAsset) {
        currentAsset.path = normalizePath(pathMatch[1])
        currentAsset.category = classifyAsset(currentAsset.path)
      }
    }
  }

  if (currentAsset) assets.push(currentAsset)
  return { assets, dependencies: Object.fromEntries(dependencies) }
}

const sha256 = (filePath) => {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

const paths = getValheimPaths()
const manifests = paths.manifestPaths.map((manifestPath) => ({
  manifestPath,
  parsed: parseManifest(fs.readFileSync(manifestPath, 'utf8')),
}))
const assetsById = new Map()
const dependencies = new Map()

for (const { manifestPath, parsed } of manifests) {
  const sourceManifest = path.basename(manifestPath)
  for (const asset of parsed.assets) {
    const existing = assetsById.get(asset.assetId)
    if (existing && (existing.bundle !== asset.bundle || existing.path !== asset.path)) {
      throw new Error(`Conflicting asset definition for ${asset.assetId}`)
    }
    assetsById.set(asset.assetId, {
      ...asset,
      sourceManifests: [...new Set([...(existing?.sourceManifests ?? []), sourceManifest])],
    })
  }
  for (const [bundle, bundleDependencies] of Object.entries(parsed.dependencies)) {
    dependencies.set(bundle, [
      ...new Set([...(dependencies.get(bundle) ?? []), ...bundleDependencies]),
    ])
  }
}

const parsed = {
  assets: [...assetsById.values()],
  dependencies: Object.fromEntries(dependencies),
}
const outputDirectory = path.join(projectRoot, 'data', 'generated')
fs.mkdirSync(outputDirectory, { recursive: true })

const categoryCounts = Object.create(null)
const extensionCounts = Object.create(null)
const bundleCounts = Object.create(null)

for (const asset of parsed.assets) {
  const extension = path.extname(asset.path).toLowerCase() || '(none)'
  categoryCounts[asset.category] = (categoryCounts[asset.category] ?? 0) + 1
  extensionCounts[extension] = (extensionCounts[extension] ?? 0) + 1
  bundleCounts[asset.bundle] = (bundleCounts[asset.bundle] ?? 0) + 1
}

const index = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    installDirectory: paths.installDirectory,
    manifests: paths.manifestPaths.map((manifestPath) => ({
      path: manifestPath,
      modifiedAt: fs.statSync(manifestPath).mtime.toISOString(),
      sha256: sha256(manifestPath),
    })),
    assemblySha256: sha256(paths.assemblyPath),
  },
  totals: {
    assets: parsed.assets.length,
    dependencyBundles: Object.keys(parsed.dependencies).length,
    referencedBundles: Object.keys(bundleCounts).length,
  },
  categoryCounts,
  extensionCounts,
  bundleCounts,
  dependencies: parsed.dependencies,
  assets: parsed.assets,
}

fs.writeFileSync(
  path.join(outputDirectory, 'asset-index.json'),
  `${JSON.stringify(index, null, 2)}\n`,
)
fs.writeFileSync(
  path.join(outputDirectory, 'asset-summary.json'),
  `${JSON.stringify({
    schemaVersion: index.schemaVersion,
    generatedAt: index.generatedAt,
    source: index.source,
    totals: index.totals,
    categoryCounts,
    extensionCounts,
    bundleCounts,
  }, null, 2)}\n`,
)

console.log(`Indexed ${parsed.assets.length} assets across ${Object.keys(bundleCounts).length} bundles.`)
console.log(JSON.stringify(categoryCounts, null, 2))
