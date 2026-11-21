import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

// Overwolf store listing screenshots — the developers console accepts only
// 1200x675 JPG or WebP, 100 KB each, 1 to 5 images
// (dev.overwolf.com/ow-native/developers-console/grow/store-listing).
const FRAME = { width: 1200, height: 675 };
const SIZE_LIMIT_BYTES = 100_000; // "100Kb max" — stay under the stricter reading
const MAX_SCREENSHOTS = 5;

// The app captures are 1300x841 (~3:2), taller than the 16:9 listing frame, so
// they are fitted by height and presented as a framed window on a dark ground
// instead of losing the nav bar or the map's zoom controls to a crop. Colours
// follow src/index.css: --color-background #111315, --color-border, --radius-md.
const WINDOW_MARGIN = { x: 40, y: 22 };
const WINDOW_RADIUS = 12;
const WINDOW_BORDER = "rgba(226, 230, 225, 0.16)";
const SHADOW = { offsetY: 14, sigma: 16, opacity: 0.6 };
const GROUND = { centre: "#1c2024", edge: "#0b0d0f" };

// Upload order: the map is the headline feature, so it leads.
const SCREENSHOTS = [
  { source: "map.png", output: "01-map" },
  { source: "journal.png", output: "02-journal" },
  { source: "items.png", output: "03-items" },
  { source: "settings.png", output: "04-settings" },
  { source: "auth.png", output: "05-sign-in" },
];

const sourceDirectory = resolve("assets/screenshots");
const outputDirectory = resolve("store/screenshots");

if (SCREENSHOTS.length > MAX_SCREENSHOTS) {
  throw new Error(`The store accepts at most ${MAX_SCREENSHOTS} screenshots.`);
}

const svg = (markup) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME.width}" height="${FRAME.height}">${markup}</svg>`,
  );

const ground = svg(
  `<defs><radialGradient id="g" cx="50%" cy="42%" r="75%">` +
    `<stop offset="0" stop-color="${GROUND.centre}"/><stop offset="1" stop-color="${GROUND.edge}"/>` +
    `</radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>`,
);

/** Fits the capture inside the frame margins, preserving its aspect ratio. */
const fitWindow = ({ width, height }) => {
  const maxWidth = FRAME.width - WINDOW_MARGIN.x * 2;
  const maxHeight = FRAME.height - WINDOW_MARGIN.y * 2;
  const scale = Math.min(maxWidth / width, maxHeight / height);
  const size = { width: Math.round(width * scale), height: Math.round(height * scale) };
  return {
    ...size,
    left: Math.round((FRAME.width - size.width) / 2),
    top: Math.round((FRAME.height - size.height) / 2),
  };
};

const roundedRect = (box, extra = "") =>
  `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" ` +
  `rx="${WINDOW_RADIUS}" ry="${WINDOW_RADIUS}" ${extra}/>`;

/** Soft drop shadow: a blurred black window silhouette on a transparent frame. */
const renderShadow = (box) =>
  sharp({
    create: { width: FRAME.width, height: FRAME.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: svg(roundedRect({ ...box, top: box.top + SHADOW.offsetY }, `fill="rgba(0,0,0,${SHADOW.opacity})"`)),
      },
    ])
    .blur(SHADOW.sigma)
    .png()
    .toBuffer();

/** The capture itself, downscaled and clipped to the rounded window. */
const renderWindow = async (source, box) => {
  const scaled = await sharp(source)
    .resize(box.width, box.height, { kernel: "lanczos3" })
    .flatten({ background: GROUND.edge })
    .png()
    .toBuffer();
  const clip = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}">` +
      `<rect width="${box.width}" height="${box.height}" rx="${WINDOW_RADIUS}" ry="${WINDOW_RADIUS}" fill="#fff"/></svg>`,
  );
  return sharp(scaled).composite([{ input: clip, blend: "dest-in" }]).png().toBuffer();
};

const compose = async (source) => {
  const box = fitWindow(await sharp(source).metadata());
  const [shadow, window] = await Promise.all([renderShadow(box), renderWindow(source, box)]);
  const border = svg(roundedRect(box, `fill="none" stroke="${WINDOW_BORDER}" stroke-width="1"`));

  return sharp(ground)
    .composite([{ input: shadow }, { input: window, left: box.left, top: box.top }, { input: border }])
    .png()
    .toBuffer();
};

/**
 * Encodes at the highest JPEG quality that clears the size limit. The 4:4:4
 * chroma keeps the app's coloured icons and rarity dots crisp; quality is
 * walked down in steps of 2 only as far as each capture needs.
 */
const encode = async (frame, name) => {
  for (let quality = 92; quality >= 60; quality -= 2) {
    const data = await sharp(frame)
      .jpeg({ quality, chromaSubsampling: "4:4:4", mozjpeg: true })
      .withMetadata({ density: 72 })
      .toBuffer();
    if (data.length <= SIZE_LIMIT_BYTES) return { data, quality };
  }
  throw new Error(`${name}: could not fit under ${SIZE_LIMIT_BYTES} bytes at an acceptable quality.`);
};

mkdirSync(outputDirectory, { recursive: true });

for (const { source, output } of SCREENSHOTS) {
  const frame = await compose(resolve(sourceDirectory, source));
  const { data, quality } = await encode(frame, output);
  const path = resolve(outputDirectory, `${output}.jpg`);
  writeFileSync(path, data);
  console.log(
    `${output}.jpg: ${FRAME.width}x${FRAME.height}, ${(data.length / 1024).toFixed(1)} KB (quality ${quality}, limit ${SIZE_LIMIT_BYTES / 1000} KB)`,
  );
}

console.log(`Generated ${SCREENSHOTS.length} store listing screenshots in store/screenshots/.`);
