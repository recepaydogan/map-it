import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(projectRoot, "map-sources", "extracted", "story-goals", "Gustav", "Act1_UND_AdamantineForge.txt");
const placementPath = path.join(projectRoot, "map-sources", "converted", "wld-placements", "Mods", "Gustav", "Levels", "WLD_Main_A", "Items", "_merged.lsj");
const waypointSourcePath = path.join(projectRoot, "map-sources", "extracted", "story-goals", "Gustav", "_Gustav_Waypoints_Act1.txt");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "adamantine-forge.json");
const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const resultTitles = {
  UNI_BLD_AdamantineForge_Scalemail: "Adamantine Scale Mail",
  UNI_BLD_AdamantineForge_Splint: "Adamantine Splint Armour",
  UNI_BLD_AdamantineForge_Mace: "Adamantine Mace",
  UNI_BLD_AdamantineForge_Longsword: "Adamantine Longsword",
  UNI_BLD_AdamantineForge_Scimitar: "Adamantine Scimitar",
  UNI_BLD_AdamantineForge_Shield: "Adamantine Shield",
};

const splitArguments = (statement) => {
  const body = statement.slice(statement.indexOf("(") + 1, statement.lastIndexOf(")"));
  const output = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  for (const character of body) {
    if (character === '"') quoted = !quoted;
    if (!quoted && character === "(") depth += 1;
    if (!quoted && character === ")") depth -= 1;
    if (!quoted && depth === 0 && character === ",") {
      output.push(current.trim());
      current = "";
    } else current += character;
  }
  output.push(current.trim());
  return output;
};
const guidFrom = (value) => value.match(guidPattern)?.[0]?.toLocaleLowerCase("en-US");
const tokenFrom = (value) => value.replace(/^\([A-Z]+\)/, "").replace(/^"|"$/g, "").trim();

const lines = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/);
let forge = null;
let moldChamber = null;
let forgeAnchor = null;
const recipes = [];
for (let index = 0; index < lines.length; index += 1) {
  const statement = lines[index].trim();
  if (!forgeAnchor && statement.startsWith("DualEntityEvent(") && statement.includes("S_UND_AdamantineForge_LavaValve_")) {
    forgeAnchor = {
      objectId: guidFrom(statement),
      token: statement.match(/S_UND_AdamantineForge_LavaValve_[A-Za-z0-9-]+/)?.[0],
      evidence: { sourcePath: path.relative(projectRoot, sourcePath).split(path.sep).join("/"), sourceLine: index + 1, statement },
    };
  }
  if (statement.startsWith("DB_UND_AdamantineForgeReceptacle(")) {
    const arguments_ = splitArguments(statement);
    const kind = tokenFrom(arguments_[0] ?? "");
    const objectId = guidFrom(arguments_[1] ?? "");
    if (!objectId) continue;
    const entry = {
      objectId,
      token: tokenFrom(arguments_[1]),
      emptyTemplateId: guidFrom(arguments_[3] ?? ""),
      evidence: { sourcePath: path.relative(projectRoot, sourcePath).split(path.sep).join("/"), sourceLine: index + 1, statement },
    };
    if (kind === "Crucible") forge = entry;
    if (kind === "Mold") moldChamber = entry;
  }
  if (statement.startsWith("DB_UND_AdamantineForge_Result(")) {
    const arguments_ = splitArguments(statement);
    const statId = tokenFrom(arguments_[0] ?? "");
    const resultTemplateId = guidFrom(arguments_[1] ?? "");
    const moldTemplateId = guidFrom(arguments_[2] ?? "");
    const spawnPointId = guidFrom(arguments_[3] ?? "");
    if (!statId || !resultTemplateId || !moldTemplateId || !spawnPointId) continue;
    recipes.push({
      id: `adamantine-forge:${statId}`,
      statId,
      title: resultTitles[statId] ?? statId.replace(/^UNI_BLD_AdamantineForge_/, "Adamantine "),
      resultTemplateId,
      moldTemplateId,
      spawnPointId,
      evidence: { sourcePath: path.relative(projectRoot, sourcePath).split(path.sep).join("/"), sourceLine: index + 1, statement },
    });
  }
}

if (!forge || !moldChamber || !forgeAnchor?.objectId || recipes.length !== 6) {
  throw new Error(`Incomplete Adamantine Forge extraction: forge=${Boolean(forge)}, mold=${Boolean(moldChamber)}, anchor=${Boolean(forgeAnchor)}, recipes=${recipes.length}.`);
}

const mithralVeins = [];
const collectMithralVeins = (value) => {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value) && /^S_UND_MithralVein\d?$/.test(value.Name?.value ?? "")) {
    const position = value.Transform?.[0]?.Position?.value?.split(/\s+/).map(Number);
    mithralVeins.push({
      objectId: value.MapKey?.value?.toLocaleLowerCase("en-US"),
      internalName: value.Name.value,
      ...(position?.length === 3 ? { worldPosition: { x: position[0], y: position[1], z: position[2] } } : {}),
      sourcePath: path.relative(projectRoot, placementPath).split(path.sep).join("/"),
    });
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) collectMithralVeins(child);
};
collectMithralVeins(JSON.parse(fs.readFileSync(placementPath, "utf8")));
if (mithralVeins.length !== 2 || mithralVeins.some(({ objectId }) => !objectId)) {
  throw new Error(`Expected exactly two placed Mithral Veins; received ${mithralVeins.length}.`);
}
const waypointLines = fs.readFileSync(waypointSourcePath, "utf8").split(/\r?\n/);
const waypointLineIndex = waypointLines.findIndex((line) => line.includes('DB_WaypointInfo("Act1","WAYP_UND_AdamantineForge"'));
const waypointStatement = waypointLines[waypointLineIndex]?.trim() ?? "";
const waypointArguments = splitArguments(waypointStatement);
const mapAnchor = {
  objectId: guidFrom(waypointArguments[2] ?? ""),
  token: tokenFrom(waypointArguments[2] ?? ""),
  evidence: {
    sourcePath: path.relative(projectRoot, waypointSourcePath).split(path.sep).join("/"),
    sourceLine: waypointLineIndex + 1,
    statement: waypointStatement,
  },
};
if (!mapAnchor.objectId) throw new Error("Adamantine Forge waypoint anchor was not found.");

const catalog = {
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: { recipes: recipes.length, moldTemplates: new Set(recipes.map(({ moldTemplateId }) => moldTemplateId)).size, mithralVeins: mithralVeins.length },
  forge,
  forgeAnchor,
  mapAnchor,
  moldChamber,
  mithralOre: { statsId: "UNI_PUZ_MithralOre", title: "Mithral Ore", veins: mithralVeins },
  recipes,
  byMoldTemplate: Object.fromEntries(recipes.map((recipe) => [recipe.moldTemplateId, recipe])),
};
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Adamantine Forge: ${catalog.stats.recipes} exact mold-to-result recipes cataloged.`);
