import fs from "node:fs";
import path from "node:path";
import { attributeValue, guidPattern, parseEndpoint, readStoryFacts, walkFiles } from "./lib/story-goal-facts.mjs";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";
import { STORY_DESTINATION_PREDICATES } from "./lib/story-destination.mjs";
import { createStoryDestinationResolver } from "./lib/story-destination-resolution.mjs";
import { resolveStoryCampDestinations } from "./lib/story-camp-destinations.mjs";
import { readReviewedNpcScenes } from "./lib/reviewed-npc-scenes.mjs";
import { applyReviewedCampEntryRelations } from "./lib/reviewed-camp-entry-relations.mjs";
import { applyReviewedCampResidentRelations } from "./lib/reviewed-camp-resident-relations.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const storyRoot = path.join(projectRoot, "map-sources", "extracted", "story-goals");
const placementRoots = [
  path.join(projectRoot, "map-sources", "extracted", "package-placements"),
  path.join(projectRoot, "map-sources", "converted", "wld-placements"),
  path.join(projectRoot, "map-sources", "converted", "main-level-placements"),
  path.join(projectRoot, "map-sources", "converted", "auxiliary-level-placements"),
];
const outputArgument = process.argv.indexOf("--output");
if (outputArgument >= 0 && !process.argv[outputArgument + 1]) throw new Error("--output requires a file path");
const outputPath = outputArgument >= 0 ? path.resolve(projectRoot, process.argv[outputArgument + 1])
  : path.join(projectRoot, "map-sources", "catalog", "story-location-relations.json");

const endpoint = parseEndpoint;
const normalizePlacementType = (type, placementKind) => {
  const searchable = `${type ?? ""} ${placementKind ?? ""}`.toLocaleLowerCase("en-US");
  if (searchable.includes("character")) return "character";
  if (searchable.includes("trigger")) return "trigger";
  if (searchable.includes("item")) return "item";
  return type?.toLocaleLowerCase("en-US") ?? placementKind?.toLocaleLowerCase("en-US") ?? "unknown";
};

const placementTypes = new Map();
for (const placementRoot of placementRoots) {
  for (const filePath of walkFiles(placementRoot).filter((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(".lsj"))) {
    const objects = JSON.parse(fs.readFileSync(filePath, "utf8"))?.save?.regions?.Templates?.GameObjects;
    if (!Array.isArray(objects)) continue;
    const relativePath = path.relative(placementRoot, filePath).split(path.sep).join("/");
    const placementKind = relativePath.split("/").at(-2) ?? "unknown";
    for (const object of objects) {
      const id = attributeValue(object, "MapKey", "").toLocaleLowerCase("en-US");
      if (!guidPattern.test(id)) continue;
      const type = normalizePlacementType(attributeValue(object, "Type", ""), placementKind);
      const current = placementTypes.get(id) ?? new Set();
      current.add(type);
      placementTypes.set(id, current);
    }
  }
}

const inferEndpointType = (value) => {
  if (value.cast === "character" || value.cast === "charactertemplate" || value.cast === "characterroot") return "character";
  if (value.cast === "trigger") return "trigger";
  if (value.cast === "item" || value.cast === "itemroot" || value.cast === "itemtemplate") return "item";
  const types = placementTypes.get(value.id) ?? new Set();
  if (types.size === 1) return [...types][0];
  if (/^(?:S_|CHARACTERGUID_).*(?:Character|NPC|Companion|Player)/i.test(value.token)) return "character";
  if (/(?:Pos(?:ition)?|Location|Spawn|Destination|Point|Place|Marker)(?:_|$)/i.test(value.name)) return "trigger";
  return "unknown";
};

const facts = readStoryFacts([storyRoot], projectRoot);
const npcReviewArgument = process.argv.indexOf("--npc-scene-reviews");
if (npcReviewArgument >= 0 && !process.argv[npcReviewArgument + 1]) throw new Error("--npc-scene-reviews requires a file path");
const npcReviewPath = path.resolve(projectRoot, npcReviewArgument >= 0 ? process.argv[npcReviewArgument + 1] : "map-sources/config/story-npc-scenes.json");
const npcScenes = readReviewedNpcScenes(npcReviewPath, projectRoot, facts);

const characterAnchors = [];
const locationPredicatePattern = /(?:init|setup|position|location|spawn|return|arrival|teleport|place)/i;
const locationNamePattern = /(?:pos(?:ition)?|location|spawn|destination|point|place|marker)(?:_|$)/i;
for (const fact of facts) {
  if (fact.section !== "init" || !fact.predicate.startsWith("DB_") || /debug/i.test(fact.predicate)) continue;
  if (!locationPredicatePattern.test(fact.predicate)) continue;
  const endpoints = fact.arguments.map(endpoint).filter(Boolean).map((value) => ({
    ...value,
    type: inferEndpointType(value),
  }));
  const characters = endpoints.filter(({ type }) => type === "character");
  const triggers = endpoints.filter(({ type, name }) => type === "trigger" && locationNamePattern.test(name));
  if (characters.length !== 1 || triggers.length !== 1) continue;
  characterAnchors.push({
    id: `${characters[0].id}:${triggers[0].id}:${fact.predicate}`,
    character: characters[0],
    anchor: triggers[0],
    predicate: fact.predicate,
    conditional: fact.arguments.some((argument) => /^\(FLAG\)/.test(argument)),
    evidence: [fact.evidence],
  });
}

const itemOrigins = [];
for (const fact of facts.filter(({ predicate }) => predicate === "DB_GLO_HeadRemoval")) {
  const character = endpoint(fact.arguments[0] ?? "");
  const item = endpoint(fact.arguments[2] ?? "");
  if (!character || !item) continue;
  itemOrigins.push({
    id: `${item.id}:head-removal:${character.id}`,
    kind: "head-removal",
    item,
    source: character,
    dynamic: true,
    suppressAuthoredPosition: true,
    evidence: [fact.evidence],
  });
}

const initialItemTransfers = [];
for (const fact of facts.filter(({ predicate, section }) => predicate === "ToInventory" && section === "init")) {
  const item = endpoint(fact.arguments[0] ?? "");
  const target = endpoint(fact.arguments[1] ?? "");
  if (!item || !target) continue;
  if (/debug/i.test(item.name) || /debug/i.test(target.name)) continue;
  const itemType = inferEndpointType(item);
  const targetType = inferEndpointType(target);
  if (itemType !== "item" || !["character", "item"].includes(targetType)) continue;
  initialItemTransfers.push({
    id: `${item.id}:initial-inventory:${target.id}`,
    kind: "initial-inventory",
    item: { ...item, type: itemType },
    target: { ...target, type: targetType },
    dynamic: false,
    suppressAuthoredPosition: true,
    evidence: [fact.evidence],
  });
}

// Exact story statements that teleport or walk a character to a trigger. They
// describe where an encounter actually happens when the authored placement of
// the character lies elsewhere (for example a boss fight in a later act).
const scriptedDestinations = [];
const excludedScriptedDestinations = [];
const storyRules = new Map();
const ruleFor = (fact) => {
  if (!storyRules.has(fact.evidence.sourcePath)) {
    storyRules.set(fact.evidence.sourcePath, createStoryRuleLookup(fs.readFileSync(path.join(projectRoot, fact.evidence.sourcePath), "utf8")));
  }
  return storyRules.get(fact.evidence.sourcePath)(fact.evidence.sourceLine);
};
const supportFacts = readStoryFacts([path.join(projectRoot, "map-sources/extracted/story-support/shared")], projectRoot);
const { resolve: resolveInputs, corpseEvidence } = createStoryDestinationResolver(facts, ruleFor, supportFacts);
for (const fact of facts.filter(({ predicate, negated }) => STORY_DESTINATION_PREDICATES[predicate] && !negated)) {
  const rule = ruleFor(fact);
  if (rule && (!rule.actionLine || fact.evidence.sourceLine < rule.actionLine)) continue;
  for (const resolved of resolveInputs(fact)) {
    const character = endpoint(resolved.arguments[0] ?? "");
    const anchor = endpoint(resolved.arguments[1] ?? "");
    if (!character || !anchor) continue;
    if (/debug/i.test(character.name) || /debug/i.test(anchor.name)) continue;
    const excludedActor = npcScenes.excludedActorName.test(character.name);
    const npcScene = excludedActor ? npcScenes.resolve(character.id, anchor.id, resolved.evidence) : undefined;
    if (excludedActor && !npcScene) continue;
    const characterType = inferEndpointType(character);
    const anchorType = inferEndpointType(anchor);
    if (characterType !== "character" || anchorType !== "trigger") continue;
    const kind = STORY_DESTINATION_PREDICATES[fact.predicate];
    const id = `${character.id}:${kind}:${anchor.id}`;
    if (rule?.debugOnly) {
      excludedScriptedDestinations.push({ id, character, anchor, kind,
        reason: "Action belongs to an explicitly debug-only source rule", rule, evidence: resolved.evidence });
      continue;
    }
    const arrivalEvidence = [...corpseEvidence(resolved), ...(npcScene?.arrivalEvidence ?? [])];
    const arrivalState = arrivalEvidence.length ? "corpse" : "unspecified";
    const existing = scriptedDestinations.find((relation) => relation.id === id);
    if (existing) {
      existing.evidence.push(...resolved.evidence);
      existing.arrivalEvidence.push(...arrivalEvidence);
      if (existing.arrivalState !== arrivalState) existing.arrivalState = "unspecified";
      continue;
    }
    scriptedDestinations.push({ id, kind,
      character: { ...character, type: characterType }, anchor: { ...anchor, type: anchorType },
      evidence: resolved.evidence,
      arrivalState, arrivalEvidence,
      ...(npcScene ? { npcScene: { id: npcScene.id, evidence: npcScene.evidence } } : {}),
    });
  }
}

const campRuntimeFacts = readStoryFacts([path.join(projectRoot, "map-sources/extracted/story-support/patched-shared-camp")], projectRoot);
const campRuntimeEvidence = [
  ["DB_ORI_OriginCampData((CHARACTER)_Camper, (STRING)_ActiveCamp, (TRIGGER)_CampPos)", "QRY_Camp_GetCamperPos("],
  ['TeleportTo(_Camper,_CampPos,"",0,0,1,1,1)', "PROC_CampSwapped("],
].map(([statement, header]) => {
  const fact = campRuntimeFacts.find((candidate) => candidate.evidence.statement === statement && !candidate.negated
    && !ruleFor(candidate)?.debugOnly && ruleFor(candidate)?.guards[0]?.startsWith(header));
  if (!fact) throw new Error(`Missing original camp runtime contract: ${statement}`);
  return fact.evidence;
});
scriptedDestinations.push(...resolveStoryCampDestinations(facts, ruleFor, campRuntimeEvidence)
  .filter(({ character, anchor }) => inferEndpointType(character) === "character" && inferEndpointType(anchor) === "trigger"));

const ownershipClears = new Set(facts
  .filter(({ predicate }) => predicate === "ClearOwnership")
  .map((fact) => endpoint(fact.arguments[0] ?? ""))
  .filter(Boolean)
  .map(({ id }) => id));
const initialOwnerships = [];
for (const fact of facts.filter(({ predicate, section }) => predicate === "SetOwner" && section === "init")) {
  const item = endpoint(fact.arguments[0] ?? "");
  const owner = endpoint(fact.arguments[1] ?? "");
  if (!item || !owner || /debug/i.test(item.name) || /debug/i.test(owner.name)) continue;
  const itemType = inferEndpointType(item);
  const ownerType = inferEndpointType(owner);
  if (itemType !== "item" || ownerType !== "character") continue;
  initialOwnerships.push({
    id: `${item.id}:initial-owner:${owner.id}`,
    kind: "initial-owner",
    item: { ...item, type: itemType },
    owner: { ...owner, type: ownerType },
    canChange: ownershipClears.has(item.id),
    evidence: [fact.evidence],
  });
}

const dialogMoneyTransfers = [];
for (const fact of facts.filter(({ predicate, section }) => predicate === "DB_DialogMoneyTransfer" && section === "init")) {
  const index = Number(fact.arguments[0]);
  const dialog = endpoint(fact.arguments[1] ?? "");
  const amount = Number(fact.arguments[2]);
  if (!dialog || !Number.isInteger(index) || index < 0 || !Number.isInteger(amount) || amount <= 0) continue;
  dialogMoneyTransfers.push({
    id: `${dialog.id}:gold:${index}:${amount}`,
    dialog,
    index,
    amount,
    evidence: [fact.evidence],
  });
}

const uniqueBy = (values, keyFor) => [...new Map(values.map((value) => [keyFor(value), value])).values()];
const normalizedCharacterAnchors = uniqueBy(characterAnchors, ({ id }) => id)
  .sort((left, right) => left.character.id.localeCompare(right.character.id, "en") || left.anchor.id.localeCompare(right.anchor.id, "en"));
const normalizedItemOrigins = uniqueBy(itemOrigins, ({ id }) => id)
  .sort((left, right) => left.item.id.localeCompare(right.item.id, "en"));
const normalizedInitialItemTransfers = uniqueBy(initialItemTransfers, ({ id }) => id)
  .sort((left, right) => left.item.id.localeCompare(right.item.id, "en") || left.target.id.localeCompare(right.target.id, "en"));
const normalizedInitialOwnerships = uniqueBy(initialOwnerships, ({ id }) => id)
  .sort((left, right) => left.item.id.localeCompare(right.item.id, "en") || left.owner.id.localeCompare(right.owner.id, "en"));
const normalizedDialogMoneyTransfers = uniqueBy(dialogMoneyTransfers, ({ id }) => id)
  .sort((left, right) => left.dialog.id.localeCompare(right.dialog.id, "en") || left.index - right.index || left.amount - right.amount);
const campReviewArgument = process.argv.indexOf("--camp-entry-review");
if (campReviewArgument >= 0 && !process.argv[campReviewArgument + 1]) throw new Error("--camp-entry-review requires a file path");
const campReviewPath = path.resolve(projectRoot, campReviewArgument >= 0 ? process.argv[campReviewArgument + 1]
  : "map-sources/config/story-camp-entry-review.json");
const campEntries = applyReviewedCampEntryRelations(uniqueBy(scriptedDestinations, ({ id }) => id), campReviewPath, projectRoot);
const residentReviewArgument = process.argv.indexOf("--camp-resident-review");
if (residentReviewArgument >= 0 && !process.argv[residentReviewArgument + 1]) throw new Error("--camp-resident-review requires a file path");
const residentReviewPath = path.resolve(projectRoot, residentReviewArgument >= 0 ? process.argv[residentReviewArgument + 1]
  : "map-sources/config/story-camp-resident-review.json");
const campResidents = applyReviewedCampResidentRelations(campEntries.relations, facts, residentReviewPath, projectRoot);
const normalizedScriptedDestinations = campResidents.relations
  .sort((left, right) => left.character.id.localeCompare(right.character.id, "en") || left.anchor.id.localeCompare(right.anchor.id, "en"));
const scriptedDestinationsByCharacterId = Object.fromEntries(normalizedScriptedDestinations.reduce((groups, relation) => {
  groups.set(relation.character.id, [...(groups.get(relation.character.id) ?? []), relation]);
  return groups;
}, new Map()));
const byCharacterId = Object.fromEntries(normalizedCharacterAnchors.reduce((groups, relation) => {
  groups.set(relation.character.id, [...(groups.get(relation.character.id) ?? []), relation]);
  return groups;
}, new Map()));
const byItemId = Object.fromEntries(normalizedItemOrigins.map((relation) => [relation.item.id, relation]));
const initialItemTransfersByItemId = Object.fromEntries(normalizedInitialItemTransfers.reduce((groups, relation) => {
  groups.set(relation.item.id, [...(groups.get(relation.item.id) ?? []), relation]);
  return groups;
}, new Map()));
const initialOwnershipsByItemId = Object.fromEntries(normalizedInitialOwnerships.reduce((groups, relation) => {
  groups.set(relation.item.id, [...(groups.get(relation.item.id) ?? []), relation]);
  return groups;
}, new Map()));
const dialogMoneyTransfersByDialogId = Object.fromEntries(normalizedDialogMoneyTransfers.reduce((groups, relation) => {
  groups.set(relation.dialog.id, [...(groups.get(relation.dialog.id) ?? []), relation]);
  return groups;
}, new Map()));
const catalog = {
  schemaVersion: 4,
  sourceBuild: "24532579",
  npcSceneReviews: { recipe: path.relative(projectRoot, npcReviewPath).split(path.sep).join("/"), hashes: npcScenes.hashes },
  campEntryReviews: campEntries.sourceReview,
  campResidentReviews: campResidents.sourceReview,
  stats: {
    characterAnchors: normalizedCharacterAnchors.length,
    anchoredCharacters: Object.keys(byCharacterId).length,
    scriptedDestinations: normalizedScriptedDestinations.length,
    scriptedDestinationCharacters: Object.keys(scriptedDestinationsByCharacterId).length,
    excludedDebugDestinationStatements: excludedScriptedDestinations.length,
    excludedCampEntryRelations: campEntries.excluded.length,
    dynamicItemOrigins: normalizedItemOrigins.length,
    initialItemTransfers: normalizedInitialItemTransfers.length,
    initiallyTransferredItems: Object.keys(initialItemTransfersByItemId).length,
    initialOwnerships: normalizedInitialOwnerships.length,
    initiallyOwnedItems: Object.keys(initialOwnershipsByItemId).length,
    changeableInitialOwnerships: normalizedInitialOwnerships.filter(({ canChange }) => canChange).length,
    dialogMoneyTransfers: normalizedDialogMoneyTransfers.length,
    dialogsWithMoneyTransfers: Object.keys(dialogMoneyTransfersByDialogId).length,
  },
  characterAnchors: normalizedCharacterAnchors,
  itemOrigins: normalizedItemOrigins,
  initialItemTransfers: normalizedInitialItemTransfers,
  initialOwnerships: normalizedInitialOwnerships,
  dialogMoneyTransfers: normalizedDialogMoneyTransfers,
  byCharacterId,
  byItemId,
  initialItemTransfersByItemId,
  initialOwnershipsByItemId,
  dialogMoneyTransfersByDialogId,
  scriptedDestinations: normalizedScriptedDestinations,
  scriptedDestinationsByCharacterId,
  excludedScriptedDestinations,
  excludedCampEntryDestinations: campEntries.excluded,
};

writeGeneratedFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Story locations: ${catalog.stats.characterAnchors} character anchors, ${catalog.stats.dynamicItemOrigins} dynamic item origins, ${catalog.stats.initialItemTransfers} initial inventory transfers, ${catalog.stats.initialOwnerships} initial ownerships, ${catalog.stats.dialogMoneyTransfers} exact dialogue gold transfers, and ${catalog.stats.scriptedDestinations} scripted character destinations.`);
