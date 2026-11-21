import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const mapsRoot = path.join(projectRoot, "public", "maps");
const appearances = [];

for (const directory of fs.readdirSync(mapsRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(mapsRoot, directory.name, "content.json");
  if (!fs.existsSync(contentPath)) continue;
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  for (const entity of Object.values(content.entities ?? {})) {
    if (!entity.hiddenPassage) continue;
    appearances.push({ mapId: directory.name, entity });
    assert.ok(
      entity.hiddenPassage.authoredSecretDoor || entity.hiddenPassage.storyRegistered,
      `${entity.id} has no exact secret-door evidence.`,
    );
    assert.equal(entity.kind, "secret");
  }
}

const uniqueIds = new Set(appearances.map(({ entity }) => entity.id));
assert.ok(uniqueIds.size >= 10, `Expected at least 10 mapped authored secret doors; received ${uniqueIds.size}.`);
assert.ok(uniqueIds.has("7241f91d-e34f-4615-b484-3b338c109d55"), "The Goblin Camp temple access secret door is missing.");

console.log(`Hidden passages: ${appearances.length} marker appearances across ${uniqueIds.size} authored secret doors.`);
