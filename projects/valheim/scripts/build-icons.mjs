import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const publicDirectory = path.join(root, 'public')
const source = path.join(publicDirectory, 'icon-source.png')

const buildPng = async (filename, grayscale = false) => {
  let pipeline = sharp(source).resize(256, 256)
  if (grayscale) pipeline = pipeline.grayscale()
  await pipeline.png({ palette: true, colours: 128, compressionLevel: 9 }).toFile(path.join(publicDirectory, filename))
}

const buildIco = async (filename, sizes) => {
  const images = await Promise.all(
    sizes.map(async (size) => ({
      size,
      data: await sharp(source).resize(size, size).png({ compressionLevel: 9 }).toBuffer(),
    })),
  )
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const directory = Buffer.alloc(images.length * 16)
  let dataOffset = 6 + directory.length
  images.forEach(({ size, data }, index) => {
    const offset = index * 16
    directory.writeUInt8(size === 256 ? 0 : size, offset)
    directory.writeUInt8(size === 256 ? 0 : size, offset + 1)
    directory.writeUInt16LE(1, offset + 4)
    directory.writeUInt16LE(32, offset + 6)
    directory.writeUInt32LE(data.length, offset + 8)
    directory.writeUInt32LE(dataOffset, offset + 12)
    dataOffset += data.length
  })
  fs.writeFileSync(path.join(publicDirectory, filename), Buffer.concat([header, directory, ...images.map(({ data }) => data)]))
}

await buildPng('icon.png')
await buildPng('icon_gray.png', true)
await buildIco('launcher_icon.ico', [16, 32, 48, 256])
await buildIco('tray_icon.ico', [16, 32])
console.log('Overwolf icons generated in public/.')
