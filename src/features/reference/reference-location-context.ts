import { createContext } from "react";
import type { ReferenceLocation } from "./reference-types";

/** The map marker whose details host the current reference navigation. */
export const ReferenceLocationContext = createContext<Pick<ReferenceLocation, "mapId" | "markerId"> | null>(null);
