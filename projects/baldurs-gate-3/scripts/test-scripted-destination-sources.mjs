import assert from "node:assert/strict";
import fs from "node:fs";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";

const read = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
const catalog = read("map-sources/catalog/story-location-relations.json");
const cases = [
  ["wilderness", "0dd6e9f1-d32d-41f1-b230-d540558e0847", "103f07fe-8c42-4e61-8f7f-3ecbd8a96cbb", "PROC_AppearOutOfSightTo"],
  ["wilderness", "25721313-0c15-4935-8176-9f134385451b", "06ec17f6-b313-49a1-a91d-be76de132da2", "PROC_AppearOutOfSightTo"],
  ["shattered-sanctum", "2af25a85-5b9a-4794-85d3-0bd4c4d262fa", "696dcbd7-ef54-42ad-915d-665f44fb9fb3", "PROC_CharacterMoveTo"],
  ["shattered-sanctum", "783d7572-a846-455f-b686-247a95263ebb", "6ec111da-a53a-447a-a29e-8ab4963c0d16", "PROC_CharacterMoveTo"],
  ["shadow-cursed-lands", "c8ab1ca6-96bb-467e-91c9-af87bc4d3925", "9052d5fa-fd15-4fae-9faf-3f25544f99da", "TeleportTo"],
  ["moonrise-towers-rooftop", "e9918f3e-5b87-40a3-a9bd-61545151573f", "a880e823-08de-41cd-8cff-1a563db7f05e", "PROC_CharacterMoveTo"],
  ["tiefling-hideout", "3b92c689-6024-4446-a6c9-584e9e8d77ca", "449f15ea-643c-41d9-91a5-c9fcdd92aaea", "PROC_AppearOutOfSightTo"],
];
const ruleLookups = new Map();
const evidenceKey = ({ sourcePath, sourceLine, statement }) => `${sourcePath}:${sourceLine}:${statement}`;
for (const [mapId, characterId, anchorId, predicate] of cases) {
  const entity = Object.values(read(`public/maps/${mapId}/content.json`).entities)
    .find(({ id }) => id === `${characterId}:destination:${anchorId}`);
  assert.ok(entity, `${mapId}: preserve the source-valid existing destination ID`);
  const anchor = read(`map-sources/catalog/${mapId}-placements.json`).records.find(({ id }) => id === anchorId);
  assert.deepEqual(entity.worldPosition, anchor.position, `${entity.title}: keep the native anchor coordinates`);
  const relations = catalog.scriptedDestinations.filter(({ character, anchor: target }) => character.id === characterId && target.id === anchorId);
  const supported = new Set(relations.flatMap(({ evidence }) => evidence.map(evidenceKey)));
  const evidence = entity.storyDestination.evidence;
  assert.ok(evidence.some(({ statement }) => statement.startsWith(`${predicate}(`)), `${entity.title}: normal movement/setup action required`);
  for (const item of evidence) {
    assert.ok(supported.has(evidenceKey(item)), `${entity.title}: evidence must belong to this exact destination`);
    if (!ruleLookups.has(item.sourcePath)) ruleLookups.set(item.sourcePath, createStoryRuleLookup(fs.readFileSync(item.sourcePath, "utf8")));
    assert.notEqual(ruleLookups.get(item.sourcePath)(item.sourceLine)?.debugOnly, true, `${entity.title}: debug evidence leaked into the published profile`);
  }
}
const shared = fs.readFileSync("map-sources/extracted/story-support/shared/__PROC.txt", "utf8");
assert.ok(shared.includes("PROC_AppearOutOfSightTo((CHARACTER)_Character, (GUIDSTRING)_Target, (GUIDSTRING)_DirectionFrom, (STRING)_AppearEvent)"));
assert.ok(shared.includes("AppearOutOfSightTo(_Character,_Target,_DirectionFrom,0,NULL_00000000-0000-0000-0000-000000000000,_AppearEvent,0)"));
assert.ok(shared.includes("PROC_CharacterMoveTo((CHARACTER)_Char,(GUIDSTRING)_Point,(STRING)_MovementSpeed,(STRING)_Event)"));
console.log("Seven destination source reviews passed: normal helper/setup evidence, unchanged native anchors and original marker IDs.");

const assault = [
  ["0cf357ec-268c-4779-92ad-8d6c7de437d1", "6d52c7e9-641b-4605-b4de-1fcc33d6bab9", true],
  ["107c72ca-2a4f-477d-a315-deeea3eea49e", "ccee262d-6d3a-4daf-82ce-a1b7f01e7a6c", true],
  ["30de3349-7bcb-4a6e-be2e-3ae7a4c89e6a", "505143a4-26e6-40d9-85e5-edca757d6ba3", true],
  ["480b89b1-ae6c-46e7-ad79-1b3babe3655e", "8c23e3cc-01b0-47ff-a124-2e56ad07d568", true],
  ["5c744998-b3cb-4edb-8a32-4df06593e849", "4cf47d08-5ca4-4064-b1df-d55a6fe75124", true],
  ["66b3e4c0-2f82-4c0a-9333-73a5194f88c7", "a8e6d30c-bf49-4ad3-807e-102d875da42b", false],
  ["8360ec17-f888-4745-8b22-351feadb86d1", "259009b4-7ef5-4922-99da-fce9ef488c31", true],
  ["9c7a8f97-bae8-4509-ad10-a67c17202a31", "f489b67d-cc01-4f32-a436-aed98030d004", false],
  ["34a9bfd8-1ca2-4a1c-b72e-2bf1cfc046a4", "ba043681-459e-4efe-bb86-85575fc99f3f", true],
  ["825714dd-7df9-4cd1-aecb-edf577baa487", "28704d07-d8c1-48a2-aed2-39136fb9518c", true],
  ["b1d8b327-1f27-4921-aa2b-dd18a9d67fc8", "b93c212c-d690-4cd3-b586-90b153b8b6d6", true],
  ["bd46130e-1c2c-4888-9e9c-6dd58965ab4f", "a23362ba-2207-473c-9674-de972503a199", true],
  ["f1f837ad-8e6a-442d-bba4-46f665c47675", "6393ca80-3e33-4d2e-b9b3-448849fe5726", true],
  ["f48078e6-ec51-49a2-a244-9d0a72af5257", "5e67879a-d598-4385-8a6c-3b87cb4df41c", true],
];
const regionalMaps = ["shadow-cursed-lands", "moonrise-towers-ground-floor", "moonrise-towers-second-floor", "moonrise-towers-rooftop"];
const regionalEntities = regionalMaps.flatMap((mapId) => Object.values(read(`public/maps/${mapId}/content.json`).entities).map((entity) => ({ mapId, entity })));
for (const [characterId, anchorId, dead] of assault) {
  const relation = catalog.scriptedDestinations.find(({ character, anchor }) => character.id === characterId && anchor.id === anchorId);
  assert.ok(relation, `${characterId}: require a normal assault setup binding`);
  assert.ok(relation.evidence.some(({ statement }) => statement.startsWith("PROC_MOO_Assault_TrySetupChar(_Char, _Trigger, _Group)")));
  assert.equal(relation.arrivalState === "corpse", dead, `${characterId}: preserve the source group's arrival state`);
  for (const item of [...relation.evidence, ...relation.arrivalEvidence]) {
    if (!ruleLookups.has(item.sourcePath)) ruleLookups.set(item.sourcePath, createStoryRuleLookup(fs.readFileSync(item.sourcePath, "utf8")));
    assert.notEqual(ruleLookups.get(item.sourcePath)(item.sourceLine)?.debugOnly, true, "Normal setup must not borrow debug evidence");
  }
  const published = regionalEntities.filter(({ entity }) => entity.id === `${characterId}:destination:${anchorId}`);
  assert.equal(published.length, 1, `${characterId}: preserve one routed appearance of the existing destination`);
  assert.equal(published[0].entity.kind === "corpse", dead);
}
const roadside = regionalEntities.filter(({ entity }) => entity.storyDestination?.arrivalEvidence?.some(({ statement }) => statement === 'EntityEvent(_Tiefling, "SCL_PlunderedCaravan_KillTiefling")'));
assert.ok(roadside.length >= 10, "Recover the source-bound caravan corpses");
assert.ok(roadside.every(({ entity }) => entity.kind === "corpse" && !entity.vendor));
console.log("Assault and caravan sources passed: normal procedure bindings, exact destination identity and source-backed corpse classification.");
