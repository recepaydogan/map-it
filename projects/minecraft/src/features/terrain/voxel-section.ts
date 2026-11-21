export const SECTION_EDGE = 16;
export const SECTION_VOLUME = SECTION_EDGE ** 3;

export interface VoxelState {
  id: string;
  properties: Record<string, string | number | boolean>;
}

/** Canonical storage is X-fastest, then Z, then Y, independently of source format. */
export interface VoxelSection {
  palette: VoxelState[];
  indices: Uint16Array;
}

export const voxelIndex = (x: number, y: number, z: number): number => x + 16 * z + 256 * y;

export const assertSection = (section: VoxelSection): void => {
  if (!Array.isArray(section.palette) || section.palette.length < 1 || section.palette.length > 65536)
    throw new Error("Invalid section palette size");
  for (const state of section.palette) {
    if (!state || typeof state.id !== "string" || !state.id || state.id.length > 256 ||
      !state.properties || typeof state.properties !== "object" || Array.isArray(state.properties))
      throw new Error("Invalid block state");
    const entries = Object.entries(state.properties);
    if (entries.length > 64 || entries.some(([key, value]) => !key || key.length > 256 ||
      !(typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) ||
        (typeof value === "string" && value.length <= 256))))
      throw new Error("Invalid block properties");
  }
  if (!(section.indices instanceof Uint16Array) || section.indices.length !== SECTION_VOLUME)
    throw new Error("Invalid section volume");
  for (const index of section.indices)
    if (index >= section.palette.length) throw new Error("Block index exceeds palette");
};

/** Floor division is essential for negative world coordinates. */
export const splitVoxelCoordinate = (coordinate: number): { section: number; local: number } => {
  if (!Number.isSafeInteger(coordinate)) throw new Error("Expected an exact block coordinate");
  const section = Math.floor(coordinate / SECTION_EDGE);
  return { section, local: coordinate - section * SECTION_EDGE };
};
