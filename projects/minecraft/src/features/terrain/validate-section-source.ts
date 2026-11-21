import { assertSection } from "./voxel-section.ts";
import type { SectionMeshSource } from "./terrain-work-types.ts";

export const validateSectionSource = ({ origin, section, shapes }: SectionMeshSource): void => {
  assertSection(section);
  if (origin.length !== 3 || origin.some(value => !Number.isSafeInteger(value) || value % 16 !== 0 ||
    !Number.isSafeInteger(value - 1) || !Number.isSafeInteger(value + 16)) ||
    shapes.length !== section.palette.length || shapes.some(shape => !["empty", "opaque-cube", "model"].includes(shape)))
    throw new Error("Invalid section mesh source");
};
