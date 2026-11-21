/**
 * Generates the bundled sample map under public/maps/sample: a procedural
 * 4096×4096 world cut into the tile pyramid the app expects, plus a
 * metadata.json with regions and locations for every marker category.
 *
 * It exists so the base app renders something meaningful out of the box and
 * so the expected data layout is documented by a working example:
 *
 *   public/maps/<map-id>/metadata.json
 *   public/maps/<map-id>/tiles/<level>/tile<x>x<y>.webp
 *
 * Level 0 tiles are full resolution (`tileSize` world units each); level N
 * tiles cover `tileSize * 2^N` world units. A real game map is produced the
 * same way from its source image — swap `renderWorld` for a sharp() of that
 * image and keep the slicing.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "maps", "sample");
const WORLD = 4096;
const TILE = 256;
const LEVELS = [0, 1, 2, 3, 4];

/** Deterministic, so re-running the script never churns the committed tiles. */
const createRandom = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const random = createRandom(20260824);
const between = (min, max) => min + random() * (max - min);
const pick = (values) => values[Math.floor(random() * values.length)];

const REGIONS = [
  { id: "northgate", name: "Northgate", x: 1040, y: 980 },
  { id: "riverside", name: "Riverside", x: 3020, y: 1120 },
  { id: "old-mill", name: "Old Mill", x: 1180, y: 2960 },
  { id: "southreach", name: "Southreach", x: 3060, y: 3080 },
];

/** One naming template per category (ids from src/features/map/map-config.ts). */
const CATEGORY_TEMPLATES = {
  medical: { label: "Clinic", names: ["Clinic", "Pharmacy", "Field Hospital"] },
  police: { label: "Police station", names: ["Police Station", "Sheriff's Office"] },
  fire: { label: "Fire station", names: ["Fire Station"] },
  fuel: { label: "Gas station", names: ["Gas Station", "Fuel Depot"] },
  vehicle: { label: "Garage", names: ["Auto Repair", "Garage", "Truck Yard"] },
  supplies: { label: "Store", names: ["General Store", "Hardware Store", "Market"] },
  food: { label: "Restaurant", names: ["Diner", "Grocery", "Bakery", "Cafe"] },
  military: { label: "Checkpoint", names: ["Checkpoint", "Armory", "Outpost"] },
  weapons: { label: "Gun shop", names: ["Gun Shop", "Hunting Supply"] },
  industrial: { label: "Warehouse", names: ["Warehouse", "Factory", "Lumber Yard"] },
  community: { label: "Town hall", names: ["Town Hall", "Library", "Church", "School"] },
  lodging: { label: "Motel", names: ["Motel", "Inn", "Campground"] },
};

const buildLocations = () => {
  const locations = [];
  for (const region of REGIONS) {
    for (const [category, template] of Object.entries(CATEGORY_TEMPLATES)) {
      const count = category === "supplies" || category === "food" ? 2 : 1;
      for (let index = 0; index < count; index += 1) {
        const name = pick(template.names);
        const angle = between(0, Math.PI * 2);
        const distance = between(90, 560);
        locations.push({
          id: `${region.id}-${category}-${index + 1}`,
          name: `${region.name} ${name}`,
          category,
          label: template.label,
          subtype: name,
          regionId: region.id,
          region: region.name,
          x: Math.round(region.x + Math.cos(angle) * distance),
          y: Math.round(region.y + Math.sin(angle) * distance * 0.8),
          description: `A ${template.label.toLowerCase()} on the ${region.name} side of the sample world.`,
        });
      }
    }
  }
  return locations;
};

/** Soft terrain from low-resolution noise scaled up, plus roads, grid and buildings. */
const renderWorld = async (locations) => {
  const noiseSize = 48;
  const noise = Buffer.alloc(noiseSize * noiseSize * 3);
  for (let index = 0; index < noiseSize * noiseSize; index += 1) {
    const moisture = random();
    const height = random();
    // Between dry grass, forest green and marsh brown — muted, so the markers read.
    const r = Math.round(58 + moisture * 26 + height * 18);
    const g = Math.round(74 + moisture * 30 + height * 10);
    const b = Math.round(46 + moisture * 12);
    noise[index * 3] = r;
    noise[index * 3 + 1] = g;
    noise[index * 3 + 2] = b;
  }
  const terrain = await sharp(noise, { raw: { width: noiseSize, height: noiseSize, channels: 3 } })
    .resize(WORLD, WORLD, { kernel: "cubic" })
    .png()
    .toBuffer();

  const roads = REGIONS.flatMap((from, index) => REGIONS.slice(index + 1).map((to) =>
    `<polyline points="${from.x},${from.y} ${(from.x + to.x) / 2 + between(-160, 160)},${(from.y + to.y) / 2 + between(-160, 160)} ${to.x},${to.y}" fill="none" stroke="rgba(214,200,170,0.55)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`,
  ));
  const water = `<path d="M 0 ${WORLD * 0.52} C ${WORLD * 0.25} ${WORLD * 0.42}, ${WORLD * 0.55} ${WORLD * 0.66}, ${WORLD} ${WORLD * 0.5} L ${WORLD} ${WORLD * 0.56} C ${WORLD * 0.55} ${WORLD * 0.72}, ${WORLD * 0.25} ${WORLD * 0.48}, 0 ${WORLD * 0.58} Z" fill="rgba(52,86,104,0.85)"/>`;
  const buildings = locations.map((location) => {
    const width = Math.round(between(28, 64));
    const height = Math.round(between(24, 56));
    return `<rect x="${location.x - width / 2}" y="${location.y - height / 2}" width="${width}" height="${height}" fill="rgba(36,32,28,0.78)" stroke="rgba(230,220,200,0.35)" stroke-width="2"/>`;
  });
  const settlements = REGIONS.map((region) =>
    `<circle cx="${region.x}" cy="${region.y}" r="620" fill="rgba(120,110,80,0.16)"/>`);
  const gridLines = [];
  for (let position = 0; position <= WORLD; position += TILE) {
    const major = position % (TILE * 4) === 0;
    const stroke = major ? "rgba(240,237,231,0.14)" : "rgba(240,237,231,0.06)";
    gridLines.push(`<line x1="${position}" y1="0" x2="${position}" y2="${WORLD}" stroke="${stroke}" stroke-width="${major ? 2 : 1}"/>`);
    gridLines.push(`<line x1="0" y1="${position}" x2="${WORLD}" y2="${position}" stroke="${stroke}" stroke-width="${major ? 2 : 1}"/>`);
  }
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WORLD}" height="${WORLD}">
    ${water}
    ${settlements.join("")}
    ${roads.join("")}
    ${gridLines.join("")}
    ${buildings.join("")}
  </svg>`);

  return sharp(terrain).composite([{ input: overlay }]).png().toBuffer();
};

const sliceTiles = async (world) => {
  let written = 0;
  for (const level of LEVELS) {
    const size = WORLD / 2 ** level;
    const columns = Math.ceil(size / TILE);
    const levelDirectory = path.join(OUT, "tiles", String(level));
    fs.rmSync(levelDirectory, { recursive: true, force: true });
    fs.mkdirSync(levelDirectory, { recursive: true });
    const { data, info } = await sharp(world)
      .resize(size, size, { kernel: "lanczos3" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < columns; row += 1) {
        await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
          .extract({ left: column * TILE, top: row * TILE, width: TILE, height: TILE })
          .webp({ quality: 78 })
          .toFile(path.join(levelDirectory, `tile${column}x${row}.webp`));
        written += 1;
      }
    }
  }
  return written;
};

const main = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const locations = buildLocations();
  const world = await renderWorld(locations);
  const tileCount = await sliceTiles(world);
  const metadata = {
    schemaVersion: 1,
    displayName: "Sample World",
    description: "A generated placeholder world showing every marker category. Replace it with your game's map (see docs/branching-guide.md).",
    generatedAt: "2026-08-24T00:00:00.000Z",
    attribution: "Procedurally generated by scripts/build-sample-map.mjs.",
    bounds: { minX: 0, minY: 0, maxX: WORLD, maxY: WORLD },
    tileSize: TILE,
    detailLevels: LEVELS,
    tilePattern: "tiles/{level}/tile{x}x{y}.webp",
    regions: REGIONS,
    locations,
  };
  fs.writeFileSync(path.join(OUT, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Sample map: ${tileCount} tiles, ${REGIONS.length} regions, ${locations.length} locations → ${path.relative(ROOT, OUT)}`);
};

main().catch((error) => {
  console.error("Sample map build failed:", error);
  process.exit(1);
});
