import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

// Overwolf store-listing app icon: 55x55 PNG/WebP (uploaded in the dev console).
// Built straight from the 1254² master so the downscale keeps as much of the
// engraved-gold detail as possible — going via public/icon.png (256²) would
// resample twice.
//
// Transparency matches public/icon.png: the black *around* the sigil is keyed
// out, but the dark stone enclosed by the "A" stays opaque. A global luminance
// key can't do that, so we flood-fill the background in from the borders.

const ROOT = path.resolve(import.meta.dirname, '..');
const MASTER = path.join(ROOT, 'brand', 'icon-master.png');
const OUT_DIR = path.join(ROOT, 'brand');
const SIZE = 55;
const BG_MAX = 24; // max(r,g,b) below this counts as background stone

async function keyedMaster() {
  const { data, info } = await sharp(MASTER)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h, channels: ch } = info;
  const bg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const isDark = (p) => {
    const i = p * ch;
    return Math.max(data[i], data[i + 1], data[i + 2]) <= BG_MAX;
  };
  const push = (p) => {
    if (bg[p] || !isDark(p)) return;
    bg[p] = 1;
    queue[tail++] = p;
  };

  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }

  let cleared = 0;
  for (let p = 0; p < w * h; p++) {
    if (!bg[p]) continue;
    data[p * ch + 3] = 0;
    cleared++;
  }
  console.log(
    `keyed background: ${((cleared / (w * h)) * 100).toFixed(1)}% of ${w}×${h} master → alpha 0`,
  );

  return sharp(data, { raw: { width: w, height: h, channels: ch } });
}

async function main() {
  console.log('--- Building 55×55 store-listing icon ---\n');

  const base = await keyedMaster();
  // ~23x downscale mushes the engraved edges; the same gentle edge-only sharpen
  // the store tile uses (m1: 0 leaves flat areas alone) brings the gold back.
  const { data: small, info } = await base
    .resize(SIZE, SIZE, { kernel: 'lanczos3' })
    .sharpen({ sigma: 0.7, m1: 0, m2: 2.2 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };

  const outputs = [
    ['icon-store-55.png', sharp(small, raw).png({ compressionLevel: 9, effort: 10 })],
    ['icon-store-55.webp', sharp(small, raw).webp({ quality: 95, alphaQuality: 100 })],
  ];

  for (const [name, pipeline] of outputs) {
    const out = path.join(OUT_DIR, name);
    await pipeline.toFile(out);
    const { size } = fs.statSync(out);
    console.log(`${name}: ${(size / 1024).toFixed(1)} KB`);
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Store icon build failed:', err);
  process.exit(1);
});
