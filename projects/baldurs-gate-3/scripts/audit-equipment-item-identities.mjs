import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Deliberately independent of native-item-stats, equipment and identity helpers.
const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 5) throw new Error("Usage: node scripts/audit-equipment-item-identities.mjs <catalog> <baseline-items> <report>");
const [catalogPath, baselinePath, outputPath] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, errors = [], proofs = [];
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const text = (file) => {
  const absolute = path.resolve(root, file), bytes = fs.readFileSync(absolute), key = relative(absolute);
  const hash = digest(bytes);
  if (hashes[key] && hashes[key] !== hash) throw new Error(`Audit input changed: ${key}`);
  hashes[key] = hash;
  return bytes.toString("utf8");
};
const read = (file) => JSON.parse(text(file));
const check = (condition, message) => { if (!condition) errors.push(message); };
const catalog = read(catalogPath), equipment = read(catalog.inputs.equipmentCatalog);
const database = read(catalog.inputs.itemDatabase), baseline = read(baselinePath);
check(catalog.sourceBuild === equipment.sourceBuild && catalog.sourceBuild === database.sourceBuild, "Source build mismatch");
for (const [file, hash] of Object.entries(catalog.hashes)) check(digest(text(file)) === hash, `Stale catalog dependency: ${file}`);

const nativeDefinitions = {}, sourceReferences = new Map();
for (const [file, hash] of Object.entries(equipment.sourceHashes)) {
  const source = text(file), lines = source.split(/\r?\n/);
  check(digest(source) === hash, `Stale equipment source: ${file}`);
  let definition;
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("//")) continue;
    const values = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
    if (line.startsWith("new equipment ")) {
      check(!nativeDefinitions[values[0]], `Duplicate equipment definition: ${values[0]}`);
      definition = { id: values[0], sourcePath: file, sourceLine: index + 1, groups: [] };
      nativeDefinitions[definition.id] = definition;
    } else if (definition && line.startsWith("add initialweaponset ")) definition.initialWeaponSet = values[0];
    else if (definition && line === "add equipmentgroup") definition.groups.push({ sourceLine: index + 1, entries: [] });
    else if (definition?.groups.length && line.startsWith("add equipment entry ")) {
      definition.groups.at(-1).entries.push({ statsId: values[0], sourceLine: index + 1 });
      sourceReferences.set(`${file}:${index + 1}`, values[0]);
    } else throw new Error(`Unrecognized equipment row: ${file}:${index + 1}`);
  }
}
check(isDeepStrictEqual(nativeDefinitions, equipment.definitions), "Authored equipment catalog differs from native definitions");
check(isDeepStrictEqual(nativeDefinitions, catalog.definitions), "Resolved equipment catalog changes native group/entry evidence");

const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
const modules = ["Shared", "SharedDev", "Gustav", "GustavDev", "Honour", "GustavX"];
const priority = (file) => { const index = modules.findIndex((module) => file.includes(`${path.sep}${module}${path.sep}`)); return index < 0 ? 99 : index; };
const allStatFiles = walk(path.resolve(root, catalog.inputs.statsRoot));
const statFiles = allStatFiles.filter((file) => /(?:Armor|Object|Weapon|Passive|Spell_[^/\\]+)\.txt$/i.test(file))
  .sort((left, right) => priority(left) - priority(right) || left.localeCompare(right, "en"));
const progressionFiles = allStatFiles.filter((file) => path.basename(file) === "ItemProgressionVisuals.txt")
  .sort((left, right) => priority(left) - priority(right) || left.localeCompare(right, "en"));
check(isDeepStrictEqual(statFiles.map(relative), catalog.inputs.stats), "Incomplete or reordered native Stats inputs");
check(isDeepStrictEqual(progressionFiles.map(relative), catalog.inputs.progression), "Incomplete native progression inputs");
for (const file of [...statFiles, ...progressionFiles].map(relative)) check(Boolean(catalog.hashes[file]), `Unhashed native identity input: ${file}`);
const stats = new Map();
const unquote = (value) => value.replaceAll('\\"', '"').replaceAll("\\n", "\n").replaceAll("\\\\", "\\");
for (const file of statFiles) {
  const lines = text(file).split(/\r?\n/), starts = [];
  for (const [index, line] of lines.entries()) if (line.startsWith('new entry "')) starts.push(index);
  for (const [offset, start] of starts.entries()) {
    const id = unquote(lines[start].match(/^new entry "((?:\\"|[^"])*)"/)[1]);
    const current = { id, type: "", parent: "", data: {}, evidence: {} };
    for (let index = start + 1; index < (starts[offset + 1] ?? lines.length); index++) {
      const line = lines[index], values = [...line.matchAll(/"((?:\\"|[^"])*)"/g)].map((match) => unquote(match[1]));
      if (line.startsWith("using ")) current.parent = values[0];
      else if (line.startsWith("type ")) current.type = values[0];
      else if (line.startsWith("data ") && values.length === 2) {
        current.data[values[0]] = values[1];
        current.evidence[values[0]] = { sourcePath: relative(file), sourceLine: index + 1 };
      }
    }
    const previous = stats.get(id);
    if (current.parent === id && previous) {
      current.parent = previous.parent;
      current.data = { ...previous.data, ...current.data };
      current.evidence = { ...previous.evidence, ...current.evidence };
    }
    stats.set(id, current);
  }
}
const resolveStat = (id, visited = new Set()) => {
  if (visited.has(id)) throw new Error(`Native stat cycle: ${id}`);
  const stat = stats.get(id);
  if (!stat) return undefined;
  const parent = stat.parent ? resolveStat(stat.parent, new Set([...visited, id])) : undefined;
  return { ...stat, type: stat.type || parent?.type, data: { ...parent?.data, ...stat.data }, evidence: { ...parent?.evidence, ...stat.evidence } };
};
const progressions = new Map();
for (const file of progressionFiles) {
  let group, level, selection;
  for (const raw of text(file).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("//")) continue;
    const quoted = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
    if (line.startsWith("new itemgroup ")) {
      check(!progressions.has(quoted[0]), `Duplicate progression: ${quoted[0]}`);
      group = []; progressions.set(quoted[0], group); level = selection = undefined;
    } else if (group && line.startsWith("add levelgroup ")) {
      const numbers = line.match(/^add levelgroup (\d+),(\d+),/);
      level = { minimum: Number(numbers[1]), maximum: Number(numbers[2]), rarity: quoted[0], roots: [] }; group.push(level);
    } else if (level && line.startsWith("add rootgroup ")) {
      selection = { root: quoted[0].toLowerCase(), color: quoted[1], names: [] }; level.roots.push(selection);
    } else if (selection && line.startsWith("add namegroup ")) selection.names.push(quoted);
    else throw new Error(`Unrecognized progression row: ${file}: ${line}`);
  }
}
const nativeIds = [...new Set(sourceReferences.values())].sort();
const checkItemStats = (item, stat) => {
  check(item.type === stat?.type && item.rarity === (stat?.data.Rarity || "Common")
    && item.unique === (stat?.data.Unique === "1"), `Item metadata uses wrong Stats: ${item.id}`);
  for (const [field, value] of Object.entries(item.properties)) {
    check(value === stat?.data[field], `Item property differs from native Stats: ${item.id}/${field}`);
  }
  // Check important omissions as well as the correctness of fields that happen
  // to be present. These native attributes are not excluded from public data.
  for (const field of ["Damage", "Damage Type", "DamageType", "Boosts", "DefaultBoosts", "BoostsOnEquipMainHand",
    "BoostsOnEquipOffHand", "PassivesOnEquip", "UseConditions", "InstrumentType", "Slot", "ItemGroup", "Unique", "Rarity"]) {
    if (stat?.data[field]) check(item.properties[field] === stat.data[field], `Native gameplay property omitted: ${item.id}/${field}`);
  }
  check(item.gameplay.slot === (stat?.data.Slot || undefined) && item.gameplay.damage === (stat?.data.Damage || undefined), `Wrong equipment slot/damage: ${item.id}`);
};
check(isDeepStrictEqual(nativeIds, Object.keys(catalog.references).sort()), "Missing or spurious equipment references");
for (const id of nativeIds) {
  const reference = catalog.references[id], stat = resolveStat(id);
  const rootId = stat?.data.RootTemplate?.toLowerCase(), itemGroup = stat?.data.ItemGroup || undefined;
  const group = progressions.get(itemGroup), level = group?.[0], selection = level?.roots[0];
  const fixedGroup = group?.length === 1 && level.minimum === 0 && level.maximum === 0 && level.rarity === "All"
    && level.roots.length === 1 && selection.root === rootId && selection.color === "" && selection.names.length === 1
    && selection.names[0][1] === "" && selection.names[0][2] === "";
  const exactItems = database.items.filter((item) => item.statsId === id && item.templateIds.includes(rootId));
  const resolved = (!itemGroup || fixedGroup) && exactItems.length === 1 && ["Weapon", "Armor", "Object"].includes(stat?.type);
  check(reference?.statsId === id && reference.rootTemplateId === rootId && reference.itemGroup === itemGroup, `Native identity fields differ: ${id}`);
  check(reference?.status === (resolved ? "resolved" : "review"), `Incorrect resolution status: ${id}`);
  check(isDeepStrictEqual(reference?.itemIds, resolved ? exactItems.map(({ id }) => id) : []), `Incorrect fixed item IDs: ${id}`);
  if (resolved) check(reference.mode === (fixedGroup ? "matching-progression-root" : "explicit-root"), `Incorrect fixed identity route: ${id}`);
  for (const item of exactItems) checkItemStats(item, stat);
  const possibleRoots = itemGroup && group && rootId ? new Set([rootId, ...group.flatMap(({ roots }) => roots.map(({ root }) => root))]) : undefined;
  const candidates = database.items.filter((item) => item.statsId === id && (!possibleRoots || item.templateIds.some((id) => possibleRoots.has(id))));
  if (!resolved) check(isDeepStrictEqual(reference?.candidateItemIds, candidates.map(({ id }) => id)), `Review candidates dropped or invented: ${id}`);
  proofs.push({ statsId: id, status: resolved ? "resolved" : "review", rootTemplateId: rootId, itemGroup,
    itemIds: resolved ? exactItems.map(({ id }) => id) : [], evidence: { root: stat?.evidence.RootTemplate, itemGroup: stat?.evidence.ItemGroup } });
}

const before = new Map(baseline.items.map((item) => [item.id, item]));
const after = new Map(database.items.map((item) => [item.id, item]));
check(before.size === baseline.items.length && after.size === database.items.length, "Duplicate item identities");
for (const item of baseline.items) check(isDeepStrictEqual(item, after.get(item.id)), `Pre-existing item changed or lost: ${item.id}`);
const added = database.items.filter(({ id }) => !before.has(id));
const templateCatalog = read("map-sources/catalog/root-templates.json").templates, templatesByFile = new Map();
const templateField = (id, field, visited = new Set()) => {
  if (visited.has(id)) throw new Error(`Native template cycle: ${id}`);
  const metadata = templateCatalog[id];
  if (!metadata) return undefined;
  const file = `map-sources/extracted/root-templates/${metadata.provenance}`;
  if (!templatesByFile.has(file)) templatesByFile.set(file, new Map((read(file).save?.regions?.Templates?.GameObjects ?? []).map((entry) => [entry.MapKey?.value, entry])));
  const template = templatesByFile.get(file).get(id);
  if (!template) throw new Error(`Missing native template: ${id}`);
  return Object.hasOwn(template, field) ? template[field] : templateField(template.ParentTemplateId?.value, field, new Set([...visited, id]));
};
for (const item of added) {
  const generation = item.generation, stat = resolveStat(item.statsId);
  check(generation?.origin === "equipment-entry", `Unrelated item addition: ${item.id}`);
  check(sourceReferences.get(`${generation?.sourcePath}:${generation?.sourceLine}`) === item.statsId, `Missing native entry evidence: ${item.id}`);
  check(generation?.rootTemplateId === stat?.data.RootTemplate?.toLowerCase(), `Added item root differs from inherited native root: ${item.id}`);
  check(item.id === `${generation?.rootTemplateId}:stats:${item.statsId}` && isDeepStrictEqual(item.templateIds, [generation?.rootTemplateId]), `Added item identity differs: ${item.id}`);
  check(templateField(generation?.rootTemplateId, "Type")?.value === "item"
    && templateField(generation?.rootTemplateId, "Stats")?.value === generation?.templateStatsId, `Wrong template-default identity: ${item.id}`);
  checkItemStats(item, stat);
  check(item.acquisitions.length === 0 && !item.crafting, `Identity-only extension invents acquisition/crafting: ${item.id}`);
}
for (const [file, expected] of Object.entries(hashes)) check(digest(fs.readFileSync(path.resolve(root, file))) === expected, `Audit source changed: ${file}`);
const report = { scope: "Independent native equipment, Stats inheritance, progression and fixed-root identity checks; complete baseline item conservation and native evidence for each new equipment variant. Does not prove current-scene possession or lootability.",
  catalogPath: relative(catalogPath), baselinePath: relative(baselinePath),
  stats: { definitions: Object.keys(nativeDefinitions).length, entryRows: sourceReferences.size, references: nativeIds.length,
    resolvedReferences: proofs.filter(({ status }) => status === "resolved").length, reviewReferences: proofs.filter(({ status }) => status === "review").length,
    preservedItems: baseline.items.length, preservedAcquisitions: baseline.items.reduce((sum, item) => sum + item.acquisitions.length, 0), addedVariants: added.length },
  proofs, addedItemIds: added.map(({ id }) => id), hashes, errors };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
writeGeneratedFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats: report.stats, errorCount: errors.length, errors: errors.slice(0, 25) }, null, 2));
if (errors.length) process.exitCode = 1;
