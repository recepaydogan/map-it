import { assertSection, SECTION_VOLUME, voxelIndex } from "./voxel-section.ts";
import type { VoxelSection, VoxelState } from "./voxel-section.ts";

export interface PackedSectionLayout {
  wordBits: 32 | 64;
  littleEndian: boolean;
  /** Axis names ordered from slowest to fastest. Values never straddle words. */
  axisOrder: "yzx" | "xzy";
  allowedBits: readonly number[];
}

/**
 * Decodes extracted palette words, not an entire save/container or network packet.
 * The source adapter must validate its version/header and resolve palette identities first.
 * Each storage layer is decoded separately; additional fluid layers must not be discarded.
 */
export const decodePalettedSection = (
  palette: VoxelState[], data: Uint8Array, bits: number, layout: PackedSectionLayout,
): VoxelSection => {
  if ((layout.wordBits !== 32 && layout.wordBits !== 64) || typeof layout.littleEndian !== "boolean" ||
    !["yzx", "xzy"].includes(layout.axisOrder) || !Number.isInteger(bits) || bits < 0 || bits > 16 ||
    !layout.allowedBits.includes(bits) || !(data instanceof Uint8Array))
    throw new Error("Unsupported packed-section layout");
  const indices = new Uint16Array(SECTION_VOLUME);
  // Validate before allocating/copying untrusted palette content.
  assertSection({ palette, indices });
  if (bits === 0) {
    if (palette.length !== 1 || data.byteLength !== 0) throw new Error("Invalid singleton section");
  } else {
    if (palette.length > 2 ** bits) throw new Error("Palette exceeds packed bit capacity");
    const perWord = Math.floor(layout.wordBits / bits);
    const byteWidth = layout.wordBits / 8;
    const wordCount = Math.ceil(SECTION_VOLUME / perWord);
    if (data.byteLength !== wordCount * byteWidth) throw new Error("Incorrect packed-section length");
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const mask = (1n << BigInt(bits)) - 1n;
    let sourceIndex = 0;
    for (let wordIndex = 0; wordIndex < wordCount; wordIndex++) {
      const word = layout.wordBits === 64
        ? view.getBigUint64(wordIndex * byteWidth, layout.littleEndian)
        : BigInt(view.getUint32(wordIndex * byteWidth, layout.littleEndian));
      for (let slot = 0; slot < perWord && sourceIndex < SECTION_VOLUME; slot++, sourceIndex++) {
        const value = Number((word >> BigInt(slot * bits)) & mask);
        if (value >= palette.length) throw new Error("Block index exceeds palette");
        // Decode the source's slow/middle/fast axis order into canonical coordinates.
        const target = layout.axisOrder === "yzx" ? sourceIndex
          : voxelIndex(sourceIndex >> 8, sourceIndex & 15, (sourceIndex >> 4) & 15);
        indices[target] = value;
      }
    }
  }
  return { palette: palette.map(state => ({ id: state.id, properties: { ...state.properties } })), indices };
};
