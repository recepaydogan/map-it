import type { CameraRay, Point3 } from "./orbit-camera.ts";
import type { SectionMesh } from "./mesh-voxel-section.ts";

export interface SectionHit { distance: number; block: Point3; paletteIndex: number; face: number; flags: number }

/** Pick only emitted faces, so a removed cutaway block is never selectable. */
export const pickSectionMesh = (ray: CameraRay, mesh: SectionMesh, maxDistance = Infinity, minDistance = 0): SectionHit | null => {
  const origin = ray.origin.map((value, index) => value - mesh.origin[index]);
  // A slab bound rejects distant sections before testing individual visible faces.
  let near = minDistance, far = maxDistance;
  for (let axis = 0; axis < 3; axis++) {
    const direction = ray.direction[axis];
    if (Math.abs(direction) < 1e-12) { if (origin[axis] < 0 || origin[axis] > 16) return null; continue; }
    const first = -origin[axis] / direction, second = (16 - origin[axis]) / direction;
    near = Math.max(near, Math.min(first, second)); far = Math.min(far, Math.max(first, second));
    if (far < near) return null;
  }
  let hit: SectionHit | null = null;
  for (let face = 0; face < mesh.blockIndices.length; face++) {
    const start = face * 12;
    const normal = mesh.normals.subarray(start, start + 3);
    const denominator = normal.reduce((sum, value, index) => sum + value * ray.direction[index], 0);
    // Match the renderer's back-face culling, including when the camera is inside a block.
    if (denominator >= -1e-10) continue;
    const distance = normal.reduce((sum, value, index) => sum + value * (mesh.positions[start + index] - origin[index]), 0) / denominator;
    if (distance < minDistance || distance >= (hit?.distance ?? maxDistance)) continue;
    let inside = true;
    for (let axis = 0; axis < 3; axis++) {
      if (normal[axis] !== 0) continue;
      const coordinate = origin[axis] + ray.direction[axis] * distance;
      const vertices = [0, 3, 6, 9].map(offset => mesh.positions[start + offset + axis]);
      if (coordinate < Math.min(...vertices) - 1e-8 || coordinate > Math.max(...vertices) + 1e-8) { inside = false; break; }
    }
    if (!inside) continue;
    const index = mesh.blockIndices[face];
    hit = { distance, block: [mesh.origin[0] + (index & 15), mesh.origin[1] + (index >> 8), mesh.origin[2] + ((index >> 4) & 15)],
      paletteIndex: mesh.paletteIndices[face], face: mesh.faceDirections[face], flags: mesh.faceFlags[face] };
  }
  return hit;
};
