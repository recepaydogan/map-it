// Build a 256px tile pyramid for each large map image so the Leaflet view streams
// only the visible tiles instead of decoding one 36-megapixel <img> (er-overworld
// is 6016² → ~145 MB decoded; under Overwolf memory pressure Chromium re-decodes it
// mid-pan, which is the "kasma/donma" the user hit at 100% zoom).
//
// The tiles are laid out to match Leaflet's CRS.Simple projection EXACTLY, so the
// existing marker placement (latLng = [height - y, x] in CRS units) keeps pointing
// at the same map pixels — calibration is untouched.
//
// CRS.Simple maps a marker at image pixel (x, y) (y down from the top) to
//   project(z) = ( 2^z · x , 2^z · (y - h) )            // transformation (1,0,-1,0)
// A tile (z, tx, ty) covers projected px [tx·256,(tx+1)·256) × [ty·256,(ty+1)·256).
// Scaling the whole image by s = 2^z (z ≤ 0) to (sw, sh) and reading top-down pixels
// (sx, sy), projected X = sx and projected Y = sy - sh. So in the scaled image the
// tile grid is anchored at the BOTTOM edge (Y=0 ↔ sy=sh): pad the top/right up to a
// 256 multiple, slice a plain top-left grid, and the Leaflet row index is
//   ty = row - nRows          (negative; row 0 = top strip, row nRows-1 = bottom)
// Output: public/maps/tiles/<name>/<z>/<x>/<ty>.webp   (default {z}/{x}/{y} template)

import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TILE = 256;

// Mirrors the descriptors in src/data/maps.ts. Keep in sync if a map is re-stitched.
const MAPS = [
  { name: "er-overworld", src: "map-sources/er-overworld.webp" },
  { name: "er-underground", src: "map-sources/er-underground.webp" },
  { name: "er-dlc", src: "map-sources/er-dlc.webp" },
  { name: "nr-limveld", src: "map-sources/nr-limveld.png" },
  { name: "nr-noklateo", src: "map-sources/nr-noklateo.png" },
  { name: "nr-crater", src: "map-sources/nr-crater.png" },
  { name: "nr-mountaintop", src: "map-sources/nr-mountaintop.png" },
  { name: "nr-rotted-woods", src: "map-sources/nr-rotted-woods.png" },
];

/** Coarsest (most zoomed-out) native level: the level where the whole image first
 * fits in a single 256px tile. Shared with the renderer (tileZoomRange in maps.ts). */
const minNativeZoom = (w, h) =>
  Math.floor(Math.log2(TILE / Math.max(w, h)));

async function buildMap({ name, src }) {
  const srcPath = join(ROOT, src);
  const meta = await sharp(srcPath).metadata();
  const w = meta.width;
  const h = meta.height;
  const outRoot = join(ROOT, "public/maps/tiles", name);
  await rm(outRoot, { recursive: true, force: true });

  const zmin = minNativeZoom(w, h);
  let total = 0;
  for (let z = 0; z >= zmin; z--) {
    const scale = Math.pow(2, z);
    const sw = Math.max(1, Math.round(w * scale));
    const sh = Math.max(1, Math.round(h * scale));
    const nCols = Math.ceil(sw / TILE);
    const nRows = Math.ceil(sh / TILE);
    const padRight = nCols * TILE - sw;
    const padTop = nRows * TILE - sh;

    // Scale once, pad the top/right to a clean 256 grid, decode to raw so each tile
    // extract is a cheap memcpy instead of re-decoding a compressed buffer.
    const { data, info } = await sharp(srcPath)
      .resize(sw, sh, { fit: "fill" })
      .extend({
        top: padTop,
        right: padRight,
        bottom: 0,
        left: 0,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const raw = { width: info.width, height: info.height, channels: info.channels };
    for (let col = 0; col < nCols; col++) {
      await mkdir(join(outRoot, String(z), String(col)), { recursive: true });
      for (let row = 0; row < nRows; row++) {
        const ty = row - nRows; // Leaflet y index (negative, bottom-anchored)
        await sharp(data, { raw })
          .extract({ left: col * TILE, top: row * TILE, width: TILE, height: TILE })
          .webp({ quality: 82 })
          .toFile(join(outRoot, String(z), String(col), `${ty}.webp`));
        total++;
      }
    }
    process.stdout.write(`  ${name}  z=${z}  ${nCols}×${nRows}\n`);
  }
  console.log(`✓ ${name}: ${w}×${h} → ${total} tiles (z 0..${zmin})`);
}

for (const m of MAPS) {
  try {
    await buildMap(m);
  } catch (err) {
    console.error(`✗ ${m.name}: ${err.message}`);
  }
}
