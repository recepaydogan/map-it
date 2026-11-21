import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_BASE = "https://tiles.projectzomboidmap.com/maps/b42.20.2-r1/base";
const DEFAULT_TILE_SIZE = 1024;
const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

class MissingFloorDescriptorError extends Error {}

const argumentsByName = new Map(process.argv.slice(2).map((entry) => {
  const [name, ...parts] = entry.split("=");
  return [name, parts.join("=")];
}));
const readInteger = (name, fallback) => {
  const raw = argumentsByName.get(name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer.`);
  return value;
};

const floor = readInteger("--floor", Number.NaN);
const concurrency = Math.max(1, Math.min(256, readInteger("--concurrency", 128)));
const maximumLevel = readInteger("--max-level", 22);
const base = (argumentsByName.get("--base") || DEFAULT_BASE).replace(/\/$/, "");
const statePath = resolve(
  argumentsByName.get("--state")
    || `.render-cache/isometric-floor-measurements/floor-${floor}-level-${maximumLevel}.json`,
);

const parseDzi = (source) => {
  const size = /<Size[^>]*Width="(\d+)"[^>]*Height="(\d+)"/.exec(source);
  if (!size) throw new Error("DZI descriptor has no Size element.");
  return {
    width: Number(size[1]),
    height: Number(size[2]),
    format: /Format="([^"]+)"/.exec(source)?.[1] || "webp",
    tileSize: Number(/TileSize="(\d+)"/.exec(source)?.[1] || DEFAULT_TILE_SIZE),
  };
};

const request = async (url, method = "GET") => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, { method, signal: AbortSignal.timeout(15_000) });
      if (response.status === 404) return null;
      if (response.ok) return response;
      if (!RETRY_STATUS.has(response.status) || attempt >= 4) {
        throw new Error(`${url} -> HTTP ${response.status}`);
      }
    } catch (error) {
      if (attempt >= 4) throw error;
    }
    await new Promise((done) => setTimeout(done, Math.min(5_000, 250 * 2 ** attempt)));
  }
};

const getGrid = (dzi, pyramidMaximumLevel, level) => {
  const scale = 2 ** (pyramidMaximumLevel - level);
  return {
    columns: Math.ceil(Math.ceil(dzi.width / scale) / dzi.tileSize),
    rows: Math.ceil(Math.ceil(dzi.height / scale) / dzi.tileSize),
  };
};

const loadState = (fingerprint) => {
  if (!existsSync(statePath)) return { fingerprint, levels: {} };
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  return state.fingerprint === fingerprint ? state : { fingerprint, levels: {} };
};

const main = async () => {
  const descriptorUrl = `${base}/layer${floor}.dzi`;
  const descriptorResponse = await request(descriptorUrl);
  if (!descriptorResponse) throw new MissingFloorDescriptorError(`Floor ${floor} has no DZI descriptor.`);
  const descriptor = await descriptorResponse.text();
  const dzi = parseDzi(descriptor);
  const pyramidMaximumLevel = Math.ceil(Math.log2(Math.max(dzi.width, dzi.height)));
  if (maximumLevel > pyramidMaximumLevel) {
    throw new Error(`--max-level cannot exceed ${pyramidMaximumLevel}.`);
  }

  const fingerprint = JSON.stringify({ base, floor, maximumLevel, descriptor });
  const state = loadState(fingerprint);
  mkdirSync(dirname(statePath), { recursive: true });
  const saveState = () => writeFileSync(statePath, `${JSON.stringify(state)}\n`);
  let parents = [];

  for (let level = 0; level <= maximumLevel; level += 1) {
    const cached = state.levels[level];
    if (cached?.complete) {
      parents = cached.present;
      console.log(`Level ${level}: cached, ${parents.length} tiles, ${cached.bytes} bytes`);
      continue;
    }

    const grid = getGrid(dzi, pyramidMaximumLevel, level);
    const candidates = parents.length > 0
      ? parents.flatMap(([x, y]) => [[x * 2, y * 2], [x * 2 + 1, y * 2], [x * 2, y * 2 + 1], [x * 2 + 1, y * 2 + 1]])
        .filter(([x, y]) => x < grid.columns && y < grid.rows)
      : Array.from({ length: grid.columns * grid.rows }, (_, index) => [
        Math.floor(index / grid.rows),
        index % grid.rows,
      ]);
    const present = [];
    let bytes = 0;
    let cursor = 0;
    let processed = 0;
    let nextProgressReport = 5_000;
    const worker = async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= candidates.length) return;
        const [x, y] = candidates[index];
        const response = await request(
          `${base}/layer${floor}_files/${level}/${x}_${y}.${dzi.format}`,
          "HEAD",
        );
        if (response) {
          const length = Number(response.headers.get("content-length"));
          if (!Number.isFinite(length)) throw new Error(`Tile ${level}/${x}_${y} has no content length.`);
          present.push([x, y]);
          bytes += length;
        }
        processed += 1;
        if (processed >= nextProgressReport) {
          console.log(`Level ${level}: checked ${processed}/${candidates.length}`);
          nextProgressReport += 5_000;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker));
    state.levels[level] = { complete: true, present, bytes };
    saveState();
    parents = present;
    console.log(`Level ${level}: ${present.length}/${candidates.length} tiles, ${bytes} bytes`);
  }

  const levels = Object.values(state.levels).filter(({ complete }) => complete);
  const result = {
    floor,
    maximumLevel,
    files: levels.reduce((total, level) => total + level.present.length, 0),
    bytes: levels.reduce((total, level) => total + level.bytes, 0),
  };
  console.log(JSON.stringify(result));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = error instanceof MissingFloorDescriptorError ? 2 : 1;
});
