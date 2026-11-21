import { NbtByte, NbtCompound, NbtInt, NbtString } from "deepslate/nbt";
import { BinaryCursor } from "./binary-cursor.ts";
import { decodePalettedSection } from "./decode-paletted-section.ts";
import type { PackedSectionLayout } from "./decode-paletted-section.ts";
import { assertNotAborted, readBoundedNbt } from "./read-bounded-nbt.ts";
import type { VoxelSection, VoxelState } from "./voxel-section.ts";

export interface LayeredSubchunkSchema {
  versions: Readonly<Record<number, { altitudeByte: boolean }>>;
  stateName: string; properties: string; paletteVersion: string;
  layout: PackedSectionLayout;
}

export interface SubchunkReadContext {
  schema: LayeredSubchunkSchema;
  /** Altitude comes from the validated source key, not the selected camera. */
  sectionY: number;
  /** Palette-state format versions must be validated independently of storage version. */
  paletteVersions: readonly number[];
  maxBytes?: number;
  maxLayers?: number;
  signal?: AbortSignal;
}

export interface DecodedSubchunk {
  storageVersion: number;
  sectionY: number;
  layers: { voxels: VoxelSection; paletteVersions: number[] }[];
}

/** Decode an extracted persistent subchunk value, not a database or network packet. */
export const readLayeredSubchunk = (bytes: Uint8Array, context: SubchunkReadContext): DecodedSubchunk => {
  const { schema, sectionY } = context;
  const maxBytes = context.maxBytes ?? 2 * 1024 * 1024;
  const maxLayers = context.maxLayers ?? 8;
  assertNotAborted(context.signal);
  if (!(bytes instanceof Uint8Array) || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || bytes.length > maxBytes ||
    !Number.isInteger(maxLayers) || maxLayers < 1 || maxLayers > 16 || !Number.isInteger(sectionY) || sectionY < -128 || sectionY > 127 ||
    schema.layout.wordBits !== 32 || !schema.layout.littleEndian || context.paletteVersions.length === 0 ||
    context.paletteVersions.some(value => !Number.isSafeInteger(value) || value < 0))
    throw new Error("Invalid subchunk read context or byte limit");
  const cursor = new BinaryCursor(bytes, true);
  const storageVersion = cursor.byte();
  const version = Object.hasOwn(schema.versions, storageVersion) ? schema.versions[storageVersion] : undefined;
  if (!version) throw new Error("Unsupported subchunk storage version");
  const layerCount = cursor.byte();
  if (layerCount > maxLayers) throw new Error("Subchunk exceeds layer limit");
  if (version.altitudeByte && cursor.signedByte() !== sectionY) throw new Error("Subchunk altitude does not match its source key");
  const layers: DecodedSubchunk["layers"] = [];
  let paletteEntries = 0;
  for (let layer = 0; layer < layerCount; layer++) {
    assertNotAborted(context.signal);
    const header = cursor.byte(), bits = header >> 1;
    if (header & 1) throw new Error("Runtime palettes cannot be read as persistent palettes");
    if (!schema.layout.allowedBits.includes(bits)) throw new Error("Unsupported subchunk palette bit width");
    const data = cursor.slice(bits === 0 ? 0 : Math.ceil(4096 / Math.floor(32 / bits)) * 4);
    // A zero-bit singleton has no length prefix in this persistent format.
    const count = bits === 0 ? 1 : cursor.int();
    if (count < 1 || count > 4096 || count > 2 ** bits || paletteEntries + count > 8192)
      throw new Error("Invalid or oversized subchunk palette");
    paletteEntries += count;
    const palette: VoxelState[] = [], paletteVersions: number[] = [];
    for (let index = 0; index < count; index++) {
      const { root, bytesRead } = readBoundedNbt(bytes.subarray(cursor.offset), {
        littleEndian: true, stringEncoding: "utf-8", allowTrailing: true,
        maxBytes, maxDepth: 8, maxElements: 256, maxStringBytes: 16384, signal: context.signal,
      });
      cursor.take(bytesRead);
      const name = root.get(schema.stateName), propertiesTag = root.get(schema.properties), paletteVersion = root.get(schema.paletteVersion);
      if (!(name instanceof NbtString) || !(propertiesTag instanceof NbtCompound) || !(paletteVersion instanceof NbtInt) ||
        !context.paletteVersions.includes(paletteVersion.getAsNumber()))
        throw new Error("Invalid or unsupported persistent block-state entry");
      const properties: VoxelState["properties"] = Object.create(null);
      propertiesTag.forEach((key, value) => {
        if (value instanceof NbtString) properties[key] = value.getAsString();
        else if (value instanceof NbtByte || value instanceof NbtInt) properties[key] = value.getAsNumber();
        else throw new Error("Unsupported persistent block-state property type");
      });
      palette.push({ id: name.getAsString(), properties });
      paletteVersions.push(paletteVersion.getAsNumber());
    }
    layers.push({ voxels: decodePalettedSection(palette, data, bits, schema.layout), paletteVersions });
  }
  if (cursor.offset !== bytes.length) throw new Error("Trailing bytes after subchunk storage");
  return { storageVersion, sectionY, layers };
};
