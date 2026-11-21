import type { MapLocation, MapMetadata, MapTown } from "./types";
import type { MapIsometricManifest } from "./map-isometric-types";
import type { PreparedMapMod } from "./prepared-map-mod-types";

export interface CommunityMapManifest {
  schemaVersion: 1;
  packageType: "pzim-community-map";
  id: string;
  version: string;
  displayName: string;
  description?: string;
  creator: {
    name: string;
    sourceUrl: string;
  };
  rights: {
    license: string;
    licenseUrl?: string;
    permissionStatus: "self-authored" | "explicit";
    permissionEvidenceUrl?: string;
    attribution: string;
  };
  supportedGameBuilds: string[];
  map: {
    coordinateOffset: { x: number; y: number };
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    tileSize: 256 | 512 | 1024;
    detailLevels: number[];
    tilePattern: string;
    locationsFile: string;
  };
}

export interface CommunityMapLocationsFile {
  towns?: MapTown[];
  locations: MapLocation[];
}

export interface InstalledCommunityMap {
  key: string;
  manifest: CommunityMapManifest;
  metadata: MapMetadata;
  installedAt: string;
  assetCount: number;
  uncompressedBytes: number;
}

export interface CommunityMapAsset {
  key: string;
  packageKey: string;
  path: string;
  blob: Blob;
}

export interface PreparedCommunityMapPackage {
  record: InstalledCommunityMap;
  assets: CommunityMapAsset[];
}

export interface MapLibraryEntry {
  key: string;
  displayName: string;
  description?: string;
  creator: string;
  gameBuild: string;
  kind: "builtin" | "community" | "mod";
  metadata?: MapMetadata;
  license?: string;
  licenseUrl?: string;
  sourceUrl?: string;
  attribution?: string;
  permissionStatus?: CommunityMapManifest["rights"]["permissionStatus"];
  installedAt?: string;
  modId?: string;
  workshopId?: string;
  modMapKind?: "add-on" | "replacement";
  modDataUrl?: string;
  modCells?: string[];
  modCellSize?: number;
  isometricOverlays?: MapIsometricManifest[];
  isometricBaseSource?: MapIsometricManifest;
  includesBuiltinMap?: boolean;
  currentGameWorld?: boolean;
  /** Prepared packages in Project Zomboid Map Order (highest priority first). */
  preparedMods?: PreparedMapMod[];
  /** Individual map folders in Project Zomboid Map Order (highest priority first). */
  preparedMapOrder?: Array<{ modKey: string; cells: string[] }>;
}
