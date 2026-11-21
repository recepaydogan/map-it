import { decompressBounded } from "./decompress-bounded.ts";
import type { PayloadCompression } from "./decompress-bounded.ts";
import { readBoundedNbt } from "./read-bounded-nbt.ts";
import type { NbtReadOptions } from "./read-bounded-nbt.ts";
import { readPalettedColumn } from "./read-paletted-column.ts";
import type { ColumnReadContext, DecodedColumn } from "./read-paletted-column.ts";
import type { RegionPayload } from "./read-sector-region.ts";

export interface RegionColumnOptions {
  tags: NbtReadOptions;
  compressionModes: Readonly<Record<number, PayloadCompression>>;
  maxCompressedBytes?: number;
}

/** Region slot → bounded expansion → typed tags → validated, normalized voxel sections. */
export const readRegionColumn = async (
  payload: RegionPayload, context: ColumnReadContext, options: RegionColumnOptions,
): Promise<DecodedColumn & { timestampSeconds: number }> => {
  if (payload.external) throw new Error("External region streams require a separate authorized snapshot");
  if (payload.chunkX !== context.chunkX || payload.chunkZ !== context.chunkZ)
    throw new Error("Region slot does not match the requested column");
  const compression = Object.hasOwn(options.compressionModes, payload.compressionId)
    ? options.compressionModes[payload.compressionId] : undefined;
  if (!compression) throw new Error("Unsupported region compression identifier");
  const bytes = await decompressBounded(payload.data, compression, {
    maxInputBytes: options.maxCompressedBytes, maxOutputBytes: options.tags.maxBytes,
    signal: options.tags.signal,
  });
  const { root } = readBoundedNbt(bytes, { ...options.tags, allowTrailing: false });
  return { ...readPalettedColumn(root, context), timestampSeconds: payload.timestampSeconds };
};
