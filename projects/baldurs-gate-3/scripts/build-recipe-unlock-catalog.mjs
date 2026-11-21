import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "config", "placement-maps.json"), "utf8"));
const outputPath = path.join(projectRoot, "map-sources", "catalog", "recipe-unlocks.json");

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});

const attributeValue = (object, name, fallback = null) => object?.[name]?.value ?? fallback;
const parsePosition = (object) => {
  const values = object?.Transform?.[0]?.Position?.value?.trim().split(/\s+/).map(Number);
  return values?.length === 3 && values.every(Number.isFinite)
    ? { x: values[0], y: values[1], z: values[2] }
    : null;
};
const recipeIds = (object) => (object?.OnUsePeaceActions ?? [])
  .flatMap((group) => group?.Action ?? [])
  .flatMap((action) => action?.Attributes ?? [])
  .map((attributes) => attributeValue(attributes, "RecipeID", ""))
  .filter(Boolean);

const entries = new Map();
for (const relativeRoot of Object.values(config.placementRoots)) {
  const root = path.join(projectRoot, relativeRoot);
  for (const filePath of walkFiles(root).filter((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(".lsj"))) {
    const objects = JSON.parse(fs.readFileSync(filePath, "utf8"))?.save?.regions?.Templates?.GameObjects;
    if (!Array.isArray(objects)) continue;
    for (const object of objects) {
      const recipes = recipeIds(object);
      if (recipes.length === 0) continue;
      const id = attributeValue(object, "MapKey", "").toLocaleLowerCase("en-US");
      if (!id) continue;
      const current = entries.get(id) ?? {
        id,
        internalName: attributeValue(object, "Name", ""),
        level: attributeValue(object, "LevelName", ""),
        position: parsePosition(object),
        recipeIds: [],
        provenance: [],
      };
      current.recipeIds = [...new Set([...current.recipeIds, ...recipes])];
      current.provenance.push({ sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/") });
      entries.set(id, current);
    }
  }
}

const catalog = {
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: { items: entries.size, recipes: new Set([...entries.values()].flatMap((entry) => entry.recipeIds)).size },
  entries: Object.fromEntries([...entries.entries()].sort(([left], [right]) => left.localeCompare(right, "en"))),
};
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Recipe unlock catalog: ${catalog.stats.items} placed items unlock ${catalog.stats.recipes} recipes.`);
