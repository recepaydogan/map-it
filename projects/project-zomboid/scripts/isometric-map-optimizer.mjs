import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const requireSafeTarget = (sourceRoot, targetRoot) => {
  const source = resolve(sourceRoot);
  const target = resolve(targetRoot);
  if (source === target || target.startsWith(`${source}\\`)) {
    throw new Error("The optimized map target must be outside the source map directory.");
  }
  if (target.length < 10 || dirname(target) === target) throw new Error(`Unsafe optimized map target: ${target}`);
  return { source, target };
};

const copyDirectory = (source, target) => {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(sourcePath, targetPath);
    else if (entry.isFile()) copyFileSync(sourcePath, targetPath);
  }
};

const rewriteDziDimensions = (source, width, height) => source
  .replace(/Width="\d+"/, `Width="${width}"`)
  .replace(/Height="\d+"/, `Height="${height}"`);

const getManifestPaths = (sourceRoot) => {
  const paths = [];
  const rootManifest = join(sourceRoot, "manifest.json");
  if (existsSync(rootManifest)) paths.push(rootManifest);
  for (const directory of ["packs", "global"]) {
    const root = join(sourceRoot, directory);
    if (!existsSync(root)) continue;
    if (directory === "global" && existsSync(join(root, "manifest.json"))) {
      paths.push(join(root, "manifest.json"));
      continue;
    }
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const manifestPath = join(root, entry.name, "manifest.json");
      if (entry.isDirectory() && existsSync(manifestPath)) paths.push(manifestPath);
    }
  }
  return paths;
};

const optimizeManifest = ({ sourceRoot, targetRoot, manifestPath, droppedLevels }) => {
  const sourceDirectory = dirname(manifestPath);
  const relativeDirectory = relative(sourceRoot, sourceDirectory);
  const targetDirectory = join(targetRoot, relativeDirectory);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const ground = manifest.floors?.find(({ floor }) => floor === 0);
  if (!ground) throw new Error(`Ground floor is missing from ${manifestPath}.`);
  const levels = [...ground.levels].sort((left, right) => left - right);
  if (levels.length <= droppedLevels) throw new Error(`Cannot drop ${droppedLevels} levels from ${manifestPath}.`);
  const retainedLevels = levels.slice(0, -droppedLevels);
  const scaleFactor = 2 ** droppedLevels;
  const width = Math.ceil(ground.width / scaleFactor);
  const height = Math.ceil(ground.height / scaleFactor);
  mkdirSync(targetDirectory, { recursive: true });

  writeFileSync(
    join(targetDirectory, "layer0.dzi"),
    rewriteDziDimensions(readFileSync(join(sourceDirectory, "layer0.dzi"), "utf8"), width, height),
  );
  const targetTileRoot = join(targetDirectory, "layer0_files");
  for (const level of retainedLevels) {
    copyDirectory(join(sourceDirectory, "layer0_files", String(level)), join(targetTileRoot, String(level)));
  }

  const mapInfo = {
    ...manifest.mapInfo,
    w: Math.ceil(manifest.mapInfo.w / scaleFactor),
    h: Math.ceil(manifest.mapInfo.h / scaleFactor),
    scale: (manifest.mapInfo.scale || 1) * scaleFactor,
    minlayer: 0,
    maxlayer: 1,
  };
  writeFileSync(join(targetDirectory, "map_info.json"), `${JSON.stringify(mapInfo, null, 2)}\n`);
  const optimized = {
    ...manifest,
    sourceFingerprint: `${manifest.sourceFingerprint ?? "untracked"}:ground-detail-${droppedLevels}`,
    renderProfile: {
      ...(manifest.renderProfile ?? {}),
      layerRange: [0, 1],
      maximumDetailReduction: droppedLevels,
    },
    layerRange: [0, 1],
    mapInfo,
    floors: [{ ...ground, width, height, levels: retainedLevels }],
  };
  writeFileSync(join(targetDirectory, "manifest.json"), `${JSON.stringify(optimized, null, 2)}\n`);
  return optimized;
};

export const optimizeIsometricMap = ({ sourceRoot, targetRoot, droppedLevels = 2 }) => {
  if (!Number.isInteger(droppedLevels) || droppedLevels < 1) {
    throw new Error("droppedLevels must be a positive integer.");
  }
  const { source, target } = requireSafeTarget(sourceRoot, targetRoot);
  const catalogPath = join(source, "catalog.json");
  if (!existsSync(catalogPath)) throw new Error(`Isometric catalog was not found at ${catalogPath}.`);
  const sourceCatalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });

  const manifests = new Map();
  for (const manifestPath of getManifestPaths(source)) {
    const optimized = optimizeManifest({ sourceRoot: source, targetRoot: target, manifestPath, droppedLevels });
    manifests.set(relative(source, dirname(manifestPath)).replaceAll("\\", "/") || ".", optimized);
  }
  const packs = sourceCatalog.packs.flatMap((pack) => {
    const manifest = manifests.get(pack.basePath);
    return manifest ? [{ ...manifest, id: pack.id, basePath: pack.basePath }] : [];
  });
  const catalog = { ...sourceCatalog, generatedAt: new Date().toISOString(), floors: [0], packs };
  writeFileSync(join(target, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  return catalog;
};
