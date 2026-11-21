export interface MapIsometricInfo {
  w: number;
  h: number;
  x0: number;
  y0: number;
  sqr: number;
  scale: number;
  minlayer: number;
  maxlayer: number;
  cell_size: number;
  cell_rects?: Array<[x: number, y: number, width: number, height: number]>;
}

export interface MapIsometricFloor {
  floor: number;
  tileSize: number;
  format: string;
  width: number;
  height: number;
  levels: number[];
  pyramidMaximumLevel?: number;
  tileRanges?: Record<string, Array<[row: number, minimumColumn: number, maximumColumn: number]>>;
}

export interface MapIsometricCumulativeFloor extends MapIsometricFloor {
  layerName: string;
  sourceFloors: number[];
}

export interface MapIsometricManifest {
  id: string;
  basePath: string;
  tileSourceKind?: "dzi" | "direct";
  renderer: string;
  rendererCommit: string;
  sourceFingerprint?: string;
  renderProfile?: {
    scope: "global" | "pack";
    layerRange: [minimum: number, maximumExclusive: number] | "all";
    baseImageFormat: "jpg" | "webp";
    imageFormat: "webp";
    quality: number;
    maximumDetailReduction?: number;
  };
  generatedAt: string;
  cellRange: [x: number, y: number, width: number, height: number];
  layerRange: [minimum: number, maximumExclusive: number];
  complete: boolean;
  mapInfo: MapIsometricInfo;
  floors: MapIsometricFloor[];
  cumulativeFloors?: MapIsometricCumulativeFloor[];
}

export interface MapIsometricCatalog {
  schemaVersion: number;
  generatedAt: string;
  worldCellRange: [x: number, y: number, width: number, height: number];
  cellSize: number;
  totalCells: number;
  renderedCells: number;
  complete: boolean;
  floors: number[];
  packs: MapIsometricManifest[];
}
