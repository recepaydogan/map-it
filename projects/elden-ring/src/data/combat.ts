import type { TFunction } from "i18next";
import type { Marker } from "./types";

export type Combat = NonNullable<NonNullable<Marker["bossMeta"]>["combat"]>;
export type DamageEntry = Combat["damage"][number];
export type StatusEntry = Combat["status"][number];
export type StatusTier = StatusEntry["tier"];

/**
 * One thematic colour per damage type and status effect — used everywhere combat
 * intel renders so a type reads the same way at a glance. Each is a light hue
 * (≥4.5:1 on the dark surface) used as the text colour; chips tint a faint wash
 * of the same hue behind it.
 */
export const COMBAT_COLOR: Record<string, string> = {
  // Physical family
  Physical: "#94a3b8", // slate — plain steel
  Standard: "#94a3b8",
  Slash: "#cbd5e1", // bright blade
  Strike: "#d6a06a", // blunt bronze
  Pierce: "#5eead4", // sharp point — teal
  // Elemental
  Magic: "#818cf8", // glintstone indigo
  Fire: "#fb923c", // flame orange
  Lightning: "#facc15", // bolt yellow
  Holy: "#fde68a", // golden order
  // Status
  Bleed: "#f87171", // hemorrhage red
  Frostbite: "#7dd3fc", // ice blue
  Poison: "#a3e635", // venom lime
  "Scarlet Rot": "#fb7185", // rotting rose
  Sleep: "#c084fc", // dreaming violet
};

export const colorFor = (type: string): string => COMBAT_COLOR[type] ?? "#a1a1aa";

/** Percentage magnitude of a damage multiplier, e.g. 1.1 → 10, 0.6 → 40. */
export const dmgPct = (mult: number): number => Math.round(Math.abs(mult - 1) * 100);

export const isWeak = (mult: number): boolean => mult >= 1.1;
export const isResist = (mult: number): boolean => mult > 0 && mult <= 0.9;

/** A short "+10%" / "−40%" / "—" tag for a damage multiplier. */
export const dmgTag = (mult: number): string =>
  isWeak(mult) ? `+${dmgPct(mult)}%` : isResist(mult) ? `−${dmgPct(mult)}%` : "—";

/**
 * The one-line headline for the cramped panel: the single best damage approach
 * plus whether any status is worth bringing. Built purely from the real table.
 */
export const combatHeadline = (c: Combat, t: TFunction): string => {
  const label = (type: string) => t(`combatType.${type}`, { defaultValue: type });
  const best = c.damage[0]; // highest multiplier = most vulnerable / least resisted
  let dmg: string;
  if (best && isWeak(best.mult))
    dmg = t("detail.headlineWeak", { type: label(best.type), pct: dmgPct(best.mult) });
  else if (best && best.mult >= 1)
    dmg = t("detail.headlineNoStandout", { type: label(best.type) });
  else if (best)
    dmg = t("detail.headlineArmoured", { type: label(best.type), pct: dmgPct(best.mult) });
  else dmg = t("detail.headlineNoData");

  const top = c.status[0];
  let st = "";
  if (top) {
    if (top.tier === "immune") st = t("detail.headlineStatusImmune");
    else if (top.tier === "effective") st = t("detail.headlineStatusEffective", { type: label(top.type) });
    else if (top.tier === "moderate") st = t("detail.headlineStatusModerate", { type: label(top.type) });
  }
  return st ? `${dmg}. ${st}` : `${dmg}.`;
};
