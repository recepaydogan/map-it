const SECTOR_BYTES = 4096;
const REGION_EDGE = 32;
const SLOT_COUNT = REGION_EDGE ** 2;
const HEADER_BYTES = SECTOR_BYTES * 2;

export interface RegionPayload {
  slot: number;
  chunkX: number;
  chunkZ: number;
  timestampSeconds: number;
  compressionId: number;
  /** External payloads require separately authorized files; never resolve paths implicitly. */
  external: boolean;
  data: Uint8Array;
}

/**
 * Read-only sector-table validation and payload extraction from an owned file snapshot.
 * This does not decode compression/NBT, infer a world/edition, or open any filesystem path.
 * Callers must enforce the file-size limit before reading the file into memory as well.
 * Null entries are absent coverage, not empty chunks.
 */
export const readSectorRegion = (
  bytes: Uint8Array, regionX: number, regionZ: number, maxBytes = 64 * 1024 * 1024,
): (RegionPayload | null)[] => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < HEADER_BYTES ||
    !(bytes instanceof Uint8Array) || bytes.byteLength > maxBytes)
    throw new Error("Region snapshot exceeds the configured byte limit");
  if (bytes.byteLength < HEADER_BYTES || bytes.byteLength % SECTOR_BYTES !== 0)
    throw new Error("Truncated or unaligned region snapshot");
  if (![regionX, regionZ].every(value => Number.isSafeInteger(value) &&
    Number.isSafeInteger(value * REGION_EDGE) && Number.isSafeInteger(value * REGION_EDGE + REGION_EDGE - 1)))
    throw new Error("Invalid region coordinates");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectors = bytes.byteLength / SECTOR_BYTES;
  const owners = new Int16Array(sectors).fill(-1);
  owners[0] = owners[1] = -2;
  const entries: (Omit<RegionPayload, "data"> & { start: number; end: number } | null)[] = [];
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const location = view.getUint32(slot * 4, false);
    const firstSector = location >>> 8;
    const count = location & 255;
    if (firstSector === 0 && count === 0) { entries.push(null); continue; }
    if (firstSector < 2 || count === 0 || firstSector + count > sectors)
      throw new Error(`Invalid sector allocation at slot ${slot}`);
    for (let sector = firstSector; sector < firstSector + count; sector++) {
      if (owners[sector] !== -1) throw new Error(`Overlapping region allocation at slot ${slot}`);
      owners[sector] = slot;
    }
    const offset = firstSector * SECTOR_BYTES;
    // Length includes the compression byte, but not its own four-byte field.
    const length = view.getUint32(offset, false);
    if (length < 1 || length + 4 > count * SECTOR_BYTES)
      throw new Error(`Invalid chunk payload length at slot ${slot}`);
    const compression = view.getUint8(offset + 4);
    const external = (compression & 128) !== 0;
    if (external && length !== 1) throw new Error(`External chunk contains an inline payload at slot ${slot}`);
    if (!external && length === 1) throw new Error(`Empty inline chunk payload at slot ${slot}`);
    entries.push({
      slot, chunkX: regionX * REGION_EDGE + slot % REGION_EDGE,
      chunkZ: regionZ * REGION_EDGE + Math.floor(slot / REGION_EDGE),
      timestampSeconds: view.getUint32(SECTOR_BYTES + slot * 4, false),
      compressionId: compression & 127, external, start: offset + 5, end: offset + 4 + length,
    });
  }
  // Copy only after validating every allocation; later input mutations cannot alter payloads.
  return entries.map(entry => {
    if (!entry) return null;
    const { start, end, ...metadata } = entry;
    return { ...metadata, data: new Uint8Array(bytes.subarray(start, end)) };
  });
};
