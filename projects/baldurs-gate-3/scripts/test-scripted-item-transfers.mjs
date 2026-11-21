import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"));
const catalog = readJson("map-sources/catalog/scripted-item-transfers.json");

assert.equal(catalog.schemaVersion, 1, "Unexpected scripted item transfer schema version.");
assert.ok(catalog.stats.transfers >= 100, `Expected at least 100 scripted transfers; received ${catalog.stats.transfers}.`);
assert.equal(catalog.transfers.length, catalog.stats.transfers, "Transfer stats must match the transfer list.");
assert.equal(new Set(catalog.transfers.map(({ id }) => id)).size, catalog.transfers.length, "Transfer IDs must be unique.");
assert.deepEqual(
  Object.keys(catalog.stats.byKind).sort(),
  ["equip", "inventory", "template-grant"],
  "Every supported transfer kind must be counted.",
);

for (const transfer of catalog.transfers) {
  assert.ok(["equip", "inventory", "template-grant"].includes(transfer.kind), `${transfer.id} has an unknown kind.`);
  assert.match(transfer.item.templateId, /^[0-9a-f-]{36}$/, `${transfer.id} must resolve its item template.`);
  assert.ok(["character", "item"].includes(transfer.owner.type), `${transfer.id} must resolve a character or container owner.`);
  assert.ok(transfer.owner.displayName.en, `${transfer.id} must resolve a localized owner name.`);
  assert.ok(Number.isInteger(transfer.amount) && transfer.amount >= 1, `${transfer.id} must carry a positive amount.`);
  assert.ok(transfer.evidence.length > 0
    && transfer.evidence.every(({ sourcePath, sourceLine, statement }) => sourcePath && Number.isInteger(sourceLine) && statement),
  `${transfer.id} must retain exact story evidence.`);
  assert.ok(catalog.byItemTemplateId[transfer.item.templateId]?.includes(transfer.id),
    `${transfer.id} must be indexed by its item template.`);
}

// Orin equips Crimson Mischief through an exact story statement; the weapon has
// no authored world or inventory placement inside any registered map.
const orinId = "bf24e0ec-a3a6-4905-bd2d-45dc8edf8101";
const crimsonMischiefTemplateId = "5961d027-75fd-4ad7-964c-8b786b5839fb";
const crimsonMischief = catalog.transfers.find(({ item, owner }) => item.templateId === crimsonMischiefTemplateId && owner.id === orinId);
assert.ok(crimsonMischief, "Crimson Mischief must resolve to Orin's scripted equip statement.");
assert.equal(crimsonMischief.kind, "equip");
assert.equal(crimsonMischief.owner.type, "character");
assert.equal(crimsonMischief.owner.displayName.en, "Orin");
assert.ok(crimsonMischief.evidence.some(({ statement }) => statement.startsWith("Equip(")),
  "The Crimson Mischief transfer must cite its Equip statement.");

// Initial-inventory placements are owned by the story-location relation catalog.
const initialTransfers = readJson("map-sources/catalog/story-location-relations.json").initialItemTransfers;
for (const relation of initialTransfers) {
  assert.ok(!catalog.transfers.some(({ kind, item, owner }) => kind === "inventory" && item.id === relation.item.id && owner.id === relation.target.id),
    `${relation.id} must not be duplicated as a scripted transfer.`);
}

console.log(`Scripted item transfers: ${catalog.stats.transfers} transfers verified.`);
