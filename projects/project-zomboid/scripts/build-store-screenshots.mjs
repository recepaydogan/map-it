#!/usr/bin/env node
// Normalizes the raw captures in brand/PZ-ASSETS to Overwolf store listing
// screenshots. Overwolf's limits: JPG or WebP, exactly 1200x675, 100 KB max
// each, at most 5 files.
//
// Sources that are already 1920 wide and taller than 16:9 are cropped (no
// resampling). Narrower captures are upscaled with lanczos3 and centered on the
// app chrome color, so nothing in the UI is clipped.

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'brand', 'PZ-ASSETS');
const OUTPUT_DIR = path.join(SOURCE_DIR, 'store');

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 675;
// 100 KB cap, read as decimal KB with a safety margin so the uploader cannot
// reject a file over a kibibyte/kilobyte disagreement.
const MAX_BYTES = 96_000;
const MAX_SHOTS = 5;
const BACKDROP = { r: 24, g: 25, b: 19 };

/**
 * Ordered store listing. `source` matches the raw capture file name, `crop`
 * gives the vertical bias used when a capture has to lose rows to reach 16:9.
 */
const SHOTS = [
  {
    source: 'Project Zomboid 20.08.2026 11_36_14.png',
    name: '01-knox-country-atlas',
    caption: 'Full Knox Country atlas with every category layer switched on.',
  },
  {
    source: 'Project Zomboid Map 20.08.2026 12_20_49.png',
    name: '02-map-layers-and-mods',
    caption: 'Map layers, saved locations and the community map library.',
  },
  {
    source: 'Project Zomboid 20.08.2026 12_19_53.png',
    name: '03-location-loot-details',
    caption: 'Building details with likely loot, coordinates and survival notes.',
  },
  {
    source: 'Project Zomboid 19.08.2026 18_20_04.png',
    name: '04-in-game-overlay',
    caption: 'In-game overlay tracking live player position over Muldraugh.',
    // Drop the FPS row on top and the hotbar/debug strip along the bottom, then
    // cover-crop the remaining band so the scene still fills the frame.
    cropTop: 50,
    cropBottom: 90,
    fill: true,
  },
];

async function build(shot) {
  const sourcePath = path.join(SOURCE_DIR, shot.source);
  const input = sharp(sourcePath, { unlimited: true });
  const meta = await input.metadata();

  const cropTop = shot.cropTop ?? 0;
  const cropBottom = shot.cropBottom ?? 0;
  let pipeline = input;
  let width = meta.width;
  let height = meta.height;

  if (cropTop || cropBottom) {
    height = meta.height - cropTop - cropBottom;
    pipeline = pipeline.extract({ left: 0, top: cropTop, width, height });
  }

  const targetRatio = TARGET_WIDTH / TARGET_HEIGHT;
  const ratio = width / height;
  let mode;

  if (Math.abs(ratio - targetRatio) < 0.0005) {
    mode = 'exact';
    pipeline = pipeline.resize(TARGET_WIDTH, TARGET_HEIGHT, { kernel: 'lanczos3' });
  } else if (ratio < targetRatio) {
    // Taller than 16:9 and full width: crop the center band, no resampling.
    if (width === TARGET_WIDTH) {
      const band = Math.round(width / targetRatio);
      mode = `crop ${height - band}px`;
      pipeline = pipeline.extract({
        left: 0,
        top: Math.round((height - band) / 2),
        width,
        height: band,
      });
    } else {
      mode = 'pillarbox';
      pipeline = pipeline
        .resize({ height: TARGET_HEIGHT, kernel: 'lanczos3' })
        .extend({ background: BACKDROP, top: 0, bottom: 0, left: 0, right: 0 });
      pipeline = sharp(await pipeline.png().toBuffer()).resize({
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
        fit: 'contain',
        background: BACKDROP,
        kernel: 'lanczos3',
      });
    }
  } else {
    mode = shot.fill ? 'cover' : 'letterbox';
    pipeline = pipeline.resize({
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
      fit: shot.fill ? 'cover' : 'contain',
      position: 'center',
      background: BACKDROP,
      kernel: 'lanczos3',
    });
  }

  const flatBuffer = await sharp(await pipeline.png().toBuffer())
    .flatten({ background: BACKDROP })
    .png()
    .toBuffer();

  const webp = await encodeUnderLimit(flatBuffer, 'webp');
  const jpg = await encodeUnderLimit(flatBuffer, 'jpeg');

  await writeFile(path.join(OUTPUT_DIR, `${shot.name}.webp`), webp.buffer);
  await writeFile(path.join(OUTPUT_DIR, `${shot.name}.jpg`), jpg.buffer);

  return {
    ...shot,
    mode,
    source: `${meta.width}x${meta.height}`,
    webp: webp,
    jpg: jpg,
  };
}

/**
 * Binary-searches encoder quality for the largest file that still fits the
 * store's 100 KB cap. Throws if even the floor quality is too heavy, so a
 * failing asset can never be uploaded by accident.
 */
async function encodeUnderLimit(input, format) {
  const encode = (quality) =>
    format === 'webp'
      ? sharp(input).webp({ quality, effort: 6, smartSubsample: true }).toBuffer()
      : sharp(input).jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0' }).toBuffer();

  const FLOOR = 30;
  const floorBuffer = await encode(FLOOR);
  if (floorBuffer.length > MAX_BYTES) {
    throw new Error(
      `${format} cannot reach ${MAX_BYTES} bytes: ${floorBuffer.length} bytes at quality ${FLOOR}`,
    );
  }

  let low = FLOOR;
  let high = 95;
  let best = { buffer: floorBuffer, quality: FLOOR };
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const buffer = await encode(mid);
    if (buffer.length <= MAX_BYTES) {
      best = { buffer, quality: mid };
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return { ...best, bytes: best.buffer.length };
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const available = new Set(await readdir(SOURCE_DIR));
  const results = [];

  if (SHOTS.length > MAX_SHOTS) {
    throw new Error(`Overwolf accepts at most ${MAX_SHOTS} screenshots, got ${SHOTS.length}`);
  }

  for (const shot of SHOTS) {
    if (!available.has(shot.source)) {
      console.warn(`skip: missing source ${shot.source}`);
      continue;
    }
    const result = await build(shot);
    results.push(result);
    console.log(
      `${result.name}  ${result.source} -> ${TARGET_WIDTH}x${TARGET_HEIGHT} (${result.mode})` +
        `  webp ${(result.webp.bytes / 1024).toFixed(1)} KB q${result.webp.quality}` +
        `  jpg ${(result.jpg.bytes / 1024).toFixed(1)} KB q${result.jpg.quality}`,
    );
  }

  const readme = [
    '# Overwolf store screenshots',
    '',
    'Generated by `node scripts/build-store-screenshots.mjs` from the raw captures',
    'in `brand/PZ-ASSETS`.',
    '',
    'Overwolf store limits: JPG or WebP, exactly 1200x675, 100 KB max per file,',
    '5 files max. Every file below satisfies all four. Upload the WebP set — it',
    'keeps far more detail at the same byte budget; the JPGs are a fallback.',
    '',
    '| Order | WebP | JPG | Caption |',
    '| --- | --- | --- | --- |',
    ...results.map(
      (r, i) =>
        `| ${i + 1} | \`${r.name}.webp\` (${(r.webp.bytes / 1024).toFixed(1)} KB) ` +
        `| \`${r.name}.jpg\` (${(r.jpg.bytes / 1024).toFixed(1)} KB) | ${r.caption} |`,
    ),
    '',
  ].join('\n');
  await writeFile(path.join(OUTPUT_DIR, 'README.md'), readme, 'utf8');
}

await main();
