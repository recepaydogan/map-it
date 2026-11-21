import { mat4 } from "gl-matrix";

export type Point3 = readonly [number, number, number];
export interface OrbitCamera { target: Point3; yaw: number; pitch: number; distance: number }
export interface CameraRay { origin: Point3; direction: Point3 }
export interface OrbitProjection { left: number; top: number; depth: number; visible: boolean }
export const CAMERA_FOV = Math.PI / 3;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 16384;

export const normalizeOrbitCamera = (camera: OrbitCamera): OrbitCamera => {
  if (camera.target.length !== 3 || [...camera.target, camera.yaw, camera.pitch, camera.distance].some(value => !Number.isFinite(value)))
    throw new Error("Invalid orbit camera");
  return { target: [...camera.target], yaw: Math.atan2(Math.sin(camera.yaw), Math.cos(camera.yaw)),
    pitch: Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, camera.pitch)),
    distance: Math.max(2, Math.min(4096, camera.distance)) };
};

export const cameraBasis = (camera: OrbitCamera) => {
  const horizontal = Math.cos(camera.pitch);
  const backward: Point3 = [Math.sin(camera.yaw) * horizontal, Math.sin(camera.pitch), Math.cos(camera.yaw) * horizontal];
  const right: Point3 = [Math.cos(camera.yaw), 0, -Math.sin(camera.yaw)];
  const up: Point3 = [-Math.sin(camera.yaw) * Math.sin(camera.pitch), horizontal, -Math.cos(camera.yaw) * Math.sin(camera.pitch)];
  return { backward, right, up };
};

/** View matrix is target-relative; large world origins never enter float matrices. */
export const orbitViewProjection = (camera: OrbitCamera, aspect: number): Float32Array => {
  if (!Number.isFinite(aspect) || aspect <= 0) throw new Error("Invalid viewport aspect");
  const { backward } = cameraBasis(camera);
  const view = mat4.lookAt(mat4.create(), backward.map(value => value * camera.distance) as [number, number, number], [0, 0, 0], [0, 1, 0]);
  const projection = mat4.perspective(mat4.create(), CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);
  return new Float32Array(mat4.multiply(mat4.create(), projection, view));
};

/** Project an exact world point through the target-relative 3D camera into CSS pixels. */
export const projectOrbitPoint = (
  camera: OrbitCamera, point: Point3, width: number, height: number,
): OrbitProjection | null => {
  if (point.length !== 3 || [...point, width, height].some(value => !Number.isFinite(value)) || width <= 0 || height <= 0)
    throw new Error("Invalid orbit projection");
  const matrix = orbitViewProjection(camera, width / height);
  const x = point[0] - camera.target[0], y = point[1] - camera.target[1], z = point[2] - camera.target[2];
  const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  const clipZ = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
  const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  if (!Number.isFinite(clipW) || clipW <= 0) return null;
  const normalizedX = clipX / clipW, normalizedY = clipY / clipW, depth = clipZ / clipW;
  return { left: (normalizedX + 1) * width / 2, top: (1 - normalizedY) * height / 2, depth,
    visible: normalizedX >= -1 && normalizedX <= 1 && normalizedY >= -1 && normalizedY <= 1 && depth >= -1 && depth <= 1 };
};

export const orbitCamera = (camera: OrbitCamera, deltaX: number, deltaY: number): OrbitCamera =>
  normalizeOrbitCamera({ ...camera, yaw: camera.yaw - deltaX * 0.006, pitch: camera.pitch + deltaY * 0.006 });

export const zoomOrbitCamera = (camera: OrbitCamera, delta: number): OrbitCamera =>
  normalizeOrbitCamera({ ...camera, distance: camera.distance * Math.exp(Math.max(-1000, Math.min(1000, delta)) * 0.0015) });

export const panOrbitCamera = (camera: OrbitCamera, deltaX: number, deltaY: number, height: number): OrbitCamera => {
  if (!Number.isFinite(height) || height <= 0) throw new Error("Invalid pan viewport height");
  const { right, up } = cameraBasis(camera);
  const scale = 2 * camera.distance * Math.tan(CAMERA_FOV / 2) / height;
  return normalizeOrbitCamera({ ...camera, target: camera.target.map((value, index) =>
    value + (-deltaX * right[index] + deltaY * up[index]) * scale) as [number, number, number] });
};

/** Pointer coordinates are in CSS pixels relative to the canvas, not the entire window. */
export const cameraRay = (camera: OrbitCamera, x: number, y: number, width: number, height: number): CameraRay => {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
    throw new Error("Invalid picking viewport");
  const { backward, right, up } = cameraBasis(camera);
  const scale = Math.tan(CAMERA_FOV / 2);
  const horizontal = (2 * x / width - 1) * width / height * scale;
  const vertical = (1 - 2 * y / height) * scale;
  const direction = backward.map((value, index) => -value + right[index] * horizontal + up[index] * vertical);
  const length = Math.hypot(...direction);
  return {
    origin: camera.target.map((value, index) => value + backward[index] * camera.distance) as [number, number, number],
    direction: direction.map(value => value / length) as [number, number, number],
  };
};
