import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "catalog", "wyrmway-puzzles.json"), "utf8"));
const content = JSON.parse(fs.readFileSync(path.join(projectRoot, "public", "maps", "wyrmway", "content.json"), "utf8"));
const profiles = Object.values(content.entities ?? {}).filter(({ wyrmwayPuzzle }) => wyrmwayPuzzle);

assert.deepEqual(catalog.stats, {
  puzzles: 4,
  activeChessVariants: 3,
  chessMoves: 9,
  insightSuspects: 3,
  insightEvidenceBooks: 3,
  justicePaintings: 3,
  courageEnemies: 8,
  couragePhases: 4,
});

const chessAnchor = profiles.find(({ id }) => id === catalog.chess.anchor.objectId);
assert.ok(chessAnchor, "The exact Chamber of Strategy instructor must be mapped.");
assert.equal(chessAnchor.wyrmwayPuzzle.kind, "chess");
assert.equal(chessAnchor.wyrmwayPuzzle.variants.length, 3);
assert.deepEqual(
  chessAnchor.wyrmwayPuzzle.variants.map(({ moves }) => moves.map(({ from, to }) => `${from.notation}->${to.notation}`)),
  [
    ["f6->h8", "f8->e7", "h8->d8"],
    ["a6->h6", "h8->g8", "h6->g7"],
    ["f8->g8", "f7->g8", "d7->g7"],
  ],
);
assert.ok(chessAnchor.wyrmwayPuzzle.variants.every(({ moves }) => moves.every((move) => !("evidence" in move))));

const insightProfiles = profiles.filter(({ wyrmwayPuzzle }) => wyrmwayPuzzle.kind === "insight");
assert.equal(insightProfiles.length, 4, "The instructor and all three exact suspects must be mapped.");
const insightAnchor = insightProfiles.find(({ id }) => id === catalog.insight.anchor.objectId);
assert.ok(insightAnchor, "The exact Chamber of Insight instructor must be mapped.");
assert.equal(insightAnchor.wyrmwayPuzzle.suspects.length, 3);
assert.equal(insightAnchor.wyrmwayPuzzle.evidenceBooks.length, 3);

const correctSuspect = insightAnchor.wyrmwayPuzzle.suspects.find(({ correct }) => correct);
assert.equal(correctSuspect?.contentId, "2d8b3b34-8856-4adc-8cde-349e1f281674");
assert.equal(correctSuspect?.title, "Suelto");
const justiceProfiles = profiles.filter(({ wyrmwayPuzzle }) => wyrmwayPuzzle.kind === "justice");
assert.equal(justiceProfiles.length, 4, "The Justice instructor and all three exact candidate paintings must be mapped.");
const justiceAnchor = justiceProfiles.find(({ id }) => id === catalog.justice.anchor.objectId);
assert.ok(justiceAnchor, "The exact Chamber of Justice instructor must be mapped.");
assert.equal(justiceAnchor.wyrmwayPuzzle.paintings.filter(({ correct }) => correct).length, 1);
const correctPainting = justiceAnchor.wyrmwayPuzzle.paintings.find(({ correct }) => correct);
assert.equal(correctPainting?.contentId, catalog.justice.paintings.find(({ correct }) => correct).painting.objectId,
  "The correct painting is selected by source object identity, not its fallback title.");
assert.equal(correctPainting.title, "Cell", "The authored localized title takes precedence over the fallback title.");

const courageProfile = profiles.find(({ id }) => id === catalog.courage.anchor.objectId);
assert.ok(courageProfile, "The exact Chamber of Courage instructor must be mapped.");
assert.equal(courageProfile.wyrmwayPuzzle.kind, "courage");
assert.equal(courageProfile.wyrmwayPuzzle.enemies.length, 8);
assert.deepEqual([...new Set(courageProfile.wyrmwayPuzzle.enemies.map(({ phase }) => phase))], [0, 2, 3, 4]);
assert.equal(profiles.length, 10);

console.log("Wyrmway trials: chess, Insight, Justice, and Courage data verified on 10 exact map objects.");
