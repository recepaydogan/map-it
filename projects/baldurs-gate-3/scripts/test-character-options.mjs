import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "catalog", "character-options.json"), "utf8"));
const options = Object.values(catalog.options ?? {});
const classes = options.filter((option) => option.kind === "class");
const races = options.filter((option) => option.kind === "race");

assert.equal(catalog.schemaVersion, 1, "Expected the character option catalog schema used by the dialogue pipeline.");
assert.equal(classes.length, 12, `Expected the 12 authoritative base classes; received ${classes.length}.`);
assert(races.length >= 29, `Expected at least 29 playable race/subrace tags; received ${races.length}.`);
assert.equal(new Set(options.map((option) => option.id)).size, options.length, "Character option tag IDs must be unique.");

for (const option of options) {
  assert.match(option.id, /^[a-f0-9-]{36}$/, `${option.internalName} has an invalid tag UUID.`);
  assert(option.internalName && option.definitionId, `${option.id} has incomplete authoritative identity.`);
  assert(option.localizedNames?.en, `${option.internalName} has no English game localization.`);
  assert(option.provenance?.definition?.endsWith(".lsx"), `${option.internalName} has no definition provenance.`);
  assert(option.provenance?.tag?.endsWith(".lsj"), `${option.internalName} has no tag provenance.`);
  if (option.kind === "class") {
    assert(!option.parentDefinitionId, `${option.internalName} is a subclass but was exposed as a base class.`);
  }
}

console.log(`Character options: ${classes.length} base classes / ${races.length} playable race tags, all definition-backed and localized.`);
