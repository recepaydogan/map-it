import fs from "node:fs";
import path from "node:path";

const parseArguments = (arguments_) => {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    values.set(key.slice(2), value);
  }
  for (const required of ["source", "output"]) {
    if (!values.has(required)) throw new Error(`Missing required argument: --${required}`);
  }
  return values;
};

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });

const attributeValue = (object, name, fallback = null) => object?.[name]?.value ?? fallback;

const parseVector = (value) => {
  if (typeof value !== "string") return null;
  const values = value.trim().split(/\s+/).map(Number);
  return values.length === 3 && values.every(Number.isFinite)
    ? { x: values[0], y: values[1], z: values[2] }
    : null;
};

const sourceIdentity = (root, filePath) => {
  const relativePath = path.relative(root, filePath).split(path.sep).join("/");
  const parts = relativePath.split("/");
  const levelsIndex = parts.indexOf("Levels");
  return {
    module: levelsIndex > 0 ? parts[levelsIndex - 1] : "unknown",
    level: levelsIndex >= 0 ? parts[levelsIndex + 1] : "unknown",
    relativePath,
  };
};

const main = () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const sourceRoot = path.resolve(arguments_.get("source"));
  const outputPath = path.resolve(arguments_.get("output"));
  const records = [];
  let filesWithPortals = 0;
  const files = walkFiles(sourceRoot)
    .filter((filePath) => filePath.toLowerCase().endsWith(".lsj"))
    .sort((left, right) => left.localeCompare(right, "en"));

  for (const filePath of files) {
    const source = sourceIdentity(sourceRoot, filePath);
    const portals = JSON.parse(fs.readFileSync(filePath, "utf8"))?.save?.regions?.PortalData?.Portal;
    if (!Array.isArray(portals) || portals.length === 0) continue;
    filesWithPortals += 1;
    for (const portal of portals) {
      const connections = portal.Connection?.[0]?.Object;
      records.push({
        id: attributeValue(portal, "PortalUUID") || `${source.module}/${source.level}/${attributeValue(portal, "Id", records.length)}`,
        numericId: attributeValue(portal, "Id"),
        module: source.module,
        level: source.level,
        sourceRegionId: attributeValue(portal, "Region", ""),
        targetRegionId: attributeValue(portal, "TargetRegion", ""),
        sourcePosition: parseVector(attributeValue(portal, "Source")),
        targetPosition: parseVector(attributeValue(portal, "Target")),
        connections: Array.isArray(connections)
          ? connections.map((connection) => ({
            key: attributeValue(connection, "MapKey"),
            value: attributeValue(connection, "MapValue"),
          }))
          : [],
        provenance: { sourcePath: source.relativePath },
      });
    }
  }
  records.sort((left, right) => left.id.localeCompare(right.id, "en"));
  const catalog = {
    schemaVersion: 1,
    stats: {
      files: files.length,
      filesWithPortals,
      portals: records.length,
      levels: new Set(records.map((record) => `${record.module}/${record.level}`)).size,
    },
    portals: records,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Navigation portal catalog: ${records.length} portals across ${catalog.stats.levels} levels.`);
};

try {
  main();
} catch (error) {
  console.error("Navigation portal catalog build failed:", error);
  process.exitCode = 1;
}
