import { getMapRegionTargetId, type MapReferenceSearch } from "../map/map-focus-request";
import { MAP_DEFINITIONS, QUEST_OBJECTIVE_MAP_EXCLUSIONS, QUEST_OBJECTIVE_MAP_TARGETS,
  QUEST_OBJECTIVE_SOURCE_EXCLUSIONS,
  QUEST_TEXT_MAP_TARGETS, type MapDefinition } from "../map/map-registry";
import type { MapRegion } from "../map/types";
import type { ReferenceEntry, ReferenceLink } from "./reference-types";

export interface QuestLocationTarget {
  name: string;
  mapId: string;
  markerId: string;
  referenceId?: string;
  search?: MapReferenceSearch;
  alias?: boolean;
}

export interface QuestMapMarkerCandidate {
  name: string;
  mapId: string;
  markerId: string;
  referenceId: string;
}

export const findQuestLocationName = (text: string, name: string): number => {
  const lowerText = text.toLowerCase();
  const lowerName = name.toLowerCase();
  for (let index = lowerText.indexOf(lowerName); index >= 0; index = lowerText.indexOf(lowerName, index + 1)) {
    const before = text[index - 1];
    const after = text[index + name.length];
    if ((!before || !/[\p{L}\p{N}]/u.test(before)) && (!after || !/[\p{L}\p{N}]/u.test(after))) return index;
  }
  return -1;
};

/** A quest dependency remains navigable even when its objective uses different wording. */
export function questObjectiveReferenceLinks(text: string, links: ReferenceLink[],
  displayName: (name: string) => string = (name) => name): { inline: ReferenceLink[]; additional: ReferenceLink[] } {
  const inline: ReferenceLink[] = [];
  const additional: ReferenceLink[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    if (link.category !== "quests" || seen.has(link.id)) continue;
    seen.add(link.id);
    (findQuestLocationName(text, displayName(link.name)) >= 0 ? inline : additional).push(link);
  }
  return { inline, additional };
}

const isRelativeLandmark = (text: string, name: string): boolean => {
  const index = findQuestLocationName(text, name);
  return index >= 0 && /\b(?:near|next to|south of|north of|east of|west of|northeast of|northwest of|southeast of|southwest of|beneath|below|above)\s+(?:the\s+)?$/iu
    .test(text.slice(0, index));
};

const isPossessiveMention = (text: string, name: string): boolean => {
  const index = findQuestLocationName(text, name);
  return index >= 0 && /^(?:'|’)s\b/iu.test(text.slice(index + name.length));
};

/** A direct jump needs one pin; repeated spawns can be shown as a search only when they share an identity. */
export function questMapMarkerTargets(candidates: QuestMapMarkerCandidate[]): QuestLocationTarget[] {
  const byName = new Map<string, QuestMapMarkerCandidate[]>();
  for (const candidate of candidates) {
    const key = candidate.name.toLowerCase();
    const group = byName.get(key) ?? [];
    group.push(candidate);
    byName.set(key, group);
  }
  return [...byName.values()].flatMap((group) => {
    const first = group[0]!;
    if (group.length === 1) return [{ name: first.name, mapId: first.mapId, markerId: first.markerId,
      referenceId: first.referenceId }];
    if (!group.every((candidate) => candidate.mapId === first.mapId && candidate.referenceId === first.referenceId)) return [];
    return [{ name: first.name, mapId: first.mapId, markerId: first.markerId,
      referenceId: first.referenceId,
      search: { referenceId: first.referenceId, name: first.name, region: "", allRegions: true } }];
  });
}

/** Source links can name several valid targets even when the objective uses one generic noun. */
export function questSourceMapTargets(links: ReferenceLink[], mapMarkers: QuestMapMarkerCandidate[],
  objective?: { questId: string; text: string }): QuestLocationTarget[] {
  const sourceIds = new Set(links.filter((link) => link.category === "creatures" || link.category === "exploration"
    || link.category === "travel")
    .map((link) => link.id));
  const eligible = mapMarkers.filter((marker) => sourceIds.has(marker.referenceId)
    && !QUEST_OBJECTIVE_SOURCE_EXCLUSIONS.some((excluded) => objective
      && excluded.questId === objective.questId && excluded.referenceId === marker.referenceId
      && excluded.match.test(objective.text)));
  const byIdentity = new Map<string, QuestMapMarkerCandidate[]>();
  for (const marker of eligible) {
    const key = `${marker.referenceId}:${marker.name.toLowerCase()}`;
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), marker]);
  }
  return [...byIdentity.values()].flatMap(questMapMarkerTargets);
}

export function questMapDefinitions(entry: ReferenceEntry): MapDefinition[] {
  const mapIds = new Set(entry.locations.map((location) => location.mapId));
  for (const map of MAP_DEFINITIONS) {
    if (entry.adventure?.region && map.name.startsWith(`${entry.adventure.region} (`)) mapIds.add(map.id);
  }
  return MAP_DEFINITIONS.filter((definition) => mapIds.has(definition.id));
}

export function questRegionTargets(map: MapDefinition, regions: MapRegion[]): QuestLocationTarget[] {
  return regions.map((region) => ({ name: region.name, mapId: map.id, markerId: getMapRegionTargetId(region.id) }));
}

/** Include both quest-level instances and dungeon links attached to individual objectives. */
export function questLinkedDungeonIds(entry: ReferenceEntry): string[] {
  return [...new Set(entry.sections.filter((section) =>
    section.title === "reference.instanceLayer.questInstances" || section.title === "reference.labels.objectives")
    .flatMap((section) => [...(section.links ?? []), ...(section.rows ?? []).flatMap((row) => row.links ?? [])])
    .filter((link) => link.category === "dungeons").map((link) => link.id))];
}

/** Use only published, uniquely located dungeons explicitly attached to this quest. */
export function questDungeonTargets(entry: ReferenceEntry, dungeons: ReferenceEntry[]): QuestLocationTarget[] {
  const linkedIds = new Set(questLinkedDungeonIds(entry));
  const candidates = dungeons.filter((dungeon) => linkedIds.has(dungeon.id) && dungeon.locations.length === 1)
    .flatMap((dungeon) => {
      const location = dungeon.locations[0]!;
      const markerName = location.name.split(" · ").at(-1)?.trim() ?? "";
      const shortName = markerName.replace(/\s+(?:Room\s+)?(?:Entrance\s+)?Door$/iu, "")
        .replace(/\s+Entrance$/iu, "");
      const names = new Map<string, { name: string; alias: boolean }>();
      for (const [name, alias] of [[dungeon.name, false], [markerName, true], [shortName, true]] as const) {
        if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), { name, alias });
      }
      return [...names.values()].map(({ name, alias }) => ({ name, mapId: location.mapId,
        markerId: location.markerId, alias }));
    });
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const key = candidate.name.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return candidates.filter((candidate) => counts.get(candidate.name.toLowerCase()) === 1);
}

export function questLocationTargets(
  entry: ReferenceEntry,
  links: ReferenceLink[] = [],
  regions?: QuestLocationTarget[],
  objective?: { step: number; text: string },
  mapMarkers: QuestMapMarkerCandidate[] = [],
  dungeonTargets: QuestLocationTarget[] = [],
): QuestLocationTarget[] {
  const targets: QuestLocationTarget[] = [];
  const text = objective?.text ?? entry.description ?? "";
  const linkedReferences = new Map<string, Set<string>>();
  for (const link of links) {
    if (link.category !== "creatures" && link.category !== "exploration" && link.category !== "travel") continue;
    const key = link.name.toLowerCase();
    const ids = linkedReferences.get(key) ?? new Set<string>();
    ids.add(link.id);
    linkedReferences.set(key, ids);
  }
  const linkedReferenceIds = new Set([...linkedReferences.values()].flatMap((ids) => [...ids]));
  for (const target of QUEST_TEXT_MAP_TARGETS) {
    if (target.questId !== entry.id) continue;
    const match = target.match.exec(text);
    if (match) targets.push({ name: match[0], mapId: target.mapId, markerId: target.markerId });
  }
  for (const link of links) {
    if (link.category !== "creatures" && link.category !== "exploration" && link.category !== "travel") continue;
    if (linkedReferences.get(link.name.toLowerCase())?.size !== 1) continue;
    const locations = entry.locations.filter((item) => item.name.endsWith(` · ${link.name}`)
      && mapMarkers.some((marker) => marker.mapId === item.mapId && marker.markerId === item.markerId
        && marker.referenceId === link.id));
    const singleObject = objective && link.category === "exploration" && links.length === 1;
    // A differently worded objective can use its exact object ID, including repeated spawns.
    if (!locations.length || (link.category === "exploration" && locations.length !== 1 && !singleObject)) continue;
    const singleCreature = link.category === "creatures"
      && links.filter((candidate) => candidate.category === "creatures").length === 1;
    const shortName = objective && singleCreature
      ? /^(?:Talk to|Defeat) (?:the )?([\p{Lu}][\p{L}'’-]+)(?:\b|$)/u.exec(objective.text)?.[1] : undefined;
    const targetName = shortName && link.name.endsWith(` ${shortName}`) ? shortName
      : singleObject && findQuestLocationName(objective.text, link.name) < 0 ? objective.text : link.name;
    targets.push({
      name: targetName, mapId: locations[0].mapId, markerId: locations[0].markerId,
      referenceId: link.id,
      ...(locations.length > 1 && { search: { referenceId: link.id, name: link.name,
        region: "", allRegions: true } }),
    });
  }
  if (objective) {
    for (const target of QUEST_OBJECTIVE_MAP_TARGETS) {
      if (target.questId !== entry.id || target.step !== objective.step) continue;
      const match = target.match.exec(objective.text);
      if (match) targets.push({ name: match[0], mapId: target.mapId, markerId: target.markerId,
        ...("searchReferenceId" in target && { search: {
          referenceId: target.searchReferenceId, name: match[0], region: "", allRegions: true,
        } }),
      });
    }
    for (const target of dungeonTargets) {
      if (target.alias && mapMarkers.some((marker) => marker.name.toLowerCase() === target.name.toLowerCase()
        && marker.markerId !== target.markerId && marker.markerId.includes("-npc-"))) continue;
      const explicitDungeon = links.some((link) => link.category === "dungeons"
        && link.name.toLowerCase() === target.name.toLowerCase());
      const travelStep = /^(?:Go|Head to|Enter|Complete|Open|Investigate|Find)\b/iu.test(objective.text);
      const namedEntrance = objective.text.toLowerCase().endsWith(`${target.name.toLowerCase()} entrance`);
      const examineDestination = /^(?:Check|Examine)\b/iu.test(objective.text)
        && objective.text.toLowerCase().endsWith(target.name.toLowerCase());
      if ((explicitDungeon || travelStep || namedEntrance || examineDestination)
        && findQuestLocationName(objective.text, target.name) >= 0) {
        targets.push(target);
      }
    }
  }
  const locationGroups = new Map<string, QuestLocationTarget[]>();
  for (const location of entry.locations) {
    const name = location.name.split(" · ").at(-1)?.trim();
    if (!name) continue;
    const linkedIds = linkedReferences.get(name.toLowerCase());
    if (linkedIds && linkedIds.size !== 1) continue;
    const matchedMarker = mapMarkers.find((marker) => marker.mapId === location.mapId
      && marker.markerId === location.markerId);
    if (linkedIds && (!matchedMarker || !linkedIds.has(matchedMarker.referenceId))) continue;
    if (objective && linkedReferenceIds.size && matchedMarker
      && !linkedReferenceIds.has(matchedMarker.referenceId)) continue;
    const group = locationGroups.get(name.toLowerCase()) ?? [];
    if (!group.some((point) => point.mapId === location.mapId && point.markerId === location.markerId)) {
      group.push({ name, mapId: location.mapId, markerId: location.markerId,
        referenceId: matchedMarker?.referenceId ?? location.referenceId });
    }
    locationGroups.set(name.toLowerCase(), group);
  }
  const questRegion = entry.adventure?.region;
  for (const group of locationGroups.values()) {
    if (group.length === 1) targets.push(group[0]!);
    else if (questRegion && group[0]?.name.endsWith(" Entrance")) {
      const entrance = group[0].name;
      const regionalLocations = entry.locations.filter((location) =>
        location.name.startsWith(`${questRegion} (`)
        && location.name.endsWith(` · ${entrance}`)
        && group.some((point) => point.mapId === location.mapId && point.markerId === location.markerId));
      if (regionalLocations.length === 1) {
        targets.push({ name: entrance.slice(0, -" Entrance".length),
          mapId: regionalLocations[0].mapId, markerId: regionalLocations[0].markerId });
      }
    }
  }
  if (regions) targets.push(...regions);
  else for (const map of questMapDefinitions(entry)) {
    targets.push(...questRegionTargets(map, map.regionLabels ?? []));
  }
  targets.push(...questMapMarkerTargets(mapMarkers.filter((marker) => {
    if (objective && QUEST_OBJECTIVE_MAP_EXCLUSIONS.some((excluded) =>
      excluded.questId === entry.id && excluded.step === objective.step
      && "referenceId" in excluded && excluded.referenceId === marker.referenceId)) return false;
    if (linkedReferenceIds.size && !linkedReferenceIds.has(marker.referenceId)) return false;
    const ids = linkedReferences.get(marker.name.toLowerCase());
    return !ids || ids.has(marker.referenceId);
  })));
  const seen = new Set<string>();
  return targets.filter((target) => {
    if (objective && isRelativeLandmark(objective.text, target.name)) return false;
    if (objective && isPossessiveMention(objective.text, target.name)
      && !(target.referenceId && linkedReferenceIds.has(target.referenceId))) return false;
    if (objective && QUEST_OBJECTIVE_MAP_EXCLUSIONS.some((excluded) =>
      excluded.questId === entry.id && excluded.step === objective.step
      && "markerId" in excluded && excluded.markerId === target.markerId)) return false;
    const key = target.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.name.length - a.name.length);
}
