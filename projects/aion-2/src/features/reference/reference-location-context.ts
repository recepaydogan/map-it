import { createContext } from "react";
import type { ReferenceLocation } from "./reference-types";

/** The map marker whose details host the current reference navigation. */
export const ReferenceLocationContext = createContext<Pick<ReferenceLocation, "mapId" | "markerId"> | null>(null);

export const navigableReferenceLocations = (
  locations: ReferenceLocation[], current: Pick<ReferenceLocation, "mapId" | "markerId"> | null,
) => locations.filter((location) => location.mapId !== current?.mapId || location.markerId !== current.markerId);
