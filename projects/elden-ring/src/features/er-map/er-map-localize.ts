import type { TFunction } from "i18next";
import { localizeErMapText, erMapText } from "../../data/er-map-text";
import type { RawErMapMarker } from "./types";

/**
 * Display-time localization for the raw ER-map markers. The streamed JSON is the
 * frozen English source of truth (structure + text); for a non-English language
 * every TEXT field is swapped on a COPY — ids, coordinates and relationships are
 * inherited verbatim, so a marker can never move or disappear with the language.
 *
 * Two exact text sources, mirroring the split the extractors made:
 *  • game text (names / regions / connection targets / dungeon links) → the flat
 *    FMG dictionary (er-map-text.ts), keyed by the exact English string;
 *  • app-authored constants ("Spawn Point", "Portal → X", the connection blurb) →
 *    UI catalog keys, exactly keyed by the marker's category — never by guesswork.
 */

/** Categories whose baked names are app-authored constants, not game text. */
const SYNTHETIC_NAME_CATEGORIES = new Set([
  "connection", "spawn-point", "elevator", "interaction", "summon-pool",
  "summon-sign", "stake-of-marika", "spiritspring", "waygate",
]);

const localizeName = (marker: RawErMapMarker, t: TFunction): string => {
  if (marker.category === "connection" && marker.connectionTarget) {
    return t("erMap.portalName", {
      target: localizeErMapText(marker.connectionTarget),
      defaultValue: marker.name,
    });
  }
  if (SYNTHETIC_NAME_CATEGORIES.has(marker.category)) {
    return t(`erMap.markerNames.${marker.category}`, { defaultValue: marker.name });
  }
  return localizeErMapText(marker.name);
};

const localizeMarker = (marker: RawErMapMarker, t: TFunction): RawErMapMarker => {
  // enName keeps the English original alive — enemy portraits are keyed by it.
  const localized: RawErMapMarker = { ...marker, name: localizeName(marker, t), enName: marker.name };
  if (marker.region) localized.region = localizeErMapText(marker.region);
  if (marker.connectionTarget) {
    localized.connectionTarget = localizeErMapText(marker.connectionTarget);
    // The baked description is exactly the extractor's "Loading-zone boundary…"
    // template around the same target — re-render it through the UI catalog.
    if (marker.description) {
      localized.description = t("erMap.connectionDesc", {
        target: localized.connectionTarget,
        defaultValue: marker.description,
      });
    }
  }
  if (marker.connectionOptions) {
    localized.connectionOptions = marker.connectionOptions.map((option) => ({
      ...option,
      name: localizeErMapText(option.name),
    }));
    // The hub blurb is app-authored constant text (builder merge pass) — re-render
    // it through the UI catalog like the other synthetic connection prose.
    if (marker.description) {
      localized.description = t("erMap.portalHubDesc", { defaultValue: marker.description });
    }
  }
  if (marker.dungeonBosses) {
    localized.dungeonBosses = marker.dungeonBosses.map((boss) => ({
      ...boss,
      name: localizeErMapText(boss.name),
    }));
  }
  if (marker.dungeonEntrances) {
    localized.dungeonEntrances = marker.dungeonEntrances.map((entrance) => ({
      ...entrance,
      name: localizeErMapText(entrance.name),
    }));
  }
  return localized;
};

/**
 * Localize a raw marker array for display. English (no dictionary applied) hands
 * back the ORIGINAL array untouched — same identity, zero cost.
 */
export const localizeRawMarkers = (
  markers: RawErMapMarker[],
  t: TFunction,
): RawErMapMarker[] =>
  erMapText === null ? markers : markers.map((marker) => localizeMarker(marker, t));
