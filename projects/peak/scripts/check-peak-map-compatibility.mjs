import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const defaultGameDirectory = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\PEAK";

const loadEnvFile = async () => {
  const values = {};
  try {
    const contents = await readFile(join(projectRoot, ".env"), "utf8");
    for (const line of contents.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const separator = trimmed.indexOf("=");
      values[trimmed.slice(0, separator).trim()] = trimmed
        .slice(separator + 1)
        .trim()
        .replace(/^['"]|['"]$/gu, "");
    }
  }
  catch {
    // Environment variables are sufficient in CI or deployment shells.
  }
  return values;
};

const argumentsList = process.argv.slice(2);
const hasFlag = (flag) => argumentsList.includes(flag);
const optionValue = (name) => {
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : null;
};

const gameDirectory = resolve(
  optionValue("--game-directory") ?? process.env.PEAK_GAME_DIRECTORY ?? defaultGameDirectory,
);
const publishedV4 = join(projectRoot, 'artifacts', 'peak-data-v4');
const defaultDataDirectory = await access(join(publishedV4, 'catalog.json')).then(() => publishedV4,
  () => join(projectRoot, 'artifacts', 'peak-data'));
const dataDirectory = resolve(optionValue("--data-directory") ?? defaultDataDirectory);
const catalogPath = join(dataDirectory, "catalog.json");
const captureManifestPath = join(dataDirectory, "map-capture.json");
const mapDirectory = join(dataDirectory, "maps");
const jsonOutput = hasFlag("--json");
const recordCapture = hasFlag("--record-capture");
const envFile = await loadEnvFile();
const cdnBaseUrl = (process.env.VITE_PEAK_CDN_BASE_URL ?? envFile.VITE_PEAK_CDN_BASE_URL ?? "")
  .replace(/\/+$/u, "");

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const hashFile = async (path) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
};

const projectionSignature = (projection = {}) => ({
  worldXMin: projection.worldXMin,
  worldXMax: projection.worldXMax,
  worldZMin: projection.worldZMin,
  worldZMax: projection.worldZMax,
  mapXMin: projection.mapXMin,
  mapXMax: projection.mapXMax,
  mapYMin: projection.mapYMin,
  mapYMax: projection.mapYMax,
});

const getTargets = (catalog) => [
  ...catalog.levels.map((level) => ({
    scene: level.scene,
    assetFile: level.assetFile,
    ...(level.assetBundle ? { assetBundle: level.assetBundle } : {}),
    seed: level.seed,
    slug: basename(level.mapImage, ".webp"),
    projection: projectionSignature(level.projection),
    ...(level.mapBuildId ? { mapBuildId: level.mapBuildId } : {}),
  })),
  ...(catalog.specialLevels ?? []).map((level) => ({
    scene: level.scene,
    assetFile: level.assetFile,
    ...(level.assetBundle ? { assetBundle: level.assetBundle } : {}),
    seed: level.seed ?? null,
    captureRootComponent: level.captureRootComponent ?? null,
    slug: basename(level.mapImage, ".webp"),
    projection: projectionSignature(level.projection),
  })),
];

const catalogSignature = (catalog) => createHash("sha256")
  .update(JSON.stringify({
    assemblySha256: catalog.source.assemblySha256,
    targets: getTargets(catalog),
    ...(catalog.schemaVersion === 4 ? { metadata: [...catalog.levels, ...catalog.specialLevels].map(level => ({
      biomes: level.biomes, variants: level.variants,
      markers: level.markers.map(marker => ({ id: marker.id, world: marker.world, map: marker.map, biomeSlot: marker.biomeSlot })),
    })) } : {}),
  }))
  .digest("hex");

const readInstalledSource = async (catalog) => {
  const versionPath = join(gameDirectory, "version.txt");
  const assemblyPath = join(gameDirectory, "PEAK_Data", "Managed", "Assembly-CSharp.dll");
  const manifestPath = resolve(
    gameDirectory,
    "..",
    "..",
    `appmanifest_${catalog.source.steamAppId}.acf`,
  );

  await Promise.all([access(versionPath), access(assemblyPath), access(manifestPath)]);
  const versionLines = (await readFile(versionPath, "utf8"))
    .split(/\r?\n/u)
    .map((line) => line.trim());
  const appManifest = await readFile(manifestPath, "utf8");
  const buildId = appManifest.match(/"buildid"\s+"(\d+)"/u)?.[1] ?? "unknown";

  return {
    buildId,
    gameVersion: versionLines[0] || "unknown",
    revision: versionLines[1] || "unknown",
    assemblySha256: await hashFile(assemblyPath),
  };
};

const mapSourceFingerprint = async (catalog) => {
  const dataDirectory = join(gameDirectory, "PEAK_Data");
  const packed = (await readdir(dataDirectory)).includes("data.unity3d");
  const sharedAssets = (await readdir(dataDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile()
      && /^(?:sharedassets\d+|resources|globalgamemanagers)(?:\.assets)?(?:\.resS|\.resource)?$/iu.test(entry.name))
    .map((entry) => entry.name);
  const sourceFiles = [
    join(dataDirectory, "Managed", "Assembly-CSharp.dll"),
    ...sharedAssets.sort().map((name) => join(dataDirectory, name)),
    ...(packed ? [join(dataDirectory, "data.unity3d")]
      : new Set(getTargets(catalog).map((target) => target.assetBundle
        ? join(gameDirectory, target.assetBundle) : join(dataDirectory, target.assetFile)))),
  ];
  const hash = createHash("sha256");
  hash.update(catalog.schemaVersion === 4 ? "peak-map-source-v4\0" : "peak-map-source-v1\0");
  if (catalog.schemaVersion === 4) {
    for (const directory of ['Managed', 'Resources', 'StreamingAssets/maps']) {
      for (const entry of (await readdir(join(dataDirectory, directory), { withFileTypes: true }))
        .sort((a, b) => a.name.localeCompare(b.name))) {
        const path = join(dataDirectory, directory, entry.name);
        if (entry.isFile() && !sourceFiles.includes(path)) sourceFiles.push(path);
      }
    }
    sourceFiles.push(join(gameDirectory, 'UnityPlayer.dll'), join(gameDirectory, 'PEAK.exe'));
    sourceFiles.push(join(projectRoot, 'tools/map-capture/peak-map-capture.cs'),
      join(projectRoot, 'tools/map-capture/convert-map-capture.mjs'),
      join(projectRoot, 'scripts/peak-data/map-config.json'));
  }

  for (const path of catalog.schemaVersion === 4 ? [...new Set(sourceFiles)].sort() : sourceFiles) {
    await access(path);
    hash.update(relative(gameDirectory, path).replaceAll("\\", "/"));
    hash.update("\0");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    hash.update("\0");
  }
  return hash.digest("hex");
};

const inspectCapturedFiles = async (targets, tileGrid, recordedMaps = null, remoteBaseUrl = "") => {
  const issues = [];
  const maps = [];

  for (const target of targets) {
    if (remoteBaseUrl) {
      const overviewUrl = `${remoteBaseUrl}/maps/${target.slug}.webp`;
      try {
        const response = await fetch(overviewUrl, { method: "HEAD" });
        if (!response.ok) issues.push(`${overviewUrl} returned HTTP ${response.status}`);
        maps.push({
          scene: target.scene,
          slug: target.slug,
          imageSha256: recordedMaps?.find((entry) => entry.slug === target.slug)?.imageSha256 ?? null,
        });
      }
      catch (error) {
        issues.push(`${overviewUrl} is unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (tileGrid > 1) {
        for (let column = 0; column < tileGrid; column += 1) {
          for (let row = 0; row < tileGrid; row += 1) {
            const tileUrl = `${remoteBaseUrl}/maps/tiles/${target.slug}/${column}-${row}.webp`;
            try {
              const response = await fetch(tileUrl, { method: "HEAD" });
              if (!response.ok) issues.push(`${tileUrl} returned HTTP ${response.status}`);
            }
            catch (error) {
              issues.push(`${tileUrl} is unavailable: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }
      }
      continue;
    }

    const imagePath = join(mapDirectory, `${target.slug}.webp`);
    const recordedMap = recordedMaps?.find((entry) => entry.slug === target.slug);
    const currentMap = { scene: target.scene, slug: target.slug, imageSha256: null };
    try {
      const imageSha256 = await hashFile(imagePath);
      if (recordedMaps && !recordedMap) issues.push(`${target.slug} has no unique capture record`);
      if (recordedMap && recordedMap.imageSha256 !== imageSha256) {
        issues.push(`${target.slug}.webp changed after the recorded capture`);
      }
      currentMap.imageSha256 = imageSha256;
      maps.push(currentMap);
    }
    catch {
      issues.push(`${target.slug}.webp is missing`);
      continue;
    }

    if (tileGrid > 1) {
      const tileDirectory = join(mapDirectory, "tiles", target.slug);
      try {
        const tileNames = (await readdir(tileDirectory))
          .filter((name) => /^\d+-\d+\.webp$/u.test(name));
        const expectedNames = new Set();
        for (let column = 0; column < tileGrid; column += 1) {
          for (let row = 0; row < tileGrid; row += 1) {
            expectedNames.add(`${column}-${row}.webp`);
          }
        }
        if (tileNames.length !== expectedNames.size
          || tileNames.some((name) => !expectedNames.has(name))) {
          issues.push(`${target.slug} does not have a complete ${tileGrid}x${tileGrid} tile set`);
        }
        if (target.assetBundle) {
          currentMap.tiles = {};
          for (const name of [...expectedNames].sort()) {
            const digest = await hashFile(join(tileDirectory, name));
            currentMap.tiles[name] = digest;
            if (recordedMaps && recordedMap?.tiles?.[name] !== digest) {
              issues.push(`${target.slug}/${name} differs from its recorded capture`);
            }
          }
        }
      }
      catch {
        issues.push(`${target.slug} tile directory is missing`);
      }
    }
  }

  return { issues, maps };
};

const printResult = (result) => {
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`PEAK map compatibility: ${result.status.toUpperCase()}`);
  console.log(`Installed: build ${result.installed.buildId}, ${result.installed.gameVersion}, ${result.installed.revision}`);
  console.log(`Catalog:   build ${result.catalog.buildId}, ${result.catalog.gameVersion}, ${result.catalog.revision}`);
  for (const reason of result.reasons) console.log(`- ${reason}`);
  for (const note of result.notes) console.log(`Note: ${note}`);
};

const main = async () => {
  const catalog = await readJson(catalogPath);
  const installed = await readInstalledSource(catalog);
  const targets = getTargets(catalog);

  if (recordCapture) {
    if (installed.assemblySha256 !== catalog.source.assemblySha256) {
      throw new Error("Catalog data does not match the installed PEAK assembly; extract the catalog first.");
    }
    const tileGrid = Number.parseInt(optionValue("--tile-grid") ?? "4", 10);
    if (!Number.isInteger(tileGrid) || tileGrid < 1 || tileGrid > 8) {
      throw new Error("--tile-grid must be an integer from 1 to 8.");
    }
    const capturedFiles = await inspectCapturedFiles(targets, tileGrid);
    if (capturedFiles.issues.length > 0) {
      throw new Error(`Cannot record an incomplete capture: ${capturedFiles.issues.join("; ")}`);
    }
    const manifest = {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      source: installed,
      catalogSignature: catalogSignature(catalog),
      mapSourceSha256: await mapSourceFingerprint(catalog),
      tileGrid,
      maps: capturedFiles.maps,
    };
    await writeFile(captureManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(`Recorded map capture compatibility in ${captureManifestPath}`);
    return;
  }

  const result = {
    status: "compatible",
    installed,
    catalog: catalog.source,
    reasons: [],
    notes: [],
  };

  if (installed.assemblySha256 !== catalog.source.assemblySha256) {
    result.status = "catalog-refresh-required";
    result.reasons.push("The installed game assembly differs from the extracted catalog.");
  }

  if (installed.buildId !== catalog.source.buildId) {
    result.notes.push("Steam build IDs differ; content fingerprints decide whether recapture is necessary.");
  }
  if (hasFlag("--check-window")) {
    const version = installed.gameVersion.split(".").slice(0, 2).join(".");
    const response = await fetch(`https://peaklogin3.azurewebsites.net/api/VersionCheck?version=${encodeURIComponent(version)}`);
    if (!response.ok) throw new Error(`Rotation service returned HTTP ${response.status}`);
    const rotation = await response.json();
    if (!rotation.VersionOkay || !Number.isInteger(rotation.LevelIndex)) throw new Error("Invalid current rotation response");
    const required = Array.from({ length: Math.min(7, catalog.rotation.levelCount) }, (_, offset) =>
      (rotation.LevelIndex + offset) % catalog.rotation.levelCount);
    if (required.some((index) => !(catalog.specialLevels ?? []).some((level) => level.scene === `Level_${index}`)
        || (catalog.dailyWindow && (!catalog.dailyWindow.levelIndices.includes(index)
          || catalog.levels.find(level => level.index === index)?.mapBuildId !== catalog.source.buildId)))) {
      if (result.status === "compatible") result.status = "final-window-refresh-required";
      result.reasons.push("Today's seven-day final-map window is incomplete; extend it even if the game build is unchanged.");
    }
  }

  let captureManifest = null;
  try {
    captureManifest = await readJson(captureManifestPath);
  }
  catch {
    if (result.status === "compatible") result.status = "map-recapture-required";
    result.reasons.push("No map capture compatibility record exists.");
  }

  if (captureManifest) {
    if (captureManifest.catalogSignature !== catalogSignature(catalog)) {
      if (result.status === "compatible") result.status = "map-recapture-required";
      result.reasons.push("The map images were captured for a different catalog or seed set.");
    }

    const capturedFiles = await inspectCapturedFiles(
      targets,
      captureManifest.tileGrid,
      captureManifest.maps,
      hasFlag("--local") ? "" : cdnBaseUrl,
    );
    if (capturedFiles.issues.length > 0) {
      if (result.status === "compatible") result.status = "map-recapture-required";
      result.reasons.push(...capturedFiles.issues);
    }

    if (result.status !== "catalog-refresh-required") {
      const installedMapSourceSha256 = await mapSourceFingerprint(catalog);
      if (installedMapSourceSha256 !== captureManifest.mapSourceSha256) {
        result.status = "map-recapture-required";
        result.reasons.push("The installed map-generating game files changed after the last capture.");
      }
    }
  }

  if (result.reasons.length === 0) {
    result.reasons.push(catalog.schemaVersion === 4
      ? "Seven daily maps and matching final subtrees, source fingerprints, overview and tile hashes are verified."
      : catalog.dailyWindow
      ? "Active-window data and captured assets are verified; out-of-window maps retain their recorded build provenance."
      : "Catalog data, map sources, overview images, and zoom tiles match the installed game.");
  }

  printResult(result);
  process.exitCode = result.status === "compatible" ? 0 : 1;
};

main().catch((error) => {
  const result = {
    status: "unavailable",
    installed: { buildId: "unknown", gameVersion: "unknown", revision: "unknown" },
    catalog: { buildId: "unknown", gameVersion: "unknown", revision: "unknown" },
    reasons: [error instanceof Error ? error.message : String(error)],
    notes: [],
  };
  printResult(result);
  process.exitCode = 2;
});
