import { readSectorRegion, type RegionPayload } from "./read-sector-region.ts";

export const REGION_SNAPSHOT_BYTE_LIMIT = 64 * 1024 * 1024;
export const REGION_SNAPSHOT_COLUMN_LIMIT = 64;
export const REGION_SNAPSHOT_FILE_LIMIT = 8;
export const REGION_SNAPSHOT_TOTAL_BYTE_LIMIT = 64 * 1024 * 1024;

export interface RegionSnapshotSource {
  name: string;
  bytes: Uint8Array;
}

export interface RegionSnapshotRegion {
  name: string;
  regionX: number;
  regionZ: number;
  bytes: number;
}

export interface RegionSnapshotPlan {
  /** The selected region nearest the requested focus; retained for camera reset compatibility. */
  regionX: number;
  regionZ: number;
  regions: readonly RegionSnapshotRegion[];
  totalBytes: number;
  payloads: RegionPayload[];
  available: number;
  missing: number;
  external: number;
  deferred: number;
}

export const parseRegionSnapshotName = (name: string): { regionX: number; regionZ: number } | null => {
  const match = /^r\.(-?\d+)\.(-?\d+)\.mca$/i.exec(name.trim());
  if (!match) return null;
  const regionX = Number(match[1]), regionZ = Number(match[2]);
  return [regionX, regionZ].every(value => Number.isSafeInteger(value) &&
    Number.isSafeInteger(value * 512) && Number.isSafeInteger(value * 512 + 511)) ? { regionX, regionZ } : null;
};

const compareDistance = (left: RegionPayload, right: RegionPayload, focus: { x: number; z: number }) => {
  const distance = (item: RegionPayload) => Math.hypot(item.chunkX * 16 + 8 - focus.x, item.chunkZ * 16 + 8 - focus.z);
  const leftDistance = distance(left), rightDistance = distance(right);
  return leftDistance < rightDistance ? -1 : leftDistance > rightDistance ? 1 :
    left.chunkX - right.chunkX || left.chunkZ - right.chunkZ || left.slot - right.slot;
};

const compareRegionDistance = (left: RegionSnapshotRegion, right: RegionSnapshotRegion, focus: { x: number; z: number }) => {
  const distance = (item: RegionSnapshotRegion) => Math.hypot(item.regionX * 512 + 256 - focus.x, item.regionZ * 512 + 256 - focus.z);
  const leftDistance = distance(left), rightDistance = distance(right);
  return leftDistance < rightDistance ? -1 : leftDistance > rightDistance ? 1 :
    left.regionX - right.regionX || left.regionZ - right.regionZ;
};

/** Select one center-first bounded payload set from explicitly supplied, owned region snapshots. */
export const planRegionSnapshots = (
  sources: readonly RegionSnapshotSource[], focus: { x: number; z: number }, maxColumns = REGION_SNAPSHOT_COLUMN_LIMIT,
): RegionSnapshotPlan => {
  if (![focus.x, focus.z].every(Number.isFinite) || !Number.isSafeInteger(maxColumns) || maxColumns < 1 || maxColumns > 256)
    throw new Error("Invalid region snapshot request.");
  if (!Array.isArray(sources) || !sources.length || sources.length > REGION_SNAPSHOT_FILE_LIMIT)
    throw new Error("Invalid region snapshot file count.");
  const regions: RegionSnapshotRegion[] = [], regionKeys = new Set<string>();
  const inline: RegionPayload[] = [];
  let totalBytes = 0, available = 0, external = 0;
  for (const source of sources) {
    const region = parseRegionSnapshotName(source?.name ?? "");
    if (!region) throw new Error("Region filename must use r.<x>.<z>.mca coordinates.");
    if (!(source.bytes instanceof Uint8Array)) throw new Error("Invalid region snapshot bytes.");
    totalBytes += source.bytes.byteLength;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > REGION_SNAPSHOT_TOTAL_BYTE_LIMIT)
      throw new Error("Region snapshot selection exceeds the configured byte limit.");
    const key = `${region.regionX},${region.regionZ}`;
    if (regionKeys.has(key)) throw new Error("Duplicate region coordinates in snapshot selection.");
    regionKeys.add(key);
    const entries = readSectorRegion(source.bytes, region.regionX, region.regionZ, REGION_SNAPSHOT_BYTE_LIMIT);
    const present = entries.filter(entry => entry !== null);
    available += present.length;
    external += present.filter(entry => entry?.external).length;
    inline.push(...present.filter((entry): entry is RegionPayload => !entry.external));
    regions.push({ name: source.name, ...region, bytes: source.bytes.byteLength });
  }
  regions.sort((left, right) => left.regionX - right.regionX || left.regionZ - right.regionZ);
  inline.sort((left, right) => compareDistance(left, right, focus));
  const payloads = inline.slice(0, maxColumns);
  const focusRegionX = Math.floor(focus.x / 512), focusRegionZ = Math.floor(focus.z / 512);
  const anchor = regions.find(region => region.regionX === focusRegionX && region.regionZ === focusRegionZ) ??
    [...regions].sort((left, right) => compareRegionDistance(left, right, focus))[0];
  return { regionX: anchor.regionX, regionZ: anchor.regionZ, regions, totalBytes, payloads, available,
    missing: regions.length * 1024 - available, external, deferred: inline.length - payloads.length };
};

/** Backwards-compatible single-file entry point used by isolated fixtures. */
export const planRegionSnapshot = (
  name: string, bytes: Uint8Array, focus: { x: number; z: number }, maxColumns = REGION_SNAPSHOT_COLUMN_LIMIT,
): RegionSnapshotPlan => planRegionSnapshots([{ name, bytes }], focus, maxColumns);

export const regionSnapshotContainsPoint = (plan: RegionSnapshotPlan, x: number, z: number): boolean =>
  [x, z].every(Number.isFinite) && plan.regions.some(region =>
    Math.floor(x / 512) === region.regionX && Math.floor(z / 512) === region.regionZ);
