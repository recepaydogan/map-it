/** Merge observed quest givers into the existing map without duplicating pins. */
import { readFile, writeFile } from "node:fs/promises";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const atlasRoot = "public/maps/world-atlas";
const outputPath = `${atlasRoot}/locations-quest-givers.json`;
const [atlas, locale, questDetails, observedSteps, ...layers] = await Promise.all([
  readJson(`${atlasRoot}/metadata.json`),
  readJson("src/i18n/locales/en.json"),
  readJson("public/data/quests/quest-details.json"),
  readJson("public/data/quests/step-locations.json"),
  ...[
    "locations-quest-npcs.json", "locations-mapgenie-community.json",
    "locations-profession-trainers.json", "locations-class-trainers.json",
    "locations-repair-vendors.json", "locations-banks.json", "locations-quests.json",
  ].map((name) => readJson(`${atlasRoot}/${name}`)),
]);
const fetchLayer = async (name) => {
  const response = await fetch(`https://foreverdb.net/data/maps/layer-${name}.json`,
    { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${name} layer: HTTP ${response.status}`);
  const source = await response.json();
  if (!Array.isArray(source.items)) throw new Error(`${name} layer has no items`);
  return source.items;
};
const [questGivers, questSteps] = await Promise.all([
  fetchLayer("questgivers"), fetchLayer("questmarkers"),
]);

const getText = (key) => key?.split(".").reduce((value, part) => value?.[part], locale);
const normalize = (value) => (value ?? "").toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
const project = createClientWorldProjector(atlas);
const existing = layers.flatMap((layer) => layer.locations);
const questMarkers = layers.at(-1).locations;
const markerById = new Map(questMarkers.map((marker) => [marker.id, marker]));
const markerByQuestId = new Map(Object.entries(questDetails.markerQuestIds)
  .map(([markerId, questId]) => [questId, markerById.get(markerId)]));
const giversByName = new Map();
for (const giver of questGivers) {
  const key = normalize(giver.n);
  const candidates = giversByName.get(key) ?? [];
  candidates.push(giver);
  giversByName.set(key, candidates);
}
const giverLinks = new Map();
for (const marker of questMarkers) {
  const giver = getText(marker.questInfo?.startsAtKey);
  if (!giver || /^creature #\d+$/i.test(giver)) continue;
  const key = normalize(giver);
  const links = giverLinks.get(key) ?? [];
  links.push({ mapId: "azeroth", markerId: marker.id, nameKey: marker.nameKey });
  giverLinks.set(key, links);
}

const locations = [];
const augmentations = {};
let reused = 0;
let unmatchedReferencePositions = 0;
for (const giver of questGivers.filter((item) => item.fv && item.k === "npc")) {
  const point = project(giver.c, giver.w);
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
  const name = normalize(giver.n);
  const nearby = existing.filter((candidate) => candidate.category !== "quest"
    && candidate.category !== "repeatable-quest"
    && normalize(candidate.name || getText(candidate.nameKey)) === name
    && Math.hypot(candidate.x - point.x, candidate.y - point.y) <= 100)
    .sort((left, right) => Math.hypot(left.x - point.x, left.y - point.y)
      - Math.hypot(right.x - point.x, right.y - point.y));
  const linked = [...new Map((giverLinks.get(name) ?? []).map((link) => [link.markerId, link])).values()];
  const groups = linked.length ? [{ titleKey: "map.questGivers.quests", links: linked }] : [];
  if (nearby.length) {
    reused++;
    if (groups.length) augmentations[nearby[0].id] = groups;
    continue;
  }
  // A seen NPC can still have only a Classic reference coordinate. That does
  // not establish a new pin position on this map.
  if (giver.s !== "players") {
    unmatchedReferencePositions++;
    continue;
  }
  const id = `client-quest-giver-${giver.id}`;
  locations.push({ id, name: giver.n, category: "npc", label: "", subtype: "quest-npc",
    regionId: "", region: "", x: Number(point.x.toFixed(3)), y: Number(point.y.toFixed(3)),
    entityId: String(giver.id), ...(groups.length ? { linkedMarkerGroups: groups } : {}) });
}

// The client quest map has start/hand-in positions even when its NPC layer has
// no named record yet. Reuse a named quest marker's giver at that position.
let namedFromQuestSteps = 0;
for (const step of questSteps.filter((item) => item.k === "start" || item.k === "end")) {
  const markerId = Object.keys(questDetails.markerQuestIds).find((id) =>
    questDetails.markerQuestIds[id] === String(step.id));
  const marker = questMarkers.find((item) => item.id === markerId);
  const name = getText(step.k === "start" ? marker?.questInfo?.startsAtKey
    : marker?.questInfo?.endsAtKey);
  const point = project(step.c, step.w);
  if (!marker || !name || /^creature #\d+|npc #\d+$/i.test(name) || !point) continue;
  const nearby = [...existing, ...locations].filter((candidate) =>
    !["quest", "repeatable-quest"].includes(candidate.category)
    && normalize(candidate.name || getText(candidate.nameKey)) === normalize(name)
    && Math.hypot(candidate.x - point.x, candidate.y - point.y) <= 100)
    .sort((left, right) => Math.hypot(left.x - point.x, left.y - point.y)
      - Math.hypot(right.x - point.x, right.y - point.y));
  const link = { mapId: "azeroth", markerId: marker.id, nameKey: marker.nameKey };
  if (nearby.length) {
    const target = nearby[0];
    const groups = locations.includes(target)
      ? target.linkedMarkerGroups ??= [] : augmentations[target.id] ??= [];
    let group = groups.find((item) => item.titleKey === "map.questGivers.quests");
    if (!group) groups.push(group = { titleKey: "map.questGivers.quests", links: [] });
    if (!group.links.some((item) => item.markerId === marker.id)) group.links.push(link);
    continue;
  }
  namedFromQuestSteps++;
  locations.push({ id: `client-quest-npc-${step.id}-${step.k}`, name, category: "npc",
    label: "", subtype: "quest-npc", regionId: "", region: "",
    x: Number(point.x.toFixed(3)), y: Number(point.y.toFixed(3)),
    linkedMarkerGroups: [{ titleKey: "map.questGivers.quests", links: [link] }] });
}

// Player-confirmed pickup and hand-in positions can locate NPCs whose only
// entry in the broad giver layer still uses a Classic reference position.
let namedFromObservedSteps = 0;
for (const [questId, quest] of Object.entries(observedSteps.quests)) {
  const marker = markerByQuestId.get(questId);
  if (!marker) continue;
  for (const kind of ["pickup", "handIn"]) {
    for (const [index, step] of (quest[kind] ?? []).entries()) {
      const name = /^npc #\d+$/i.test(step.name ?? "")
        ? questDetails.quests[questId]?.[kind === "pickup" ? "startsAt" : "endsAt"]
        : step.name;
      const possibleGivers = giversByName.get(normalize(name));
      if (!possibleGivers?.length || !Number.isFinite(step.x) || !Number.isFinite(step.y)) continue;
      const nearby = [...existing, ...locations].filter((candidate) =>
        !["quest", "repeatable-quest"].includes(candidate.category)
        && normalize(candidate.name || getText(candidate.nameKey)) === normalize(name)
        && Math.hypot(candidate.x - step.x, candidate.y - step.y) <= 100)
        .sort((left, right) => Math.hypot(left.x - step.x, left.y - step.y)
          - Math.hypot(right.x - step.x, right.y - step.y));
      const link = { mapId: "azeroth", markerId: marker.id, nameKey: marker.nameKey };
      if (nearby.length) {
        const target = nearby[0];
        const groups = locations.includes(target)
          ? target.linkedMarkerGroups ??= [] : augmentations[target.id] ??= [];
        let group = groups.find((item) => item.titleKey === "map.questGivers.quests");
        if (!group) groups.push(group = { titleKey: "map.questGivers.quests", links: [] });
        if (!group.links.some((item) => item.markerId === marker.id)) group.links.push(link);
        continue;
      }
      namedFromObservedSteps++;
      locations.push({ id: `observed-quest-npc-${questId}-${kind}-${index}`, name,
        category: "npc", label: "", subtype: "quest-npc", regionId: "", region: step.zone,
        x: step.x, y: step.y, referenceCoordinates: { x: step.zoneX, y: step.zoneY },
        ...(possibleGivers.length === 1 ? { entityId: String(possibleGivers[0].id) } : {}),
        linkedMarkerGroups: [{ titleKey: "map.questGivers.quests", links: [link] }] });
    }
  }
}
locations.sort((left, right) => left.id.localeCompare(right.id));
const output = { version: 1, locations, augmentations: Object.fromEntries(
  Object.entries(augmentations).sort(([left], [right]) => left.localeCompare(right))) };
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Quest givers: ${locations.length} new pins (${namedFromQuestSteps} client steps, ${namedFromObservedSteps} observed steps), ${reused} existing pins reused, ${Object.keys(augmentations).length} enriched, ${unmatchedReferencePositions} reference-only positions withheld.`);
