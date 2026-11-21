import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');

// Overwolf store limits: icon / icon_gray <= 30 KB, launcher_icon (.ico) <= 150 KB.
// This script regenerates the compliant variants into dist/ at build time.

async function compressGrayIcon() {
  const input = path.join(PUBLIC, 'icon_gray.png');
  const output = path.join(DIST, 'icon_gray.png');

  await sharp(input)
    .resize(256, 256)
    .grayscale()
    .png({ quality: 80, compressionLevel: 9, effort: 10 })
    .toFile(output);

  const stats = fs.statSync(output);
  console.log(`icon_gray.png: ${(stats.size / 1024).toFixed(1)} KB (limit: 30 KB)`);

  if (stats.size > 30 * 1024) {
    console.log('Still over 30KB, applying palette reduction...');
    const tempOutput = path.join(DIST, 'icon_gray_tmp.png');
    await sharp(output)
      .resize(256, 256)
      .grayscale()
      .png({ quality: 60, compressionLevel: 9, effort: 10, palette: true, colours: 128 })
      .toFile(tempOutput);
    fs.renameSync(tempOutput, output);
    const stats2 = fs.statSync(output);
    console.log(`icon_gray.png (palette): ${(stats2.size / 1024).toFixed(1)} KB`);
  }

  console.log('icon_gray.png compressed successfully.');
}

async function createLauncherIco() {
  const input = path.join(PUBLIC, 'icon.png');
  const sizes = [16, 32, 48, 256];

  const pngBuffers = [];
  for (const size of sizes) {
    const buf = await sharp(input)
      .resize(size, size, { kernel: 'lanczos3' })
      .png({ compressionLevel: 9, effort: 10, palette: true, colours: size <= 48 ? 64 : 192 })
      .toBuffer();
    pngBuffers.push({ size, data: buf });
  }

  // Build a PNG-in-ICO file manually (supported by Windows Vista+).
  const headerSize = 6;
  const dirEntrySize = 16;
  const numImages = pngBuffers.length;
  const dirSize = dirEntrySize * numImages;
  let dataOffset = headerSize + dirSize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(numImages, 4);

  const dirEntries = Buffer.alloc(dirSize);
  for (let i = 0; i < numImages; i++) {
    const { size, data } = pngBuffers[i];
    const offset = i * dirEntrySize;
    dirEntries.writeUInt8(size === 256 ? 0 : size, offset);
    dirEntries.writeUInt8(size === 256 ? 0 : size, offset + 1);
    dirEntries.writeUInt8(0, offset + 2);
    dirEntries.writeUInt8(0, offset + 3);
    dirEntries.writeUInt16LE(1, offset + 4);
    dirEntries.writeUInt16LE(32, offset + 6);
    dirEntries.writeUInt32LE(data.length, offset + 8);
    dirEntries.writeUInt32LE(dataOffset, offset + 12);
    dataOffset += data.length;
  }

  const icoBuffer = Buffer.concat([header, dirEntries, ...pngBuffers.map((b) => b.data)]);

  // Write to BOTH public/ and dist/:
  //  - public/ is the committed source of truth. The manifest points
  //    meta.launcher_icon AND meta.tray_icon at "launcher_icon.ico"; if that file
  //    is missing Overwolf can't render the tray icon at all (the app never shows
  //    up in the system tray). Having it in public/ means dev runs, `vite build`
  //    and unpacked loads all get it (Vite copies public/* into dist/).
  //  - dist/ is the immediate release copy so the OPK build/verify passes even on
  //    a fresh tree where public/ was cleaned. Same bytes → no git churn.
  const outputs = [path.join(PUBLIC, 'launcher_icon.ico'), path.join(DIST, 'launcher_icon.ico')];
  for (const output of outputs) {
    fs.writeFileSync(output, icoBuffer);
  }

  const stats = fs.statSync(outputs[1]);
  console.log(`launcher_icon.ico: ${(stats.size / 1024).toFixed(1)} KB (limit: 150 KB) → public/ + dist/`);
  console.log('launcher_icon.ico created successfully.');
}

async function main() {
  console.log('--- Building icons for Overwolf release ---\n');
  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
  await compressGrayIcon();
  console.log('');
  await createLauncherIco();
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Icon build failed:', err);
  process.exit(1);
});
