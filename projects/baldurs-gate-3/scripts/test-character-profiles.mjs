import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const catalog = readJson(path.join(projectRoot, "map-sources", "catalog", "gameplay-stats.json"));

const abilityNames = new Set(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]);
const resistanceTypes = new Set([
  "Bludgeoning", "Slashing", "Piercing", "Acid", "Cold", "Fire", "Force",
  "Lightning", "Necrotic", "Poison", "Psychic", "Radiant", "Thunder",
]);
const resistanceValues = new Set([
  "Immune", "ImmuneToNonMagical", "Resistant", "ResistantToNonMagical",
  "Resistant;Immune", "Vulnerable", "VulnerableToMagical",
]);

const positiveNumber = (value, label) => {
  assert(Number.isFinite(Number(value)) && Number(value) > 0, `${label} must be a positive number; received ${value}.`);
};

const profiles = Object.values(catalog.entries).filter((entry) => entry.combat);
assert(profiles.length >= 1_500, `Expected at least 1,500 resolved character combat profiles; received ${profiles.length}.`);
assert.equal(catalog.stats.combatProfiles, profiles.length, "Catalog combat profile count does not match its entries.");

for (const entry of profiles) {
  assert.equal(entry.type, "Character", `${entry.id} exposes a combat profile for a non-character stat type.`);
  const profile = entry.combat;
  for (const [field, value] of Object.entries({
    vitality: profile.vitality,
    baseArmor: profile.baseArmor,
    movement: profile.movement,
    darkvisionRange: profile.darkvisionRange,
  })) {
    if (value !== undefined) positiveNumber(value, `${entry.id}.${field}`);
  }
  for (const [ability, value] of Object.entries(profile.abilities ?? {})) {
    assert(abilityNames.has(ability), `${entry.id} contains unknown ability ${ability}.`);
    positiveNumber(value, `${entry.id}.abilities.${ability}`);
  }
  for (const resistance of profile.resistances ?? []) {
    assert(resistanceTypes.has(resistance.type), `${entry.id} contains unknown resistance type ${resistance.type}.`);
    assert(resistanceValues.has(resistance.value), `${entry.id} contains unknown resistance value ${resistance.value}.`);
  }
  for (const label of [...(profile.passives ?? []), ...(profile.statusImmunities ?? [])]) {
    assert(!label.includes("_"), `${entry.id} exposes an unformatted technical label: ${label}.`);
    assert(label.length <= 120, `${entry.id} exposes an excessively long combat label.`);
  }
}

const markerProfiles = [];
for (const directory of fs.readdirSync(path.join(projectRoot, "public", "maps"), { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(projectRoot, "public", "maps", directory.name, "content.json");
  if (!fs.existsSync(contentPath)) continue;
  const content = readJson(contentPath);
  for (const entity of Object.values(content.entities ?? {})) {
    if (entity.gameplay?.combat) markerProfiles.push(entity);
  }
}

assert(markerProfiles.length >= 700, `Expected combat profiles on at least 700 map markers; received ${markerProfiles.length}.`);
assert(markerProfiles.filter((entity) => entity.kind === "boss").length >= 5, "Expected combat profiles on extracted boss markers.");
assert(markerProfiles.filter((entity) => entity.gameplay.combat.resistances?.length).length >= 100, "Expected at least 100 marker profiles with defensive data.");
assert(markerProfiles.every((entity) => Object.keys(entity.gameplay.combat.abilities ?? {}).length === 6), "Every exposed marker combat profile should include all six inherited ability scores.");

console.log(`Character profiles: ${profiles.length} resolved stats; ${markerProfiles.length} map markers enriched.`);
