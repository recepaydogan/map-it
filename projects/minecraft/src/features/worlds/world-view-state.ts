import {
  defaultDimensionView,
  type DimensionView,
  type WorldMapSurface,
} from "./world-types.ts";

export type WorldCamera2d = NonNullable<DimensionView["camera2d"]>;
export type WorldCamera3d = NonNullable<DimensionView["camera3d"]>;

const current = (view: DimensionView | undefined): DimensionView =>
  view ?? defaultDimensionView();

export const readWorldViewMode = (
  view: DimensionView | undefined,
  surface: WorldMapSurface,
): "2d" | "3d" => view?.modeBySurface?.[surface] ?? view?.mode ?? "2d";

export const readWorldCamera2d = (
  view: DimensionView | undefined,
  surface: WorldMapSurface,
): WorldCamera2d | null => view?.camera2dBySurface
  && Object.prototype.hasOwnProperty.call(view.camera2dBySurface, surface)
  ? view.camera2dBySurface[surface] ?? null
  : view?.camera2d ?? null;

export const readWorldCamera3d = (
  view: DimensionView | undefined,
  surface: WorldMapSurface,
): WorldCamera3d | null => view?.camera3dBySurface
  && Object.prototype.hasOwnProperty.call(view.camera3dBySurface, surface)
  ? view.camera3dBySurface[surface] ?? null
  : view?.camera3d ?? null;

export const writeWorldViewMode = (
  view: DimensionView | undefined,
  surface: WorldMapSurface,
  mode: "2d" | "3d",
): DimensionView => {
  const previous = current(view);
  return {
    ...previous,
    ...(surface === "desktop" ? { mode } : {}),
    modeBySurface: { ...previous.modeBySurface, [surface]: mode },
  };
};

export const writeWorldCamera2d = (
  view: DimensionView | undefined,
  surface: WorldMapSurface,
  camera: WorldCamera2d,
): DimensionView => {
  const previous = current(view);
  return {
    ...previous,
    ...(surface === "desktop" ? { camera2d: camera } : {}),
    camera2dBySurface: { ...previous.camera2dBySurface, [surface]: camera },
  };
};

export const writeWorldCamera3d = (
  view: DimensionView | undefined,
  surface: WorldMapSurface,
  camera: WorldCamera3d,
): DimensionView => {
  const previous = current(view);
  return {
    ...previous,
    ...(surface === "desktop" ? { camera3d: camera } : {}),
    camera3dBySurface: { ...previous.camera3dBySurface, [surface]: camera },
  };
};
