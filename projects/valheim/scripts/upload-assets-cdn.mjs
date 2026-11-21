import fs from 'node:fs/promises'
import path from 'node:path'
import { PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { createR2Client, loadR2Configuration } from './r2-s3-client.mjs'
import { collectAssets, contentHash, manifestPath } from './asset-cdn-files.mjs'

const configuration = await loadR2Configuration()
const client = createR2Client(configuration)
try {
  const env = await fs.readFile('.env', 'utf8')
  const origin = process.env.ASSET_CDN_ORIGIN || env.match(/^ASSET_CDN_ORIGIN=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '')
  if (!origin || new URL(origin).protocol !== 'https:') throw new Error('ASSET_CDN_ORIGIN must be an HTTPS URL')
  const files = await collectAssets()
  if (!files.length) throw new Error('No local PNGs to upload; the published CDN release remains unchanged')
  const previous = await fs.readFile(manifestPath, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  const staged = new Set(files.map(file => file.path))
  if (previous?.files.some(file => !staged.has(file.path))) throw new Error('A complete PNG staging set is required to publish a new release; restore missing assets from the current CDN first')
  const hash = contentHash(files)
  const prefix = `valheim/assets/${hash}`
  const baseUrl = `${origin.replace(/\/$/, '')}/${prefix}`
  const remote = new Map()
  let token
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: configuration.bucket, Prefix: `${prefix}/`, ContinuationToken: token }))
    for (const object of page.Contents ?? []) remote.set(object.Key, object.ETag?.replaceAll('"', ''))
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
  let cursor = 0, uploaded = 0, skipped = 0
  await Promise.all(Array.from({ length: 20 }, async () => {
    while (cursor < files.length) {
      const file = files[cursor++]
      const key = `${prefix}/${file.path}`
      if (remote.get(key) === file.md5) { skipped++; continue }
      await client.send(new PutObjectCommand({ Bucket: configuration.bucket, Key: key,
        Body: await fs.readFile(file.file), ContentType: 'image/png', ContentLength: file.bytes,
        CacheControl: 'public, max-age=31536000, immutable', Metadata: { sha256: file.sha256 } }))
      uploaded++
      if (uploaded % 200 === 0) console.log(`Uploaded ${uploaded}/${files.length} PNGs`)
    }
  }))
  console.log('Verifying every image through the public CDN...')
  cursor = 0
  await Promise.all(Array.from({ length: 20 }, async () => {
    while (cursor < files.length) {
      const file = files[cursor++]
      let verified = false
      for (let attempt = 0; attempt < 4; attempt++) {
        const response = await fetch(`${baseUrl}/${file.path}`, { method: 'HEAD', headers: { Origin: 'https://overwolf-extension.invalid' }, signal: AbortSignal.timeout(30000) })
        if (response.ok && Number(response.headers.get('content-length')) === file.bytes
          && response.headers.get('etag')?.replaceAll('"', '') === file.md5
          && response.headers.get('access-control-allow-origin') === '*'
          && response.headers.get('cache-control')?.includes('immutable')) { verified = true; break }
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
      }
      if (!verified) throw new Error(`CDN content or CORS check failed: ${file.path}`)
    }
  }))
  const manifest = { schemaVersion: 1, baseUrl, contentHash: hash, verifiedAt: new Date().toISOString(),
    files: files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })) }
  const temporary = `${manifestPath}.tmp`
  await fs.writeFile(temporary, JSON.stringify(manifest, null, 2) + '\n')
  await fs.rename(temporary, manifestPath)
  console.log(JSON.stringify({ baseUrl, files: files.length, uploaded, skipped, verified: files.length }))
} finally { client.destroy() }
