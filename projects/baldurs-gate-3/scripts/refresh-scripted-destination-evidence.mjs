import fs from "node:fs";
import path from "node:path";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";
import { createStoryDestinationProfile, mergeStoryDestinationEvidence } from "./lib/story-destination-profile.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (filename) => JSON.parse(fs.readFileSync(path.join(root, filename), "utf8"));
const catalog = read("map-sources/catalog/story-location-relations.json");
const byCharacter = Map.groupBy(catalog.scriptedDestinations, ({ character }) => character.id);
const mapIds = readRegisteredMapIds(fs.readFileSync(path.join(root, "src/features/map/map-registry.ts"), "utf8"));
const pending = [];
let profiles = 0;
let changedProfiles = 0;
const refresh = (entity) => {
  const previous = entity.storyDestination;
  if (!previous) return entity;
  const anchorIds = new Set([previous.anchorContentId, ...(previous.otherAnchorContentIds ?? [])]);
  const relations = (byCharacter.get(previous.characterContentId) ?? []).filter(({ anchor }) => anchorIds.has(anchor.id));
  const storyDestination = createStoryDestinationProfile({
    characterId: previous.characterContentId, anchorId: previous.anchorContentId,
    anchorName: previous.anchorName, correctedFromAnchorId: previous.correctedFromAnchorId, relations,
  });
  // Replace only statements associated with this destination, leaving any
  // unrelated source provenance and native placement records untouched.
  const evidenceKey = ({ sourcePath, sourceLine, statement }) => `${sourcePath}:${sourceLine}:${statement}`;
  const previousEvidence = new Set([...(previous.evidence ?? []),
    ...(previous.alternateDestinations ?? []).flatMap(({ evidence }) => evidence ?? [])].map(evidenceKey));
  const nativeProvenance = (entity.provenance ?? []).filter((entry) => !previousEvidence.has(evidenceKey(entry)));
  const sourceBuild = entity.provenance?.find(({ sourceBuild }) => sourceBuild)?.sourceBuild;
  const provenance = [...nativeProvenance, ...mergeStoryDestinationEvidence(storyDestination.evidence)
    .map((entry) => ({ ...entry, ...(sourceBuild ? { sourceBuild } : {}) }))];
  return { ...entity, storyDestination, provenance };
};

// Validate every selected source anchor before writing any map. This operation
// updates provenance only: IDs, positions, kinds and location files stay intact.
for (const mapId of mapIds) {
  const filename = `public/maps/${mapId}/content.json`;
  const content = read(filename);
  const transform = (entity) => {
    const next = refresh(entity);
    if (entity.storyDestination) {
      profiles += 1;
      if (JSON.stringify(next) !== JSON.stringify(entity)) changedProfiles += 1;
    }
    return next;
  };
  const entities = Array.isArray(content.entities) ? content.entities.map(transform)
    : Object.fromEntries(Object.entries(content.entities).map(([key, entity]) => [key, transform(entity)]));
  const next = { ...content, entities };
  if (JSON.stringify(next) !== JSON.stringify(content)) pending.push({ filename, content: next });
}
if (pending.length) {
  const backupRoot = fs.mkdtempSync(path.join(root, "map-sources/audits/pre-destination-evidence-"));
  for (const { filename } of pending) {
    const target = path.join(backupRoot, filename);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, filename), target, fs.constants.COPYFILE_EXCL);
  }
  for (const { filename, content } of pending) writeGeneratedFile(path.join(root, filename), `${JSON.stringify(content, null, 2)}\n`);
  console.log(`Retained original content in ${path.relative(root, backupRoot)}.`);
}
console.log(`Refreshed ${changedProfiles}/${profiles} destination evidence profiles across ${pending.length} maps; no marker identities, positions or categories changed.`);
