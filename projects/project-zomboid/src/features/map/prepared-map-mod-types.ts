import type { MapIsometricManifest } from "./map-isometric-types";

export interface PreparedMapModOverlay {
  mapFolder: string;
  cells: string[];
  source: MapIsometricManifest;
}

export interface PreparedMapMod {
  key: string;
  modId: string;
  displayName: string;
  workshopId?: string;
  builds: string[];
  kind: "add-on" | "replacement";
  sourceFingerprint: string;
  generatedAt: string;
  dataUrl?: string;
  overlays: PreparedMapModOverlay[];
}

export interface PreparedMapModCatalog {
  schemaVersion: 1;
  generatedAt: string;
  mods: PreparedMapMod[];
}
