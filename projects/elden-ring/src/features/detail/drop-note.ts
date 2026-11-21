import type { TFunction } from "i18next";

/**
 * Localize a baked drop/shop note. The data ships exactly four English shapes
 * (verified across er-map data + er-markers): "N% drop", "Guaranteed",
 * "Drops on death", "N runes" (comma thousands). Anything else passes through.
 * `compact` renders the percentage form as a bare "N%" (the chip style).
 */
export const localizeDropNote = (
  note: string,
  t: TFunction,
  locale: string,
  opts?: { compact?: boolean },
): string => {
  if (note === "Guaranteed") return t("detail.guaranteed");
  if (note === "Drops on death") return t("detail.dropsOnDeath");
  const pct = note.match(/^(\d+(?:\.\d+)?)% drop$/);
  if (pct) return opts?.compact ? `${pct[1]}%` : t("detail.dropChanceNote", { pct: pct[1] });
  const runes = note.match(/^([\d,]+) runes$/);
  if (runes) {
    return t("detail.runesNote", {
      amount: Number(runes[1].replace(/,/g, "")).toLocaleString(locale),
    });
  }
  return note;
};
