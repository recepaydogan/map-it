import { NbtByte, NbtCompound, NbtInt, NbtList, NbtLongArray, NbtString } from "deepslate/nbt";
import { decodePalettedSection } from "./decode-paletted-section.ts";
import type { PackedSectionLayout } from "./decode-paletted-section.ts";
import { readSavedStructureStarts } from "./read-saved-structure-starts.ts";
import type { SavedStructureStart, SavedStructureTagSchema } from "./read-saved-structure-starts.ts";
import type { VoxelSection, VoxelState } from "./voxel-section.ts";

export interface ColumnTagSchema {
  version: string; x: string; z: string; status: string; fullStatuses: readonly string[];
  sections: string; sectionY: string; storage: string; palette: string;
  stateName: string; properties: string; data: string;
  minBits: number;
  layout: PackedSectionLayout;
  structureStarts?: SavedStructureTagSchema;
}

export interface ColumnReadContext {
  schema: ColumnTagSchema;
  /** Must come from the source's validated edition/release matrix, never a guessed fallback. */
  dataVersion: number;
  chunkX: number;
  chunkZ: number;
  minSectionY: number;
  maxSectionY: number;
}

export interface DecodedColumn {
  chunkX: number; chunkZ: number; dataVersion: number;
  sections: { sectionY: number; voxels: VoxelSection | null }[];
  structureCoverage: "available" | "unavailable";
  structureStarts: readonly Readonly<SavedStructureStart>[];
}

/** Resolve the configured tag schema after bounded decompression and tag parsing. */
export const readPalettedColumn = (root: NbtCompound, context: ColumnReadContext): DecodedColumn => {
  const { schema, dataVersion, chunkX, chunkZ, minSectionY, maxSectionY } = context;
  if (![dataVersion, chunkX, chunkZ, minSectionY, maxSectionY].every(Number.isSafeInteger) ||
    dataVersion < 0 || minSectionY > maxSectionY || maxSectionY - minSectionY >= 256 ||
    !Number.isInteger(schema.minBits) || schema.minBits < 1 || schema.minBits > 16)
    throw new Error("Invalid column read context");
  const integer = (compound: NbtCompound, key: string): number => {
    const tag = compound.get(key);
    if (!(tag instanceof NbtInt)) throw new Error(`Missing or invalid integer tag: ${key}`);
    return tag.getAsNumber();
  };
  if (integer(root, schema.version) !== dataVersion) throw new Error("Column data version does not match the selected source");
  if (integer(root, schema.x) !== chunkX || integer(root, schema.z) !== chunkZ)
    throw new Error("Column coordinates do not match the region slot");
  const status = root.get(schema.status);
  if (!(status instanceof NbtString) || !schema.fullStatuses.includes(status.getAsString()))
    throw new Error("Column generation is incomplete or unsupported");
  const structureMetadata = readSavedStructureStarts(root, schema.structureStarts, { chunkX, chunkZ });
  const sections = root.get(schema.sections);
  if (!(sections instanceof NbtList) || sections.getType() !== 10 || sections.length > 256)
    throw new Error("Missing or invalid column sections");
  const decoded = new Map<number, VoxelSection | null>();
  const seen = new Set<number>();
  for (const entry of sections.getItems()) {
    if (!(entry instanceof NbtCompound)) throw new Error("Invalid section tag");
    const yTag = entry.get(schema.sectionY);
    if (!(yTag instanceof NbtByte)) throw new Error("Invalid section altitude");
    const sectionY = yTag.getAsNumber();
    if (seen.has(sectionY)) throw new Error("Duplicate section altitude");
    seen.add(sectionY);
    const storage = entry.get(schema.storage);
    if (storage === undefined) {
      // Lighting-only sections do not establish block coverage.
      if (sectionY >= minSectionY && sectionY <= maxSectionY) decoded.set(sectionY, null);
      continue;
    }
    if (!(storage instanceof NbtCompound) || sectionY < minSectionY || sectionY > maxSectionY)
      throw new Error("Invalid block storage or unsupported vertical bounds");
    const paletteTag = storage.get(schema.palette);
    if (!(paletteTag instanceof NbtList) || paletteTag.getType() !== 10 || paletteTag.length < 1 || paletteTag.length > 4096)
      throw new Error("Invalid block-state palette");
    const palette: VoxelState[] = paletteTag.getItems().map(state => {
      if (!(state instanceof NbtCompound)) throw new Error("Invalid palette entry");
      const name = state.get(schema.stateName);
      if (!(name instanceof NbtString)) throw new Error("Missing palette state name");
      const propertiesTag = state.get(schema.properties);
      const properties: Record<string, string> = Object.create(null);
      if (propertiesTag !== undefined) {
        if (!(propertiesTag instanceof NbtCompound)) throw new Error("Invalid palette properties");
        propertiesTag.forEach((key, value) => {
          if (!(value instanceof NbtString)) throw new Error("Invalid palette property value");
          properties[key] = value.getAsString();
        });
      }
      return { id: name.getAsString(), properties };
    });
    const bits = palette.length === 1 ? 0 : Math.max(schema.minBits, Math.ceil(Math.log2(palette.length)));
    const packed = storage.get(schema.data);
    if (packed !== undefined && !(packed instanceof NbtLongArray)) throw new Error("Invalid packed block-state tag");
    if (bits > 0 && packed === undefined) throw new Error("Missing packed block-state data");
    const bytes = new Uint8Array((packed?.length ?? 0) * 8);
    const view = new DataView(bytes.buffer);
    packed?.getItems().forEach((value, index) => view.setBigInt64(index * 8, value.toBigInt(), schema.layout.littleEndian));
    decoded.set(sectionY, decodePalettedSection(palette, bytes, bits, schema.layout));
  }
  return {
    chunkX, chunkZ, dataVersion,
    structureCoverage: structureMetadata.coverage,
    structureStarts: structureMetadata.starts,
    sections: Array.from({ length: maxSectionY - minSectionY + 1 }, (_, offset) => {
      const sectionY = minSectionY + offset;
      return { sectionY, voxels: decoded.get(sectionY) ?? null };
    }),
  };
};
