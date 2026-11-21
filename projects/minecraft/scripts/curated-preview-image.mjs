import sharp from "sharp";
import { GAME_BIOME_COLORS, GAME_SEED_SEARCH_PROFILES, GAME_STRUCTURE_TYPES } from "../src/game-config.ts";
import { evaluateSeedCandidates } from "../src/features/generation/run-seed-search-work.ts";
import { biomeRasterColor, createBiomeRasterPalette } from "../src/features/generation/biome-raster-color.ts";

export const CURATED_PREVIEW_SIZE = { width: 640, height: 360 };

const RANGE = { scale: 64, cellX: -64, cellZ: -36, width: 128, height: 72, blockY: 96 };
const PIXEL_SCALE = CURATED_PREVIEW_SIZE.width / RANGE.width;

const palette = createBiomeRasterPalette(GAME_BIOME_COLORS);

const markerColor = point => point.kind === "biome"
  ? point.type === "cherry-grove" ? "#f2a9c2" : "#dcebf2"
  : GAME_STRUCTURE_TYPES.find(type => type.id === point.type)?.color ?? "#f0cf7b";

const markerOverlay = points => {
  const dots = points.map(point => {
    const x = (point.x / RANGE.scale - RANGE.cellX) * PIXEL_SCALE;
    const y = (point.z / RANGE.scale - RANGE.cellZ) * PIXEL_SCALE;
    if (x < 0 || x > CURATED_PREVIEW_SIZE.width || y < 0 || y > CURATED_PREVIEW_SIZE.height) return "";
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="8" fill="#101410" fill-opacity=".8"/>`
      + `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="5" fill="${markerColor(point)}" stroke="#fffaf0" stroke-width="1.5"/>`;
  }).join("");
  const originX = -RANGE.cellX * PIXEL_SCALE, originY = -RANGE.cellZ * PIXEL_SCALE;
  return Buffer.from(`<svg width="${CURATED_PREVIEW_SIZE.width}" height="${CURATED_PREVIEW_SIZE.height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="none" stroke="#fffaf0" stroke-opacity=".22" stroke-width="2"/>
    <path d="M ${originX - 7} ${originY} H ${originX + 7} M ${originX} ${originY - 7} V ${originY + 7}" stroke="#fffaf0" stroke-width="2" stroke-linecap="round"/>
    ${dots}
  </svg>`);
};

/** Renders a source-backed, exact-context biome preview with verified candidate markers. */
export const renderCuratedWorldPreview = async (engine, pick, version) => {
  const profile = GAME_SEED_SEARCH_PROFILES.find(candidate => candidate.id === pick.profileId);
  if (!profile) throw new Error(`Missing curated profile ${pick.profileId}`);
  const dimension = profile.dimension === "nether" ? -1 : profile.dimension === "end" ? 1 : 0;
  const verified = evaluateSeedCandidates(engine, version, [pick.seed], dimension, profile.requirements);
  if (verified.status !== "match" || !verified.match) throw new Error(`Curated seed ${pick.id} failed verification for ${version}`);
  engine.seed(version, pick.seed, dimension);
  const biomes = engine.generate(RANGE);
  if (biomes.length !== RANGE.width * RANGE.height) throw new Error("Curated preview biome grid has an invalid size");
  const pixels = new Uint8Array(biomes.length * 3);
  for (let index = 0; index < biomes.length; index++) {
    const cellX = index % RANGE.width, cellZ = Math.floor(index / RANGE.width);
    const [red, green, blue] = biomeRasterColor(palette.get(biomes[index]) ?? [0x24, 0x30, 0x2d], biomes[index],
      (RANGE.cellX + cellX) * RANGE.scale, (RANGE.cellZ + cellZ) * RANGE.scale);
    pixels[index * 3] = red; pixels[index * 3 + 1] = green; pixels[index * 3 + 2] = blue;
  }
  return sharp(pixels, { raw: { width: RANGE.width, height: RANGE.height, channels: 3 } })
    .resize(CURATED_PREVIEW_SIZE.width, CURATED_PREVIEW_SIZE.height, { kernel: "nearest" })
    .composite([{ input: markerOverlay(verified.match.points) }])
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
};
