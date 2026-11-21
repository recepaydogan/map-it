import type { ReferenceEntry, ReferenceLocation } from "./reference-types";

/** A teleport artifact defines an arrival waypoint, not an outbound route. */
export const isCurrentTravelDestination = (entry: ReferenceEntry, marker?: Pick<ReferenceLocation, "mapId" | "markerId">) =>
  entry.travel?.kind === "teleport" && !!marker && entry.locations.some((location) =>
    location.mapId === marker.mapId && location.markerId === marker.markerId);
