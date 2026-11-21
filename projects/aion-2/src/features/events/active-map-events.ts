import { nextOccurrence, type ScheduledEvent } from "./event-schedule.ts";
import { occurrencesInWindow } from "./event-schedule.ts";
import { gameEventTextKey } from "../../game-config.ts";
import type { TFunction } from "i18next";

/** A short map cue after the scheduled spawn, not an estimate of boss lifetime. */
export const WORLD_BOSS_SPAWN_CUE_MS = 5 * 60_000;

export interface ActiveMapEvents {
  byMarkerId: Map<string, ScheduledEvent[]>;
  nextChangeAt: number | null;
}

export function activeMapEventNames(events: ScheduledEvent[], gameText: (english: string, key?: string) => string): string {
  return events.map((event) => gameText(event.name, gameEventTextKey(event.id))).join(", ");
}

export function activeMapEventStatus(events: ScheduledEvent[], gameText: (english: string, key?: string) => string, t: TFunction): string {
  const running = events.filter((event) => event.kind !== "world-boss");
  const spawns = events.filter((event) => event.kind === "world-boss");
  return [
    running.length ? t("events.mapMarkerStatus", { names: activeMapEventNames(running, gameText) }) : "",
    spawns.length ? t("events.mapBossSpawnStatus", { names: activeMapEventNames(spawns, gameText) }) : "",
  ].filter(Boolean).join(" · ");
}

/** Bosses receive a short spawn cue; the map never claims they are still alive. */
export function activeMapEvents(events: ScheduledEvent[], mapId: string, now: number, timeZone: string | null): ActiveMapEvents {
  const byMarkerId = new Map<string, ScheduledEvent[]>();
  if (!timeZone) return { byMarkerId, nextChangeAt: null };

  let nextChangeAt: number | null = null;
  for (const event of events) {
    const targets = event.mapTargets ?? (event.mapTarget ? [event.mapTarget] : []);
    const markerIds = [...new Set(targets
      .filter((target) => target.mapId === mapId && !target.markerId.startsWith("region:"))
      .map((target) => target.markerId))];
    if (!markerIds.length) continue;

    const occurrence = nextOccurrence(event, now, timeZone);
    if (!occurrence) continue;
    const recentSpawn = event.kind === "world-boss"
      ? occurrencesInWindow(event, now - WORLD_BOSS_SPAWN_CUE_MS, now, timeZone).at(-1)
      : undefined;
    const spawnCue = Boolean(recentSpawn && now < recentSpawn.start + WORLD_BOSS_SPAWN_CUE_MS);
    const changeAt = spawnCue ? recentSpawn!.start + WORLD_BOSS_SPAWN_CUE_MS
      : occurrence.active ? occurrence.end : occurrence.start;
    if (changeAt > now && (nextChangeAt === null || changeAt < nextChangeAt)) nextChangeAt = changeAt;
    if (!occurrence.active && !spawnCue) continue;

    for (const markerId of markerIds) {
      const active = byMarkerId.get(markerId) ?? [];
      active.push(event);
      byMarkerId.set(markerId, active);
    }
  }
  return { byMarkerId, nextChangeAt };
}
