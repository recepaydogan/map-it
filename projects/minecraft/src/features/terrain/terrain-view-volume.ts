import { CAMERA_FAR, CAMERA_NEAR, cameraBasis } from "./orbit-camera.ts";
import type { CameraRay, OrbitCamera, Point3 } from "./orbit-camera.ts";

type Plane = readonly [number, number, number, number];

/** Clip planes use the same target-relative coordinates as the GPU matrix. */
export const terrainClipPlanes = (matrix: Float32Array): readonly Plane[] => {
  if (matrix.length !== 16 || matrix.some(value => !Number.isFinite(value)))
    throw new Error("Invalid terrain view matrix");
  return [0, 1, 2].flatMap(axis => [-1, 1].map(sign => [
    matrix[3] + sign * matrix[axis], matrix[7] + sign * matrix[4 + axis],
    matrix[11] + sign * matrix[8 + axis], matrix[15] + sign * matrix[12 + axis],
  ] as Plane));
};

/** Conservative section-box test: crossing a plane is visible, wholly outside is not. */
export const sectionIntersectsView = (origin: Point3, target: Point3, planes: readonly Plane[]): boolean => {
  const offset = origin.map((value, axis) => value - target[axis]);
  return planes.every(plane => {
    let distance = plane[3];
    for (let axis = 0; axis < 3; axis++)
      distance += plane[axis] * (offset[axis] + (plane[axis] >= 0 ? 16 : 0));
    return distance >= 0;
  });
};

/** Perspective clipping uses forward depth, not radial distance from the camera. */
export const terrainRayInterval = (camera: OrbitCamera, ray: CameraRay) => {
  const { backward } = cameraBasis(camera);
  const forward = -backward.reduce((sum, value, axis) => sum + value * ray.direction[axis], 0);
  if (!Number.isFinite(forward) || forward <= 0) throw new Error("Picking ray is not camera-facing");
  return { near: CAMERA_NEAR / forward, far: CAMERA_FAR / forward };
};
