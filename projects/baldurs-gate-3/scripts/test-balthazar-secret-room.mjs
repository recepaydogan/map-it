import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "catalog", "balthazar-secret-room.json"), "utf8"));
const mapRoot = path.join(projectRoot, "public", "maps", "moonrise-towers-second-floor");
const metadata = JSON.parse(fs.readFileSync(path.join(mapRoot, "metadata.json"), "utf8"));
const content = JSON.parse(fs.readFileSync(path.join(mapRoot, "content.json"), "utf8"));
const profiles = Object.values(content.entities).filter(({ balthazarSecretRoom }) => balthazarSecretRoom);

assert.deepEqual(catalog.stats, {
  bookshelfLevers: 4,
  safeBooks: 1,
  explicitSpikeTraps: 1,
  activeBodyPartRestrictions: 0,
  disabledBodyPartRestrictionRules: 12,
});
assert.equal(metadata.displayName, "Moonrise Towers — Second Floor");
assert.deepEqual(metadata.coordinateReference.worldBounds, {
  x: -181.798948,
  y: -225.428477,
  width: 58.511314,
  height: 67.974091,
});
assert.equal(profiles.length, 7);
assert.equal(profiles.filter(({ balthazarSecretRoom }) => balthazarSecretRoom.role === "book").length, 4);

const safeBook = profiles.find(({ balthazarSecretRoom }) => (
  balthazarSecretRoom.role === "book"
  && balthazarSecretRoom.currentBookId === catalog.books.find(({ effect }) => effect === "reveals-heart-altar").book.objectId
));
const spikeBook = profiles.find(({ balthazarSecretRoom }) => (
  balthazarSecretRoom.role === "book"
  && balthazarSecretRoom.currentBookId === catalog.books.find(({ effect }) => effect === "spike-trap").book.objectId
));
const altar = profiles.find(({ balthazarSecretRoom }) => balthazarSecretRoom.role === "altar");
const door = profiles.find(({ balthazarSecretRoom }) => balthazarSecretRoom.role === "door");
const research = profiles.find(({ balthazarSecretRoom }) => balthazarSecretRoom.role === "research");

assert.equal(safeBook?.title, "Bookshelf Labelled 'Musty Tomes'");
assert.equal(spikeBook?.title, "Bookshelf Labelled 'Conventional Medicine'");
assert.equal(altar?.balthazarSecretRoom.acceptsAnyBodyPart, true);
assert.equal(door?.title, "Secret Bookcase Door");
assert.equal(research?.title, "Research Notes");

const exactLinks = content.relationships.filter(({ confidence }) => confidence === "story-db-exact");
assert.deepEqual(
  exactLinks.map(({ fromId, toId, kind }) => [fromId, toId, kind]).sort(),
  [
    [safeBook.id, altar.id, "reveals"],
    [altar.id, door.id, "controls"],
    [door.id, research.id, "reveals"],
  ].sort(),
);

console.log("Balthazar secret room: correct bookshelf, unrestricted body-part altar, hidden door, and research verified on 7 exact objects.");
