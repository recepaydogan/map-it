import type { TFunction } from "i18next";
import { GAME_FACTION_LABEL_KEYS } from "../game-config.ts";

/** Resolve game-specific faction IDs only at the presentation boundary. */
export function factionDisplayName(value: string, t: TFunction, fallback: (value: string) => string): string {
  const key = GAME_FACTION_LABEL_KEYS[value];
  return key ? t(key) : fallback(value);
}
