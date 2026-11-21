import { useCallback, useEffect, useState } from "react";
import type { MapCoordinate, MapPoint, MapRegion } from "./types";

export const MAP_REFERENCE_POINT_KEY = "phantom-blade-app:reference-point";

export interface MapReferencePoint extends MapCoordinate {
  id: string;
  name: string;
  region: string;
  updatedAt: number;
}

const readReferencePoint = (): MapReferencePoint | null => {
  try {
    const value = localStorage.getItem(MAP_REFERENCE_POINT_KEY);
    if (!value) return null;
    const point = JSON.parse(value) as Partial<MapReferencePoint>;
    return typeof point.id === "string"
      && typeof point.name === "string"
      && typeof point.region === "string"
      && typeof point.x === "number"
      && Number.isFinite(point.x)
      && typeof point.y === "number"
      && Number.isFinite(point.y)
      && typeof point.updatedAt === "number"
      ? point as MapReferencePoint
      : null;
  } catch {
    return null;
  }
};

export const saveMapReferencePoint = (point: MapPoint | MapRegion) => {
  const reference: MapReferencePoint = {
    id: point.id,
    name: point.name,
    region: "region" in point ? point.region : point.name,
    x: Math.round(point.x),
    y: Math.round(point.y),
    updatedAt: Date.now(),
  };
  localStorage.setItem(MAP_REFERENCE_POINT_KEY, JSON.stringify(reference));
  window.dispatchEvent(new Event(MAP_REFERENCE_POINT_KEY));
};

export const useMapReferencePoint = () => {
  const [referencePoint, setReferencePoint] = useState<MapReferencePoint | null>(readReferencePoint);
  const refresh = useCallback(() => setReferencePoint(readReferencePoint()), []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== MAP_REFERENCE_POINT_KEY && event.key !== null) return;
      refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(MAP_REFERENCE_POINT_KEY, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MAP_REFERENCE_POINT_KEY, refresh);
    };
  }, [refresh]);

  return referencePoint;
};
