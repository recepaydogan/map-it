export interface PersistentSubchunkKeySchema {
  tag: number;
  omittedDimension: number;
  dimensions: readonly number[];
}

export interface PersistentSubchunkKey {
  chunkX: number;
  chunkZ: number;
  dimension: number;
  sectionY: number;
}

const validInt32 = (value: number) => Number.isSafeInteger(value) && value >= -2147483648 && value <= 2147483647;

/** Parses the compact x/z/[dimension]/tag/Y key used by persistent chunk stores. */
export const parsePersistentSubchunkKey = (bytes: Uint8Array, schema: PersistentSubchunkKeySchema): PersistentSubchunkKey | null => {
  if (!(bytes instanceof Uint8Array) || (bytes.length !== 10 && bytes.length !== 14) || !Number.isInteger(schema.tag) || schema.tag < 0 || schema.tag > 255)
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dimension = bytes.length === 10 ? schema.omittedDimension : view.getInt32(8, true);
  const tagOffset = bytes.length - 2;
  if (bytes[tagOffset] !== schema.tag || !schema.dimensions.includes(dimension) || bytes.length === 14 && dimension === schema.omittedDimension) return null;
  return { chunkX: view.getInt32(0, true), chunkZ: view.getInt32(4, true), dimension, sectionY: view.getInt8(bytes.length - 1) };
};

export const encodePersistentSubchunkKey = (key: PersistentSubchunkKey, schema: PersistentSubchunkKeySchema): Uint8Array => {
  if (!validInt32(key.chunkX) || !validInt32(key.chunkZ) || !validInt32(key.dimension) || !Number.isSafeInteger(key.sectionY) ||
    key.sectionY < -128 || key.sectionY > 127 || !schema.dimensions.includes(key.dimension) ||
    !Number.isInteger(schema.tag) || schema.tag < 0 || schema.tag > 255) throw new Error("Invalid persistent subchunk key");
  const omitted = key.dimension === schema.omittedDimension, bytes = new Uint8Array(omitted ? 10 : 14);
  const view = new DataView(bytes.buffer); view.setInt32(0, key.chunkX, true); view.setInt32(4, key.chunkZ, true);
  if (!omitted) view.setInt32(8, key.dimension, true);
  bytes[bytes.length - 2] = schema.tag; view.setInt8(bytes.length - 1, key.sectionY); return bytes;
};
