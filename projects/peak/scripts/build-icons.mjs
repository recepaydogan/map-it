import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

// Overwolf store limits: icon / icon_gray <= 30 KB, launcher_icon (.ico) <= 150 KB.
const DOCK_ICON_LIMIT_KB = 30;
const LAUNCHER_ICON_LIMIT_KB = 150;
// Windows shell sizes packed into the .ico (taskbar, tray, shortcut, jumbo).
const LAUNCHER_ICON_SIZES = [16, 32, 48, 256];
// Overwolf store listing assets — dimensions are fixed by the developers console
// (dev.overwolf.com/ow-native/developers-console/grow/store-listing).
// The icon is mandatory PNG, the tile mandatory JPG at 72 PPI, the hero an
// optional PNG (each also accepts WebP).
const STORE_ICON_SIZE = 55;
const STORE_TILE = { width: 258, height: 198 };
const STORE_HERO = { width: 1920, height: 560 };
// The art carries a paper texture whose noise triples the PNG size; a 128-colour
// palette is visually indistinguishable and keeps icon.png well under 30 KB.
const PNG_PALETTE_COLOURS = 128;

// The master art is a square dark tile with the mountain bleeding to the left
// edge. Crop to the drawn artwork, then re-lay it out with room to breathe so
// the rounded corners never bite into the peaks.
const ARTWORK_CROP = { left: 0, top: 63, width: 1227, height: 1099 };
const ARTWORK_INSET = 0.78; // artwork occupies 78% of the tile
const CORNER_RADIUS = 0.22; // rounded-square mask, as a fraction of the size
const BACKGROUND = { r: 0x11, g: 0x10, b: 0x0c, alpha: 1 };

// The hero master is 1774x887 (2.000) but its artwork only occupies the top
// band, rows 62-454, with dead ground below. Crop the full width down to the
// hero's 3.429 aspect centred on that band: 1774/3.429 = 517 rows, which leaves
// the title and the island equally inset top and bottom. Nothing is lost — the
// crop only discards empty paper.
const HERO_CROP = { left: 0, top: 0, width: 1774, height: 517 };

const source = resolve("assets/icon-source.png");
const tileSource = resolve("assets/store-tile-source.png");
const heroSource = resolve("assets/store-hero-source.png");

const report = (label, path, limitKb) => {
  const sizeKb = statSync(path).size / 1024;
  console.log(`${label}: ${sizeKb.toFixed(1)} KB (limit: ${limitKb} KB)`);
  if (sizeKb > limitKb) {
    console.error(`${label} exceeds the Overwolf limit of ${limitKb} KB.`);
    process.exitCode = 1;
  }
};

const artwork = sharp(source).extract(ARTWORK_CROP);

/**
 * Renders the icon at `size`: artwork centred on the dark tile, corners
 * rounded off with an SVG mask so the PNG carries real transparency.
 */
const renderIcon = async (size) => {
  const inner = Math.round(size * ARTWORK_INSET);
  const foreground = await artwork
    .clone()
    .resize(inner, inner, { fit: "inside", kernel: "lanczos3" })
    .png()
    .toBuffer();
  const radius = (size * CORNER_RADIUS).toFixed(2);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );

  return sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([
      { input: foreground, gravity: "centre" },
      { input: mask, blend: "dest-in" },
    ])
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();
};

/** Palette-encodes a finished icon so it clears the Overwolf size limit. */
const quantize = (data) =>
  sharp(data)
    .png({ palette: true, colours: PNG_PALETTE_COLOURS, compressionLevel: 9, effort: 10 })
    .toBuffer();

/**
 * PNG-in-ICO container (Windows Vista+). Overwolf needs a real .ico for
 * `meta.launcher_icon` and `meta.tray_icon`; without it the desktop shortcut
 * falls back to a generic icon and the tray icon never renders at all.
 */
const packIco = (images) => {
  const HEADER_SIZE = 6;
  const ENTRY_SIZE = 16;

  const header = Buffer.alloc(HEADER_SIZE);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(ENTRY_SIZE * images.length);
  let dataOffset = HEADER_SIZE + directory.length;

  images.forEach(({ size, data }, index) => {
    const offset = index * ENTRY_SIZE;
    // 256 is encoded as 0 — the width/height fields are a single byte each.
    directory.writeUInt8(size === 256 ? 0 : size, offset);
    directory.writeUInt8(size === 256 ? 0 : size, offset + 1);
    directory.writeUInt8(0, offset + 2); // palette colours
    directory.writeUInt8(0, offset + 3); // reserved
    directory.writeUInt16LE(1, offset + 4); // colour planes
    directory.writeUInt16LE(32, offset + 6); // bits per pixel
    directory.writeUInt32LE(data.length, offset + 8);
    directory.writeUInt32LE(dataOffset, offset + 12);
    dataOffset += data.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.data)]);
};

// public/ is the source of truth (Vite copies it into dist/); dist/ is written
// too so an already-built tree picks the icon up without a full rebuild.
const emit = (name, data) => {
  writeFileSync(`public/${name}`, data);
  if (existsSync("dist")) writeFileSync(`dist/${name}`, data);
};

// store/ holds the developers-console upload set. It deliberately sits outside
// public/ so the listing art never ends up inside the packaged .opk.
const emitStore = (name, data) => {
  mkdirSync("store", { recursive: true });
  writeFileSync(`store/${name}`, data);
};

const icon = await renderIcon(256);
emit("icon.png", await quantize(icon));

emit("icon-gray.png", await quantize(await sharp(icon).grayscale().png().toBuffer()));

// Listing icon — resized from the finished 256px icon so the corner radius and
// artwork inset stay identical to the dock icon.
emitStore(
  `icon-${STORE_ICON_SIZE}.png`,
  await quantize(
    await sharp(icon)
      .resize(STORE_ICON_SIZE, STORE_ICON_SIZE, { kernel: "lanczos3" })
      .png()
      .toBuffer(),
  ),
);

// Listing tile. The master is 1455x1081 (1.346) against the tile's 1.303, so
// `cover` shaves ~23px off each side — dark margin either side of the artwork —
// rather than distorting it.
emitStore(
  "tile.jpg",
  await sharp(tileSource)
    .resize(STORE_TILE.width, STORE_TILE.height, { fit: "cover", kernel: "lanczos3" })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true })
    .withMetadata({ density: 72 })
    .toBuffer(),
);

// Hero banner. Upscaling the 1774px-wide crop to 1920 is a 1.08x stretch the
// paper texture absorbs without visible softening.
emitStore(
  "hero.png",
  await sharp(heroSource)
    .extract(HERO_CROP)
    .resize(STORE_HERO.width, STORE_HERO.height, { fit: "cover", kernel: "lanczos3" })
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer(),
);

const icoImages = await Promise.all(
  LAUNCHER_ICON_SIZES.map(async (size) => ({ size, data: await renderIcon(size) })),
);
emit("launcher-icon.ico", packIco(icoImages));

report("icon.png", "public/icon.png", DOCK_ICON_LIMIT_KB);
report("icon-gray.png", "public/icon-gray.png", DOCK_ICON_LIMIT_KB);
report("launcher-icon.ico", "public/launcher-icon.ico", LAUNCHER_ICON_LIMIT_KB);

console.log("Generated Overwolf dock, tray, and launcher icons in public/.");
console.log(`Generated store listing assets in store/: icon-${STORE_ICON_SIZE}.png, tile.jpg, hero.png.`);
