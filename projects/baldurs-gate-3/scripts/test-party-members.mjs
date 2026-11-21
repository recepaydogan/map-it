import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"));
const catalog = readJson("map-sources/catalog/party-members.json");

assert.equal(catalog.schemaVersion, 1);
assert.equal(catalog.stats.members, 10, "Unexpected party-member count.");
const member = (id) => catalog.members.find((candidate) => candidate.id === id);

const shadowheart = member("shadowheart");
assert.equal(shadowheart.localizedNames.en, "Shadowheart");
assert.equal(shadowheart.race.localizedNames.en, "Half-Elf");
assert.equal(shadowheart.subRace.localizedNames.en, "High Half-Elf");
assert.equal(shadowheart.class.localizedNames.en, "Cleric");
assert.equal(shadowheart.subClass.localizedNames.en, "Trickery Domain");
assert.deepEqual(shadowheart.quests.map(({ localizedTitles }) => localizedTitles.en), ["Daughter of Darkness"]);
assert.deepEqual(shadowheart.positions.map(({ id }) => id), ["default", "nautiloid-pod", "rescued", "grove-gate"]);
assert.ok(shadowheart.positions.filter(({ kind }) => kind === "story").every(({ evidence }) => evidence.length > 0
  && evidence.every(({ sourcePath, sourceLine, statement }) => sourcePath && Number.isInteger(sourceLine) && statement)),
  "Every story position must cite exact story evidence.");

assert.equal(member("karlach").class.localizedNames.en, "Barbarian");
assert.equal(member("karlach").subRace.localizedNames.en, "Zariel Tiefling");
assert.equal(member("laezel").positions.length, 2, "Lae'zel has the cage and the githyanki patrol.");
assert.equal(member("wyll").authoredPosition, false, "Wyll's authored placement is an off-map holding spot.");
assert.equal(member("halsin").positions.length, 2, "Halsin has the worg pens and the grove gate.");

const mapData = (mapId) => ({
  locations: readJson(`public/maps/${mapId}/locations.json`).locations,
  entities: readJson(`public/maps/${mapId}/content.json`).entities,
});
const location = (data, id) => data.locations.find((candidate) => candidate.id === id);
const entity = (data, id) => data.entities.find((candidate) => candidate.id === id);

const wilderness = mapData("wilderness");
const expectPartyMarker = (data, contentId, label) => {
  const marker = location(data, contentId);
  assert.ok(marker, `${label} marker is missing.`);
  assert.equal(marker.category, "party-member", `${label} must use the party-member category.`);
  const content = entity(data, contentId);
  assert.ok(content?.partyMember, `${label} content is missing its party-member profile.`);
  assert.equal(content.partyMember.positions.find(({ contentId: id }) => id === contentId)?.id, content.partyMember.currentPositionId,
    `${label} must know which curated position it represents.`);
  return content.partyMember;
};

for (const memberId of ["astarion", "gale", "karlach"]) {
  expectPartyMarker(wilderness, member(memberId).characterId, member(memberId).localizedNames.en);
}
const shadowheartDefault = expectPartyMarker(wilderness, shadowheart.characterId, "Shadowheart (default)");
assert.equal(shadowheartDefault.currentPositionId, "default");
const rescuedId = shadowheart.positions.find(({ id }) => id === "rescued").contentId;
assert.equal(expectPartyMarker(wilderness, rescuedId, "Shadowheart (rescued)").currentPositionId, "rescued");
const groveGateId = shadowheart.positions.find(({ id }) => id === "grove-gate").contentId;
expectPartyMarker(wilderness, groveGateId, "Shadowheart (grove gate)");
const podId = shadowheart.positions.find(({ id }) => id === "nautiloid-pod").contentId;
expectPartyMarker(mapData("nautiloid"), podId, "Shadowheart (nautiloid pod)");
assert.equal(location(wilderness, podId), undefined, "The nautiloid pod position must not leak onto the wilderness map.");

for (const position of member("laezel").positions) expectPartyMarker(wilderness, position.contentId, `Lae'zel (${position.id})`);
for (const position of member("wyll").positions) expectPartyMarker(wilderness, position.contentId, `Wyll (${position.id})`);
assert.equal(location(wilderness, member("wyll").characterId), undefined, "Wyll's holding spot must not become a marker.");
const halsinPosition = (id) => member("halsin").positions.find((position) => position.id === id).contentId;
expectPartyMarker(wilderness, halsinPosition("grove-gate"), "Halsin (grove gate)");
expectPartyMarker(mapData("worg-pens"), halsinPosition("worg-pens"), "Halsin (worg pens)");
assert.equal(wilderness.locations.filter(({ name }) => name === "Halsin").length, 1,
  "The mined Halsin destination must be replaced by the curated grove position.");
expectPartyMarker(mapData("shadow-cursed-lands"), member("jaheira").characterId, "Jaheira");

const minthara = location(mapData("shattered-sanctum"), member("minthara").characterId);
assert.ok(minthara, "Minthara marker is missing.");
assert.equal(minthara.category, "boss", "Minthara keeps her boss marker.");
assert.ok(minthara.categoryFacets?.includes("party-member"), "Minthara must also answer the party-member filter.");

// Loot taxonomy: ground items are split by item category, carried items stay
// valuable, world objects are never items, and uncommon-or-better gear carries
// its unique-equipment facet.
const pickable = wilderness.locations.filter(({ category }) => category.startsWith("item-"));
assert.ok(pickable.length > 0, "Ground loot must use an item category.");
const everyCategory = new Set(fs.readdirSync(path.join(projectRoot, "public", "maps"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(projectRoot, "public", "maps", entry.name, "locations.json")))
  .flatMap((entry) => mapData(entry.name).locations.map(({ category }) => category)));
for (const expected of ["item-weapons", "item-shields", "item-armor", "item-accessories", "item-potions", "item-scrolls", "item-books", "item-quest-items", "interactable"]) {
  assert.ok(everyCategory.has(expected), `${expected} markers are missing.`);
}
assert.ok(pickable.every(({ categoryFacets }) => !categoryFacets?.includes("carried-item")),
  "A carried item can never be a pickable item.");
assert.ok(!pickable.some(({ name }) => /^(?:Gilded|Rustic|Heavy|Wooden) Chest$|^Wooden (?:Barrel|Door|Crate)$|^Lever$/.test(name)),
  "Containers, doors and levers are world objects, not pickable items.");
assert.ok(wilderness.locations.some(({ category, categoryFacets }) => category === "valuable-item" && categoryFacets?.includes("carried-item")),
  "Carried valuable items keep the valuable-item category.");
const uniqueFacets = new Set(wilderness.locations.flatMap(({ categoryFacets }) => (categoryFacets ?? []).filter((facet) => facet.startsWith("unique-"))));
assert.ok(uniqueFacets.has("unique-weapon") && uniqueFacets.has("unique-armor"), "Unique weapons and armour facets are missing.");

// Corpses are lootable bodies, not characters or enemies.
const corpses = wilderness.locations.filter(({ category }) => category === "corpse");
assert.ok(corpses.some(({ name }) => name === "Dead Goblin"), "Dead goblins are corpses.");
assert.ok(!wilderness.locations.some(({ category, name }) => (category === "npc" || category === "enemy") && /^Dead /.test(name)),
  "No dead body may remain on the character or enemy layers.");
const grymforge = mapData("grymforge");
assert.ok(grymforge.locations.some(({ category, contentId }) => category === "corpse"
  && entity(grymforge, contentId)?.internalName === "S_UND_DarkJusticiar_Dead_01"),
  "A body identified as dead by its authored internal name must remain a corpse even when its display name is only Skeleton.");

// Enemies: hostile creatures leave the plain character layer.
const enemies = wilderness.locations.filter(({ category }) => category === "enemy");
assert.ok(enemies.length > 0, "Hostile creatures must use the enemy category.");
assert.ok(enemies.some(({ name }) => /harpy/i.test(name)), "Harpies are enemies.");
assert.ok(wilderness.locations.some(({ category }) => category === "npc"), "Peaceful characters stay on the character layer.");
for (const [mapId, name] of [
  ["underdark", "Omeluum"],
  ["nautiloid", "Us"],
  ["murder-tribunal", "Valeria"],
  ["shadow-cursed-lands", "Halsin"],
]) {
  const marker = mapData(mapId).locations.find((candidate) => candidate.name === name);
  assert.ok(marker, `${name} marker is missing from ${mapId}.`);
  assert.notEqual(marker.category, "enemy", `${name} must not become an enemy because of creature family or an allied combat group.`);
}
assert.ok(mapData("dank-crypt").locations.some(({ category, name }) => category === "enemy" && name === "Entombed Scribe"),
  "Authored undead combatants must remain enemies.");
const koboldHoles = mapData("lower-city").locations.filter(({ name }) => name === "Kobold Hole");
assert.ok(koboldHoles.length > 0 && koboldHoles.every(({ category }) => category === "interactable"),
  "Character-backed destructible world proxies must be interactables, not NPCs or enemies.");

console.log(`Party-member tests passed for ${catalog.stats.members} members and ${catalog.stats.positions} positions.`);
