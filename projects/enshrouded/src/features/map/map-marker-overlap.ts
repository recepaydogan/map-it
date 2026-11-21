import type { ProjectedMapPoint } from "./map-clustering";
import type { MapPoint } from "./types";
import { isQuestPoint } from "./map-faction-filter";

const NEAR_COINCIDENT_PX = 4;
const NEAR_COINCIDENT_WORLD_UNITS = 1.5;
const OVERLAP_STEP_PX = 10;
const QUEST_GROUP_MINIMUM = 2;
const QUEST_GROUP_WORLD_UNITS = 3;

export interface MapQuestGroup {
  key: string;
  members: MapPoint[];
  x: number;
  y: number;
}

/** A screen overlap is only relevant when the underlying map locations also coincide. */
const groupNearCoincidentPoints = (points: ProjectedMapPoint[]) => {
  const groups: { anchor: ProjectedMapPoint; members: ProjectedMapPoint[] }[] = [];
  const cells = new Map<string, number[]>();
  const ordered = [...points].sort((left, right) =>
    left.point.x - right.point.x || left.point.y - right.point.y
    || left.point.id.localeCompare(right.point.id));

  for (const entry of ordered) {
    const cellX = Math.floor(entry.left / NEAR_COINCIDENT_PX);
    const cellY = Math.floor(entry.top / NEAR_COINCIDENT_PX);
    let match = -1;
    let closest = NEAR_COINCIDENT_PX;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const groupIndex of cells.get(`${cellX + dx}:${cellY + dy}`) ?? []) {
          const anchor = groups[groupIndex]!.anchor;
          if (Math.hypot(entry.point.x - anchor.point.x, entry.point.y - anchor.point.y) > NEAR_COINCIDENT_WORLD_UNITS) continue;
          const distance = Math.hypot(entry.left - anchor.left, entry.top - anchor.top);
          if (distance > closest) continue;
          closest = distance;
          match = groupIndex;
        }
      }
    }
    if (match >= 0) {
      groups[match]!.members.push(entry);
    } else {
      const key = `${cellX}:${cellY}`;
      const cell = cells.get(key) ?? [];
      cell.push(groups.length);
      cells.set(key, cell);
      groups.push({ anchor: entry, members: [entry] });
    }
  }
  return groups.map(({ members }) => members);
};

/** Quest groups use map coordinates so their membership stays fixed at every zoom. */
export const createNearQuestGroups = (points: MapPoint[]): MapQuestGroup[] => {
  const groups: { anchor: MapPoint; members: MapPoint[] }[] = [];
  const cells = new Map<string, number[]>();
  const ordered = points.filter((point) => isQuestPoint(point)
    && !("questGiverMarkerId" in point && point.questGiverMarkerId)).sort((left, right) =>
    left.x - right.x || left.y - right.y || left.id.localeCompare(right.id));

  for (const point of ordered) {
    const cellX = Math.floor(point.x / QUEST_GROUP_WORLD_UNITS);
    const cellY = Math.floor(point.y / QUEST_GROUP_WORLD_UNITS);
    let match = -1;
    let closest = QUEST_GROUP_WORLD_UNITS;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const groupIndex of cells.get(`${cellX + dx}:${cellY + dy}`) ?? []) {
          const anchor = groups[groupIndex]!.anchor;
          const distance = Math.hypot(point.x - anchor.x, point.y - anchor.y);
          if (distance > closest) continue;
          closest = distance;
          match = groupIndex;
        }
      }
    }
    if (match >= 0) {
      groups[match]!.members.push(point);
    } else {
      const key = `${cellX}:${cellY}`;
      const cell = cells.get(key) ?? [];
      cell.push(groups.length);
      cells.set(key, cell);
      groups.push({ anchor: point, members: [point] });
    }
  }

  return groups.filter(({ members }) => members.length >= QUEST_GROUP_MINIMUM)
    .map(({ members }) => {
      const quests = members.sort((left, right) => left.id.localeCompare(right.id));
      return {
        key: `quest-group:${quests[0]!.id}`,
        members: quests,
        x: quests.reduce((sum, point) => sum + point.x, 0) / quests.length,
        y: quests.reduce((sum, point) => sum + point.y, 0) / quests.length,
      };
    });
};

/** At distant zoom, each giver's linked offers share one compact pin. */
export const createLinkedQuestGroups = (points: MapPoint[]): MapQuestGroup[] => {
  const byGiver = new Map<string, MapPoint[]>();
  for (const point of points) {
    const giverId = "questGiverMarkerId" in point ? point.questGiverMarkerId : undefined;
    if (!giverId || !isQuestPoint(point)) continue;
    const quests = byGiver.get(giverId) ?? [];
    quests.push(point);
    byGiver.set(giverId, quests);
  }
  return [...byGiver].filter(([, quests]) => quests.length >= QUEST_GROUP_MINIMUM)
    .map(([giverId, quests]) => {
      quests.sort((left, right) => left.id.localeCompare(right.id));
      return { key: `linked-quest-group:${giverId}`, members: quests,
        x: quests.reduce((sum, quest) => sum + quest.x, 0) / quests.length,
        y: quests.reduce((sum, quest) => sum + quest.y, 0) / quests.length };
    });
};

/** Keep the small offset for other marker types; quest pins use groups or their real positions. */
export const spreadCoincidentMapPoints = (points: ProjectedMapPoint[]): ProjectedMapPoint[] => {
  const indexById = new Map(points.map((entry, index) => [entry.point.id, index]));
  const spread = [...points];
  for (const group of groupNearCoincidentPoints(points.filter(({ point }) => !isQuestPoint(point)))) {
    if (group.length < 2) continue;
    group.sort((left, right) => left.point.id.localeCompare(right.point.id));
    const center = group.reduce((sum, entry) => sum + entry.left, 0) / group.length;
    group.forEach((entry, position) => {
      spread[indexById.get(entry.point.id)!] = {
        ...entry,
        left: center + (position - (group.length - 1) / 2) * OVERLAP_STEP_PX,
      };
    });
  }
  return spread;
};
