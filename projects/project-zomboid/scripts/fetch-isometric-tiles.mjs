import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readIsometricOutput } from "./isometric-output.mjs";

// Mirrors a single floor of the hosted pzmap2dzi pyramid into the local `global`
// pack slot so the app can run without the remote source. The renderer takes
// days to produce the same coverage; this takes minutes.
//
// Empty regions are pruned instead of probed: a DZI parent tile covers exactly
// its four children, so a missing parent guarantees four missing children. That
// skips ~105k of the ~188k requests a blind level-20 sweep would make.

const DEFAULT_BASE = "https://tiles.projectzomboidmap.com/maps/b42.20.2-r1/base";
const DEFAULT_GENERATED_AT = "2026-08-08T06:44:39.000Z";
const USER_AGENT = "PZInteractiveMap/tile-mirror (+https://github.com/recepaydogan)";
const TILE_SIZE = 1024;
const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const projectRoot = resolve(import.meta.dirname, "..");
const defaultOutput = resolve(
  projectRoot,
  ".runtime-data/map-data/knox-country/isometric-optimized/global",
);

const argv = process.argv.slice(2);
const readFlag = (name, fallback) => {
  const prefix = `--${name}=`;
  const match = argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
};
const hasFlag = (name) => argv.includes(`--${name}`);
const readNumberFlag = (name, fallback) => {
  const raw = readFlag(name, null);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`--${name} must be a number.`);
  return parsed;
};

const options = {
  base: readFlag("base", DEFAULT_BASE).replace(/\/$/, ""),
  output: resolve(projectRoot, readFlag("out", defaultOutput)),
  floor: readNumberFlag("floor", 0),
  maxLevel: readNumberFlag("max-level", 20),
  // Latency-bound, not bandwidth-bound: throughput scales close to linearly with
  // concurrency (measured 7 tiles/s at 8, 41 at 32, 68 at 64). The cap is a
  // courtesy limit on a community-run origin, not a technical ceiling.
  concurrency: Math.max(1, Math.min(64, readNumberFlag("concurrency", 32))),
  retries: Math.max(0, readNumberFlag("retries", 4)),
  plan: hasFlag("plan"),
  force: hasFlag("force"),
};

const statePath = join(options.output, `.mirror-state-floor${options.floor}.json`);
const measurementStatePath = resolve(
  projectRoot,
  readFlag(
    "measurement-state",
    `.render-cache/isometric-floor-measurements/floor-${options.floor}-level-${options.maxLevel}.json`,
  ),
);
const tileRoot = join(options.output, `layer${options.floor}_files`);

const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const formatBytes = (bytes) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};
const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "?";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}s ${minutes}dk`;
  return `${minutes}dk ${Math.floor(seconds % 60)}sn`;
};

const request = async (url, { expect404 = false } = {}) => {
  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      if (attempt >= options.retries) throw error;
      await sleep(Math.min(30_000, 500 * 2 ** attempt));
      continue;
    }

    if (response.status === 404 && expect404) return null;
    if (response.ok) return Buffer.from(await response.arrayBuffer());

    if (!RETRY_STATUS.has(response.status) || attempt >= options.retries) {
      throw new Error(`${url} -> HTTP ${response.status}`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(30_000, 500 * 2 ** attempt);
    if (response.status === 429) console.warn(`  429 alindi, ${Math.round(backoff / 1000)}sn bekleniyor.`);
    await sleep(backoff);
  }
};

const parseDziSize = (xml) => {
  const size = /<Size[^>]*Width="(\d+)"[^>]*Height="(\d+)"/.exec(xml)
    ?? /<Size[^>]*Height="(\d+)"[^>]*Width="(\d+)"/.exec(xml);
  if (!size) throw new Error("DZI descriptor has no Size element.");
  const format = /Format="([^"]+)"/.exec(xml)?.[1] ?? "jpg";
  const tileSize = Number(/TileSize="(\d+)"/.exec(xml)?.[1] ?? TILE_SIZE);
  return { width: Number(size[1]), height: Number(size[2]), format, tileSize };
};

const getLevelGrid = (dzi, dziMaxLevel, level) => {
  const scale = 2 ** (dziMaxLevel - level);
  const width = Math.ceil(dzi.width / scale);
  const height = Math.ceil(dzi.height / scale);
  return { columns: Math.ceil(width / dzi.tileSize), rows: Math.ceil(height / dzi.tileSize) };
};

const loadState = () => {
  if (options.force || !existsSync(statePath)) return { levels: {} };
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    if (state.base !== options.base || state.floor !== options.floor) {
      console.warn("Onbellek farkli bir kaynaga ait, sifirdan baslaniyor.");
      return { levels: {} };
    }
    return state;
  } catch {
    return { levels: {} };
  }
};

const loadMeasurementState = () => {
  if (!existsSync(measurementStatePath)) return null;
  try {
    const state = JSON.parse(readFileSync(measurementStatePath, "utf8"));
    const fingerprint = JSON.parse(state.fingerprint);
    if (fingerprint.base !== options.base
      || fingerprint.floor !== options.floor
      || fingerprint.maximumLevel !== options.maxLevel) return null;
    return state;
  } catch {
    return null;
  }
};

const main = async () => {
  console.log(`Kaynak : ${options.base}`);
  console.log(`Hedef  : ${options.output}`);
  console.log(`Kat    : ${options.floor}   Max level: ${options.maxLevel}   Es zamanli: ${options.concurrency}`);

  const [dziXml, mapInfoRaw] = await Promise.all([
    request(`${options.base}/layer${options.floor}.dzi`),
    request(`${options.base}/map_info.json`, { expect404: true }),
  ]);
  const dzi = parseDziSize(dziXml.toString("utf8"));
  const mapInfo = mapInfoRaw ? JSON.parse(mapInfoRaw.toString("utf8")) : null;
  if (!mapInfo) throw new Error("Kaynak map_info.json sunmuyor; manifest uretilemez.");

  const dziMaxLevel = Math.ceil(Math.log2(Math.max(dzi.width, dzi.height)));
  if (options.maxLevel > dziMaxLevel) throw new Error(`--max-level en fazla ${dziMaxLevel} olabilir.`);
  console.log(`DZI    : ${dzi.width}x${dzi.height}  tile=${dzi.tileSize}  format=${dzi.format}  en ust level=${dziMaxLevel}`);

  if (options.plan) {
    console.log("\nlevel   izgara        tile      ~mevcut     ~boyut");
    let estimatedTiles = 0;
    for (let level = 0; level <= options.maxLevel; level += 1) {
      const { columns, rows } = getLevelGrid(dzi, dziMaxLevel, level);
      const total = columns * rows;
      const present = Math.round(total * 0.445);
      estimatedTiles += present;
      console.log(
        `${String(level).padStart(5)}   ${`${columns}x${rows}`.padEnd(12)}${String(total).padStart(9)}`
        + `${String(present).padStart(11)}   ${formatBytes(present * 230 * 1024).padStart(9)}`,
      );
    }
    console.log(`\nToplam ~${estimatedTiles.toLocaleString("tr-TR")} tile, ~${formatBytes(estimatedTiles * 230 * 1024)}.`);
    console.log("(Boyut tahmini level 20'den alinan 200 orneklik olcume dayanir: %44.5 dolu, ortalama 230 KB.)");
    return;
  }

  mkdirSync(options.output, { recursive: true });
  const state = loadState();
  const measurementState = loadMeasurementState();
  state.base = options.base;
  state.floor = options.floor;
  state.maxLevel = options.maxLevel;
  state.dzi = dzi;

  const saveState = () => writeFileSync(statePath, JSON.stringify(state));
  let interrupted = false;
  process.on("SIGINT", () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    console.log("\nDurduruluyor, ilerleme kaydediliyor... (tekrar Ctrl+C zorla cikar)");
  });

  const started = Date.now();
  let downloadedTiles = 0;
  let downloadedBytes = 0;
  let skippedTiles = 0;

  for (let level = 0; level <= options.maxLevel && !interrupted; level += 1) {
    const grid = getLevelGrid(dzi, dziMaxLevel, level);
    const previous = state.levels[level - 1];
    const measuredLevel = measurementState?.levels?.[level];
    const candidates = [];

    if (measuredLevel?.complete) {
      candidates.push(...measuredLevel.present);
    // Sparse floors can omit their smallest overview images entirely. Keep
    // probing the complete (still small) grid until the first non-empty level,
    // then switch to parent-based pruning for the remaining pyramid.
    } else if (level === 0 || !previous || previous.present.length === 0) {
      for (let x = 0; x < grid.columns; x += 1) {
        for (let y = 0; y < grid.rows; y += 1) candidates.push([x, y]);
      }
    } else {
      // A present parent is the only thing that can have present children.
      for (const key of previous.present) {
        const [px, py] = key.split("_").map(Number);
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const x = px * 2 + dx;
          const y = py * 2 + dy;
          if (x < grid.columns && y < grid.rows) candidates.push([x, y]);
        }
      }
    }

    const cached = state.levels[level];
    if (cached?.complete && !options.force) {
      console.log(`level ${String(level).padStart(2)}: onbellekten (${cached.present.length} tile)`);
      continue;
    }

    const knownMissing = new Set(cached?.missing ?? []);
    const present = new Set(cached?.present ?? []);
    const missing = new Set(knownMissing);
    const levelDirectory = join(tileRoot, String(level));
    mkdirSync(levelDirectory, { recursive: true });

    const queue = candidates.filter(([x, y]) => {
      const key = `${x}_${y}`;
      if (missing.has(key)) return false;
      const filePath = join(levelDirectory, `${key}.${dzi.format}`);
      if (existsSync(filePath) && statSync(filePath).size > 0) {
        present.add(key);
        skippedTiles += 1;
        return false;
      }
      return true;
    });

    console.log(
      `level ${String(level).padStart(2)}: ${grid.columns}x${grid.rows} izgara, `
      + `${candidates.length} aday, ${queue.length} indirilecek`,
    );

    let cursor = 0;
    let levelDone = 0;
    const worker = async () => {
      while (!interrupted) {
        const index = cursor;
        cursor += 1;
        if (index >= queue.length) return;
        const [x, y] = queue[index];
        const key = `${x}_${y}`;
        const filePath = join(levelDirectory, `${key}.${dzi.format}`);
        const buffer = await request(`${options.base}/layer${options.floor}_files/${level}/${key}.${dzi.format}`, {
          expect404: true,
        });

        if (buffer === null && measuredLevel?.complete) {
          throw new Error(`Measured tile disappeared from the source: floor ${options.floor}, level ${level}, ${key}.`);
        } else if (buffer === null) {
          missing.add(key);
        } else {
          const temporaryPath = `${filePath}.part`;
          writeFileSync(temporaryPath, buffer);
          renameSync(temporaryPath, filePath);
          present.add(key);
          downloadedTiles += 1;
          downloadedBytes += buffer.length;
        }

        levelDone += 1;
        if (levelDone % 500 === 0) {
          const elapsed = (Date.now() - started) / 1000;
          const rate = downloadedTiles / Math.max(elapsed, 1);
          const remaining = (queue.length - levelDone) / Math.max(rate, 0.1);
          console.log(
            `  ${levelDone}/${queue.length}  ${formatBytes(downloadedBytes)}  `
            + `${rate.toFixed(1)} tile/sn  kalan ~${formatDuration(remaining)}`,
          );
          state.levels[level] = { present: [...present], missing: [...missing], complete: false };
          saveState();
        }
      }
    };

    await Promise.all(Array.from({ length: options.concurrency }, worker));
    state.levels[level] = {
      present: [...present],
      missing: [...missing],
      complete: !interrupted && cursor >= queue.length,
    };
    saveState();
  }

  if (interrupted) {
    console.log(`\nYarida kesildi. ${downloadedTiles} tile indirildi (${formatBytes(downloadedBytes)}).`);
    console.log("Ayni komutu tekrar calistirinca kaldigi yerden devam eder.");
    return;
  }

  writeFileSync(join(options.output, `layer${options.floor}.dzi`), dziXml);
  writeFileSync(join(options.output, "map_info.json"), JSON.stringify({ ...mapInfo, scale: 1 }, null, 2));

  const { floors } = readIsometricOutput(options.output);
  const rectangles = mapInfo.cell_rects;
  const minimumX = Math.min(...rectangles.map(([x]) => x));
  const minimumY = Math.min(...rectangles.map(([, y]) => y));
  const cellRange = [
    minimumX,
    minimumY,
    Math.max(...rectangles.map(([x, , width]) => x + width)) - minimumX,
    Math.max(...rectangles.map(([, y, , height]) => y + height)) - minimumY,
  ];

  // `tileSourceKind: "direct"` is what caps OpenSeadragon at the mirrored depth.
  // The .dzi descriptor still advertises the source's full pyramid, so a viewer
  // that reads it instead would request levels this mirror does not hold.
  const mirroredFloorNumbers = floors.map(({ floor }) => floor);
  const minimumFloor = Math.min(...mirroredFloorNumbers);
  const maximumFloor = Math.max(...mirroredFloorNumbers);
  const manifest = {
    tileSourceKind: "direct",
    renderer: "pzmap2dzi",
    rendererCommit: typeof mapInfo.git_commit === "string" ? mapInfo.git_commit : "unknown",
    sourceFingerprint: `mirror:${options.base}`,
    renderProfile: {
      scope: "global",
      layerRange: [minimumFloor, maximumFloor + 1],
      baseImageFormat: dzi.format,
      imageFormat: dzi.format,
      quality: 0,
      maximumDetailReduction: dziMaxLevel - options.maxLevel,
    },
    generatedAt: DEFAULT_GENERATED_AT,
    cellRange,
    layerRange: [minimumFloor, maximumFloor + 1],
    complete: true,
    mapInfo: {
      w: dzi.width,
      h: dzi.height,
      x0: mapInfo.x0,
      y0: mapInfo.y0,
      sqr: mapInfo.sqr,
      scale: 1,
      minlayer: minimumFloor,
      maxlayer: maximumFloor,
      cell_size: mapInfo.cell_size,
    },
    floors,
  };
  writeFileSync(join(options.output, "manifest.json"), JSON.stringify(manifest, null, 2));

  const totalPresent = Object.values(state.levels).reduce((total, entry) => total + entry.present.length, 0);
  const elapsed = (Date.now() - started) / 1000;
  console.log(`\nBitti. ${totalPresent.toLocaleString("tr-TR")} tile hazir `
    + `(${downloadedTiles.toLocaleString("tr-TR")} indirildi, ${skippedTiles.toLocaleString("tr-TR")} zaten vardi).`);
  console.log(`Indirilen: ${formatBytes(downloadedBytes)} / ${formatDuration(elapsed)}`);
  console.log(`manifest.json yazildi -> ${join(options.output, "manifest.json")}`);
  console.log("VITE_ISOMETRIC_EXTERNAL_ENABLED=false ile uygulama bu kopyayi kullanir.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
