import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

// Overwolf store-listing screenshots: 1200×675 (16:9), JPG or WebP, ≤100 KB each.
//
// The raw captures are ~16:10, so every one needs a 16:9 crop first — squashing
// to fit would skew the map art and the UI text. Crops are hand-picked per shot
// (see `crop` notes) rather than a blanket centre-crop, because the shots differ:
// the in-game one is a small window on a mostly-empty game frame, the Nightlords
// one has a lot of dead space bottom-right, the rest are edge-to-edge UI.
//
// WebP quality is searched downwards per image until it fits the 100 KB cap —
// the pin-dense map shot needs a lower quality than the flat dark panels do.

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(ROOT, 'brand', 'erstoreassets');
const OUT_DIR = path.join(SRC_DIR, 'store');
const OUT_W = 1200;
const OUT_H = 675;
const MAX_BYTES = 100 * 1024;

// left/top/width/height in source pixels; width:height is held at 16:9 so the
// resize to 1200×675 is a pure downscale.
const SHOTS = [
  {
    src: 'map.png',
    out: '1-map.webp',
    // 1917×1154 — full-bleed UI. Trim the bottom strip only, which also drops
    // the "use filters to keep the map smooth" toast.
    crop: { left: 0, top: 0, width: 1916, height: 1078 },
    sharpen: false,
  },
  {
    src: 'in-game.png',
    out: '2-in-game.webp',
    // 1920×1200 — the overlay window sits small in a dark game frame. Pull in
    // to the Ctrl+Tab banner (top) and the window's bottom edge, keeping a
    // margin of game background on both sides so it still reads as in-game.
    // Height 960 leaves the banner and the window's bottom edge with matching
    // 18px gutters; the banner is only 18px off the top of the capture, so
    // that's the most breathing room available.
    crop: { left: 116, top: 0, width: 1707, height: 960 },
  },
  {
    src: 'night-lords.png',
    out: '3-nightlords.webp',
    // 1918×1150 — boss panel only fills the upper-left. Crop into it so the
    // stats aren't lost in dead space; 1600 lands in empty title-bar gap
    // between the account icon and the Discord/window buttons.
    crop: { left: 0, top: 0, width: 1600, height: 900 },
  },
  {
    src: 'night-farers.png',
    out: '4-nightfarers.webp',
    // 1911×1152 — content runs edge to edge. Top-anchored so the tab bar and
    // stat bars survive; the last passive card falls below the fold.
    crop: { left: 0, top: 0, width: 1911, height: 1075 },
  },
  {
    src: 'relics.png',
    out: '5-relics.webp',
    // 1918×1155 — same deal as Nightfarers.
    crop: { left: 0, top: 0, width: 1918, height: 1079 },
  },
];

async function encode(pipeline, quality) {
  return pipeline.clone().webp({ quality, effort: 6 }).toBuffer();
}

async function build(shot) {
  const src = path.join(SRC_DIR, shot.src);
  const meta = await sharp(src).metadata();
  const { left, top, width, height } = shot.crop;

  if (left + width > meta.width || top + height > meta.height) {
    throw new Error(`${shot.src}: crop ${width}×${height}@${left},${top} exceeds ${meta.width}×${meta.height}`);
  }
  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) > 0.005) {
    throw new Error(`${shot.src}: crop is ${ratio.toFixed(4)}, not 16:9`);
  }

  // ~1.6× downscale softens the small UI text; the same edge-only sharpen the
  // store icon uses (m1: 0) brings it back without haloing the flat panels.
  // The map shot is the exception — sharpening its ~1,800 pin outlines costs
  // more bytes than the legibility is worth against a 100 KB cap.
  let resized = sharp(src)
    .extract({ left, top, width, height })
    .resize(OUT_W, OUT_H, { kernel: 'lanczos3' });
  if (shot.sharpen !== false) resized = resized.sharpen({ sigma: 0.6, m1: 0, m2: 1.8 });

  let chosen = null;
  for (const quality of [92, 88, 84, 80, 76, 72, 68, 64, 60, 55, 50, 45, 40, 35, 30]) {
    const buf = await encode(resized, quality);
    if (buf.length <= MAX_BYTES) {
      chosen = { quality, buf };
      break;
    }
  }
  if (!chosen) throw new Error(`${shot.src}: cannot fit ${MAX_BYTES} bytes even at q30`);

  const out = path.join(OUT_DIR, shot.out);
  fs.writeFileSync(out, chosen.buf);
  const check = await sharp(out).metadata();
  console.log(
    `${shot.out.padEnd(20)} ${check.width}×${check.height}  q${chosen.quality}  ` +
      `${(chosen.buf.length / 1024).toFixed(1)} KB  ← ${shot.src} ${meta.width}×${meta.height}`,
  );
}

async function main() {
  console.log('--- Building 1200×675 store screenshots ---\n');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const shot of SHOTS) await build(shot);
  console.log(`\nDone → ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((err) => {
  console.error('Store screenshot build failed:', err);
  process.exit(1);
});
