import { EVENT_SERVER_REGIONS, type EventServerRegion } from "../../game-config.ts";

export function isEventServerRegion(value: unknown): value is EventServerRegion {
  return typeof value === "string" && EVENT_SERVER_REGIONS.some((region) => region.key === value);
}

export function eventServerTimeZone(region: EventServerRegion | null): string | null {
  return EVENT_SERVER_REGIONS.find((entry) => entry.key === region)?.timeZone ?? null;
}
