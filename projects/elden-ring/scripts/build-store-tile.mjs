#!/usr/bin/env node
/**
 * Builds the Overwolf store tile (258×198, mandatory asset) from the master art
 * in brand/tile-master.png.
 *
 * The master is generated LANDSCAPE 3:2 (1536×1024) on purpose: 258:198 is
 * 1.303, so a 1.5 source only needs its sides trimmed (101 px each) and nothing
 * vertical is ever lost. That is why the prompt asks for the ornate frame to sit
 * ~9% in from the left/right edges with only empty stone texture outside it —
 * the crop eats that dead space and the frame survives intact.
 *
 * The earlier square master (brand/tile-master-square.png) forced a vertical cut
 * instead, which always cost either the sigil crown or the wordmark baseline.
 * Don't go back to a square source.
 *
 * Deliberately NOT in the art: feature strips, taglines, any small text — at
 * 258 px wide it all turns to mush. One big wordmark only.
 */
import sharp from 'sharp';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Usage: node scripts/build-store-tile.mjs [masterPath] [outBaseName]
// e.g. ... brand/new-tile-3.png store-tile-alt-258x198   → to preview a candidate
//      without touching the shipped brand/store-tile-258x198.*
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [masterArg, outArg] = process.argv.slice(2);
const SRC = path.resolve(root, masterArg ?? path.join('brand', 'tile-master.png'));
const OUT_BASE = path.join(root, 'brand', outArg ?? 'store-tile-258x198');

const TILE_W = 258;
const TILE_H = 198;

// Guard the one failure mode that matters: a master too narrow for 258:198 gets
// cut vertically, which is what costs the sigil crown / wordmark baseline. A
// hair of rounding is fine — refuse only a cut deep enough to eat artwork.
const { width, height } = await sharp(SRC).metadata();
const heightLoss = height - width / (TILE_W / TILE_H);
if (heightLoss > height * 0.01) {
  throw new Error(`master is ${width}×${height} (ratio ${(width / height).toFixed(3)}); cropping it to ` +
    `${(TILE_W / TILE_H).toFixed(3)} would cut ${Math.round(heightLoss)} px of height. ` +
    `Regenerate the art landscape — see the header of this file.`);
}

// The master shrinks ~5.5×, which softens the serifs and the cracked-gold
// texture — the tile reads blurry without a post-downscale unsharp pass.
// m1: 0 keeps flat areas (the dark stone) untouched so the background does not
// turn grainy; only edges get the boost. sigma 1.2+ was visibly harsh: halos
// around the glyphs and crunchy gold.
const render = () => sharp(SRC)
  .resize(TILE_W, TILE_H, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
  .sharpen({ sigma: 0.9, m1: 0, m2: 2.5 });

// WebP — sharpest at this size, the primary upload
await render().webp({ quality: 95 }).toFile(`${OUT_BASE}.webp`);

// JPG at 72 ppi — 4:4:4 chroma, because the default 4:2:0 visibly blurs gold-on-black edges
await render()
  .withMetadata({ density: 72 })
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toFile(`${OUT_BASE}.jpg`);

const scale = Math.max(TILE_W / width, TILE_H / height);
const trimX = Math.round((width - TILE_W / scale) / 2);
const trimY = Math.round((height - TILE_H / scale) / 2);
console.log(`master ${width}×${height} → trimmed ${trimX} px per side, ${trimY} px top and bottom`);
for (const ext of ['webp', 'jpg']) {
  const f = `${OUT_BASE}.${ext}`;
  console.log(`${path.relative(root, f)}  ${TILE_W}×${TILE_H}  ${((await stat(f)).size / 1024).toFixed(1)} KB`);
}
