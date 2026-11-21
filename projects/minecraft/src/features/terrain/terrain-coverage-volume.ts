import type { Point3 } from "./orbit-camera.ts";

export type TerrainCoverageState = "checking" | "ready" | "partial";
export interface TerrainCoverageVolume {
  readonly x: number;
  readonly z: number;
  readonly minY: number;
  readonly maxY: number;
  readonly state: TerrainCoverageState;
}
export interface TerrainCoveragePaths {
  readonly checking: readonly (readonly Point3[])[];
  readonly ready: readonly (readonly Point3[])[];
  readonly partial: readonly (readonly Point3[])[];
}
export interface TerrainCoverageSection {
  readonly id: string;
  readonly origin: readonly [number, number, number];
  readonly status: "ready" | "partial";
}

const MAX_VOLUMES = 128;
const empty = (): Record<TerrainCoverageState, Point3[][]> => ({ checking: [], ready: [], partial: [] });
const coverageState = (value: unknown): value is TerrainCoverageState => ["checking", "ready", "partial"].includes(String(value));

export const checkingTerrainCoverageVolumes = (columns: readonly Readonly<{ chunkX: number; chunkZ: number }>[],
  minSectionY: number, maxSectionY: number): readonly Readonly<TerrainCoverageVolume>[] => {
  if (!Array.isArray(columns) || columns.length > MAX_VOLUMES || ![minSectionY, maxSectionY].every(Number.isSafeInteger) || maxSectionY < minSectionY)
    throw new Error("Invalid checking terrain coverage");
  const entries = columns as readonly Readonly<{ chunkX: number; chunkZ: number }>[];
  return Object.freeze(entries.map(column => {
    if (![column.chunkX, column.chunkZ].every(Number.isSafeInteger)) throw new Error("Invalid checking terrain column");
    const volume = { x: column.chunkX * 16, z: column.chunkZ * 16, minY: minSectionY * 16,
      maxY: (maxSectionY + 1) * 16, state: "checking" as const };
    if (![volume.x, volume.z, volume.minY, volume.maxY].every(Number.isSafeInteger))
      throw new Error("Invalid checking terrain column bounds");
    return Object.freeze(volume);
  }));
};

export const loadedTerrainCoverageVolumes = (sections: readonly Readonly<TerrainCoverageSection>[]): readonly Readonly<TerrainCoverageVolume>[] => {
  if (!Array.isArray(sections) || sections.length > 256) throw new Error("Invalid loaded terrain coverage");
  const columns = new Map<string, TerrainCoverageVolume>();
  for (const section of sections as readonly Readonly<TerrainCoverageSection>[]) {
    if (!section || typeof section.id !== "string" || !section.id || !Array.isArray(section.origin) || section.origin.length !== 3 ||
      !section.origin.every(Number.isSafeInteger) || !["ready", "partial"].includes(section.status))
      throw new Error("Invalid loaded terrain coverage section");
    const [x, y, z] = section.origin, key = `${x},${z}`, previous = columns.get(key);
    const state = section.status === "partial" || previous?.state === "partial" ? "partial" : "ready";
    columns.set(key, { x, z, minY: Math.min(previous?.minY ?? y, y), maxY: Math.max(previous?.maxY ?? y + 16, y + 16), state });
  }
  if (columns.size > MAX_VOLUMES) throw new Error("Loaded terrain coverage exceeds its column limit");
  return Object.freeze([...columns.values()]
    .sort((left, right) => left.x - right.x || left.z - right.z)
    .map(volume => Object.freeze(volume)));
};

/** Wireframes describe only source-backed loaded/checking bounds; their exterior remains unknown. */
export const terrainCoverageVolumePaths = (volumes: readonly Readonly<TerrainCoverageVolume>[], cutawayY: number | null): TerrainCoveragePaths => {
  if (!Array.isArray(volumes) || volumes.length > MAX_VOLUMES || cutawayY !== null && !Number.isSafeInteger(cutawayY))
    throw new Error("Invalid terrain coverage volumes");
  const paths = empty();
  const entries = volumes as readonly Readonly<TerrainCoverageVolume>[];
  for (const volume of entries) {
    if (!volume || ![volume.x, volume.z, volume.minY, volume.maxY].every(Number.isSafeInteger) ||
      !coverageState(volume.state) || volume.maxY <= volume.minY ||
      Math.abs(volume.x) > 30_000_000 || Math.abs(volume.z) > 30_000_000 ||
      Math.abs(volume.x + 16) > 30_000_000 || Math.abs(volume.z + 16) > 30_000_000)
      throw new Error("Invalid terrain coverage volume");
    const top = cutawayY === null ? volume.maxY : Math.min(volume.maxY, cutawayY + 1);
    if (top <= volume.minY) continue;
    const x0 = volume.x, x1 = volume.x + 16, z0 = volume.z, z1 = volume.z + 16;
    const bottom: Point3[] = [[x0, volume.minY, z0], [x1, volume.minY, z0], [x1, volume.minY, z1],
      [x0, volume.minY, z1], [x0, volume.minY, z0]];
    const upper: Point3[] = [[x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1], [x0, top, z0]];
    paths[volume.state].push(bottom, upper,
      [[x0, volume.minY, z0], [x0, top, z0]], [[x1, volume.minY, z0], [x1, top, z0]],
      [[x1, volume.minY, z1], [x1, top, z1]], [[x0, volume.minY, z1], [x0, top, z1]]);
  }
  return Object.freeze({ checking: Object.freeze(paths.checking), ready: Object.freeze(paths.ready), partial: Object.freeze(paths.partial) });
};
