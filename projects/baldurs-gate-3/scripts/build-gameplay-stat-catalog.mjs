import fs from "node:fs";
import path from "node:path";
import { splitStatExpressions as splitValues } from "./lib/stat-expression-list.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const parseArguments = (arguments_) => {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    values.set(key.slice(2), value);
  }
  for (const required of ["source", "output"]) {
    if (!values.has(required)) throw new Error(`Missing required argument: --${required}`);
  }
  return values;
};

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});

const modulePriority = (filePath) => {
  const normalized = filePath.split(path.sep).join("/");
  if (normalized.includes("/Shared/")) return 0;
  if (normalized.includes("/SharedDev/")) return 1;
  if (normalized.includes("/Gustav/")) return 2;
  if (normalized.includes("/GustavDev/")) return 3;
  return 4;
};

const unescapeValue = (value) => value.replaceAll('\\"', '"').replaceAll("\\n", "\n").replaceAll("\\\\", "\\");

const parseFile = (filePath, sourceRoot) => {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const entries = [];
  let current = null;
  for (const line of lines) {
    const entryMatch = line.match(/^new entry "((?:\\"|[^"])*)"/);
    if (entryMatch) {
      if (current) entries.push(current);
      current = {
        id: unescapeValue(entryMatch[1]),
        type: "",
        parent: "",
        data: {},
        provenance: path.relative(sourceRoot, filePath).split(path.sep).join("/"),
      };
      continue;
    }
    if (!current) continue;
    const typeMatch = line.match(/^type "((?:\\"|[^"])*)"/);
    if (typeMatch) {
      current.type = unescapeValue(typeMatch[1]);
      continue;
    }
    const parentMatch = line.match(/^using "((?:\\"|[^"])*)"/);
    if (parentMatch) {
      current.parent = unescapeValue(parentMatch[1]);
      continue;
    }
    const dataMatch = line.match(/^data "((?:\\"|[^"])*)" "((?:\\"|[^"])*)"/);
    if (dataMatch) current.data[unescapeValue(dataMatch[1])] = unescapeValue(dataMatch[2]);
  }
  if (current) entries.push(current);
  return entries;
};

const uniqueValues = (values) => [...new Set(values)];

const abilityFields = {
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  intelligence: "Intelligence",
  wisdom: "Wisdom",
  charisma: "Charisma",
};

const resistanceFields = [
  "Bludgeoning",
  "Slashing",
  "Piercing",
  "Acid",
  "Cold",
  "Fire",
  "Force",
  "Lightning",
  "Necrotic",
  "Poison",
  "Psychic",
  "Radiant",
  "Thunder",
];

const humanizeIdentifier = (value) => value
  .replace(/^[A-Z0-9]{2,5}_(?=[A-Z][a-z])/, "")
  .replace(/_([A-Z0-9]{2,5})_(?=[A-Z][a-z])/g, "_")
  .replaceAll("_", " ")
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/\s+/g, " ")
  .trim()
  .replace(/^./, (character) => character.toUpperCase())
  .replace(/^([A-Z0-9 ]+)$/, (text) => text.toLocaleLowerCase("en-US").replace(/\b\w/g, (character) => character.toUpperCase()));

const parseMovement = (value) => {
  const movement = splitValues(value)
    .map((resource) => resource.split(":"))
    .find(([name]) => name === "Movement")?.[1];
  return movement && Number(movement) > 0 ? movement : undefined;
};

const positiveValue = (value) => value && Number(value) > 0 ? value : undefined;

const createCombatProfile = (entry) => {
  if (entry.type !== "Character") return undefined;
  const abilities = Object.fromEntries(Object.entries(abilityFields)
    .map(([key, field]) => [key, entry.data[field]])
    .filter(([, value]) => Number(value) > 0));
  const resistances = resistanceFields
    .map((type) => ({ type, value: entry.data[`${type}Resistance`] }))
    .filter(({ value }) => value && value !== "None");
  const statusImmunities = uniqueValues(splitValues(entry.data.PersonalStatusImmunities)
    .filter((value) => !value.startsWith("SG_"))
    .filter((value) => !/(?:^|_)(?:TECHNICAL|REAPPLY|DUMMY)(?:_|$)/.test(value))
    .filter((value) => !/^\d+$/.test(value))
    .map(humanizeIdentifier));
  const passives = uniqueValues(splitValues(entry.data.Passives).map(humanizeIdentifier));
  const profile = {
    vitality: positiveValue(entry.data.Vitality),
    baseArmor: positiveValue(entry.data.Armor),
    abilities: Object.keys(abilities).length > 0 ? abilities : undefined,
    spellCastingAbility: entry.data.SpellCastingAbility && entry.data.SpellCastingAbility !== "None"
      ? entry.data.SpellCastingAbility
      : undefined,
    movement: parseMovement(entry.data.ActionResources),
    darkvisionRange: positiveValue(entry.data.DarkvisionRange),
    resistances: resistances.length > 0 ? resistances : undefined,
    statusImmunities: statusImmunities.length > 0 ? statusImmunities : undefined,
    passives: passives.length > 0 ? passives : undefined,
  };
  const compact = Object.fromEntries(Object.entries(profile).filter(([, value]) => value !== undefined));
  return Object.keys(compact).length > 0 ? compact : undefined;
};

const main = () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const sourceRoot = path.resolve(arguments_.get("source"));
  const outputPath = path.resolve(arguments_.get("output"));
  const sourceBuild = arguments_.get("source-build") ?? undefined;
  const files = walkFiles(sourceRoot)
    .filter((filePath) => filePath.toLowerCase().endsWith(".txt"))
    .sort((left, right) => modulePriority(left) - modulePriority(right) || left.localeCompare(right, "en"));
  const rawEntries = new Map();
  for (const filePath of files) {
    for (const entry of parseFile(filePath, sourceRoot)) {
      const previous = rawEntries.get(entry.id);
      if (!previous) {
        rawEntries.set(entry.id, entry);
        continue;
      }
      rawEntries.set(entry.id, {
        ...previous,
        ...entry,
        type: entry.type || previous.type,
        parent: entry.parent && entry.parent !== entry.id ? entry.parent : previous.parent,
        data: { ...previous.data, ...entry.data },
      });
    }
  }

  const resolvedEntries = new Map();
  const resolveEntry = (id, stack = new Set()) => {
    if (resolvedEntries.has(id)) return resolvedEntries.get(id);
    const raw = rawEntries.get(id);
    if (!raw || stack.has(id)) return null;
    stack.add(id);
    const parent = raw.parent ? resolveEntry(raw.parent, stack) : null;
    stack.delete(id);
    const data = { ...(parent?.data ?? {}), ...raw.data };
    const resolved = { ...raw, type: raw.type || parent?.type || "", data };
    resolvedEntries.set(id, resolved);
    return resolved;
  };
  for (const id of rawEntries.keys()) resolveEntry(id);

  const entries = {};
  const byRootTemplate = {};
  let combatProfiles = 0;
  for (const entry of resolvedEntries.values()) {
    const rootTemplate = entry.data.RootTemplate || "";
    const combat = createCombatProfile(entry);
    if (combat) combatProfiles += 1;
    const publicEntry = {
      id: entry.id,
      type: entry.type,
      parent: entry.parent || undefined,
      rootTemplate: rootTemplate || undefined,
      rarity: entry.data.Rarity || undefined,
      slot: entry.data.Slot || undefined,
      armorClass: entry.data.ArmorClass || undefined,
      armorType: entry.data.ArmorType || undefined,
      weaponType: entry.data.WeaponType || entry.data.WeaponGroup || undefined,
      damage: entry.data.Damage || undefined,
      damageType: entry.data["Damage Type"] || entry.data.DamageType || undefined,
      proficiency: entry.data["Proficiency Group"] || undefined,
      unique: entry.data.Unique === "1",
      weight: entry.data.Weight || undefined,
      value: entry.data.ValueOverride || entry.data.Value || undefined,
      boosts: splitValues(entry.data.Boosts || entry.data.DefaultBoosts),
      passives: splitValues(entry.data.PassivesOnEquip),
      requirements: splitValues(entry.data.Requirements),
      combat,
      provenance: entry.provenance,
    };
    entries[entry.id] = Object.fromEntries(Object.entries(publicEntry).filter(([, value]) => value !== undefined));
    if (rootTemplate) (byRootTemplate[rootTemplate] ??= []).push(entry.id);
  }
  for (const ids of Object.values(byRootTemplate)) ids.sort((left, right) => left.localeCompare(right, "en"));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  writeGeneratedFile(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    sourceBuild,
    stats: {
      files: files.length,
      entries: Object.keys(entries).length,
      rootTemplates: Object.keys(byRootTemplate).length,
      combatProfiles,
    },
    entries,
    byRootTemplate,
  }, null, 2)}\n`);
  console.log(`Gameplay stats: ${files.length} files, ${Object.keys(entries).length} resolved entries, ${Object.keys(byRootTemplate).length} root templates.`);
};

try {
  main();
} catch (error) {
  console.error("Gameplay stat catalog build failed:", error);
  process.exitCode = 1;
}
