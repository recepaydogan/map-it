import fs from "node:fs";
import path from "node:path";

const parseArguments = (arguments_) => {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    values.set(key.slice(2), value);
  }

  for (const required of ["world-map", "texture-bank", "output", "texture-list"]) {
    if (!values.has(required)) throw new Error(`Missing required argument: --${required}`);
  }
  return values;
};

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const attributeValue = (attributes, name, fallback = null) =>
  attributes?.[name]?.value ?? fallback;

const getSourceIdentity = (root, filePath) => {
  const relativePath = path.relative(root, filePath).split(path.sep).join("/");
  const parts = relativePath.split("/");
  const levelsIndex = parts.indexOf("Levels");
  return {
    module: levelsIndex > 0 ? parts[levelsIndex - 1] : "unknown",
    level: levelsIndex >= 0 ? parts[levelsIndex + 1] : "unknown",
    relativePath,
  };
};

const buildTextureBank = (filePath) => {
  const resources = readJson(filePath)?.save?.regions?.VirtualTextureBank?.Resource;
  if (!Array.isArray(resources)) {
    throw new Error(`VirtualTextureBank.Resource was not found in ${filePath}.`);
  }

  return new Map(resources.map((resource) => {
    const id = attributeValue(resource, "ID");
    return [id, {
      id,
      gTex: attributeValue(resource, "GTexFileName"),
      internalName: attributeValue(resource, "Name"),
      prefetch: attributeValue(resource, "Prefetch", false),
      prefetchMipLevel: attributeValue(resource, "PrefetchMipLevel", -1),
      provenance: { sourcePath: filePath },
    }];
  }));
};

const main = () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const worldMapRoot = path.resolve(arguments_.get("world-map"));
  const textureBankPath = path.resolve(arguments_.get("texture-bank"));
  const outputPath = path.resolve(arguments_.get("output"));
  const textureListPath = path.resolve(arguments_.get("texture-list"));
  const textureBank = buildTextureBank(textureBankPath);
  const unresolvedTextureIds = new Set();
  const records = walkFiles(worldMapRoot)
    .filter((filePath) => filePath.toLowerCase().endsWith(".lsj"))
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((filePath) => {
      const metadata = readJson(filePath)?.save?.regions?.WorldMapMetaData;
      if (!metadata) throw new Error(`WorldMapMetaData was not found in ${filePath}.`);
      const source = getSourceIdentity(worldMapRoot, filePath);
      const textureId = attributeValue(metadata, "TextureFilePath", "");
      const texture = textureId ? textureBank.get(textureId) : null;
      if (textureId && !texture) unresolvedTextureIds.add(textureId);

      return {
        id: path.basename(filePath, path.extname(filePath)),
        kind: path.basename(filePath, path.extname(filePath)) === "MiniMap" ? "level" : "patch",
        module: source.module,
        level: source.level,
        floor: attributeValue(metadata, "Floor", 0),
        buildingId: attributeValue(metadata, "BuildingUUID", ""),
        triggerId: attributeValue(metadata, "TriggerId", ""),
        renderPatches: attributeValue(metadata, "RenderPatches", false),
        pixelBounds: {
          width: attributeValue(metadata, "Width", 0),
          height: attributeValue(metadata, "Height", 0),
        },
        worldBounds: {
          centerX: attributeValue(metadata, "WorldX", 0),
          centerY: attributeValue(metadata, "WorldZ", 0),
          width: attributeValue(metadata, "WorldWidth", 0),
          height: attributeValue(metadata, "WorldHeight", 0),
        },
        textureId: textureId || null,
        gTex: texture?.gTex ?? null,
        internalName: texture?.internalName ?? null,
        provenance: {
          sourcePath: source.relativePath,
          textureBankPath: texture ? path.basename(textureBankPath) : null,
        },
      };
    });

  const levels = [...Map.groupBy(records, (record) => `${record.module}/${record.level}`)]
    .map(([id, levelRecords]) => ({
      id,
      module: levelRecords[0].module,
      level: levelRecords[0].level,
      metadata: levelRecords.find((record) => record.kind === "level") ?? null,
      patches: levelRecords.filter((record) => record.kind === "patch"),
    }))
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
  const textures = [...new Map(records
    .filter((record) => record.gTex)
    .map((record) => [record.textureId, {
      id: record.textureId,
      gTex: record.gTex,
      internalName: record.internalName,
    }])).values()]
    .sort((left, right) => left.gTex.localeCompare(right.gTex, "en"));
  const catalog = {
    schemaVersion: 1,
    stats: {
      records: records.length,
      levels: levels.length,
      patches: records.filter((record) => record.kind === "patch").length,
      textures: textures.length,
      unresolvedTextures: unresolvedTextureIds.size,
    },
    unresolvedTextureIds: [...unresolvedTextureIds].sort(),
    textures,
    levels,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(textureListPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  fs.writeFileSync(textureListPath, `${JSON.stringify(textures.map(({ gTex }) => gTex), null, 2)}\n`);
  console.log(`World-map catalog: ${catalog.stats.levels} levels, ${catalog.stats.patches} patches, ${catalog.stats.textures} textures.`);
};

try {
  main();
} catch (error) {
  console.error("World-map catalog build failed:", error);
  process.exitCode = 1;
}
