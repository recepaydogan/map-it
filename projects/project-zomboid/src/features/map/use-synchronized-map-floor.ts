import { useCallback, useEffect, useState } from "react";
import { MAXIMUM_POSITIVE_MAP_FLOOR } from "./map-floor-visibility";

const MAP_FLOOR_STORAGE_KEY = "pzim:active-map-floor";
const MAP_FLOOR_CHANGE_EVENT = "pzim:active-map-floor-changed";

const normalizeFloor = (value: unknown) => {
  const floor = Number(value);
  if (!Number.isInteger(floor)) return 0;
  return Math.min(floor, MAXIMUM_POSITIVE_MAP_FLOOR);
};

export const readSynchronizedMapFloor = () => {
  try {
    return normalizeFloor(localStorage.getItem(MAP_FLOOR_STORAGE_KEY));
  } catch (error) {
    console.warn("The synchronized map floor could not be read.", error);
    return 0;
  }
};

export const writeSynchronizedMapFloor = (floor: number) => {
  const nextFloor = normalizeFloor(floor);
  try {
    localStorage.setItem(MAP_FLOOR_STORAGE_KEY, String(nextFloor));
  } catch (error) {
    console.warn("The synchronized map floor could not be saved.", error);
  }
  window.dispatchEvent(new CustomEvent<number>(MAP_FLOOR_CHANGE_EVENT, {
    detail: nextFloor,
  }));
  return nextFloor;
};

/** Keeps the desktop map and the in-game minimap on the same building floor. */
export const useSynchronizedMapFloor = () => {
  const [floor, setFloor] = useState(readSynchronizedMapFloor);

  useEffect(() => {
    const onFloorChange = (event: Event) => {
      if (event instanceof StorageEvent
        && event.key !== MAP_FLOOR_STORAGE_KEY
        && event.key !== null) return;
      const nextFloor = event instanceof CustomEvent
        ? normalizeFloor(event.detail)
        : readSynchronizedMapFloor();
      setFloor(nextFloor);
    };
    window.addEventListener("storage", onFloorChange);
    window.addEventListener(MAP_FLOOR_CHANGE_EVENT, onFloorChange);
    return () => {
      window.removeEventListener("storage", onFloorChange);
      window.removeEventListener(MAP_FLOOR_CHANGE_EVENT, onFloorChange);
    };
  }, []);

  const updateFloor = useCallback((nextFloor: number) => {
    const normalized = writeSynchronizedMapFloor(nextFloor);
    setFloor(normalized);
  }, []);

  return { floor, setFloor: updateFloor };
};
