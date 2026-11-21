import type { MapPoint } from "./types";

export interface MapTrainerInfo {
  title?: string;
  faction?: string;
  className?: string;
}

export function getMapTrainerInfo(point: MapPoint): MapTrainerInfo | undefined {
  if (point.category !== "profession-trainer" && point.category !== "class-trainer") return undefined;
  const detail = "trainerTitle" in point && typeof point.trainerTitle === "string"
    ? point.trainerTitle.trim()
    : "detailLabel" in point && typeof point.detailLabel === "string"
      ? point.detailLabel.trim() : point.label.trim();
  // Older profession trainer snapshots put the faction after the title.
  const factionMatch = detail.match(/\s*·\s*(Alliance|Horde|Neutral)$/i);
  return {
    title: (factionMatch ? detail.slice(0, factionMatch.index).trim() : detail) || undefined,
    faction: ("trainerFaction" in point ? point.trainerFaction : undefined) || factionMatch?.[1],
    className: "trainerClass" in point ? point.trainerClass : undefined,
  };
}
