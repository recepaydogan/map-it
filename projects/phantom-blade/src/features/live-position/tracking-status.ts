import { useEffect, useState } from "react";

export type TrackingStatus = "connecting" | "waiting-game" | "reload-required" | "live" | "unavailable-map" | "unsupported-build" | "access-denied" | "error";
export const TRACKING_STATUS_KEY = "phantom-blade-app:tracking-status:v1";
const EVENT = "phantom-blade-app:tracking-status-changed";
export const setTrackingStatus = (status: TrackingStatus) => {
  if (localStorage.getItem(TRACKING_STATUS_KEY) === status) return;
  localStorage.setItem(TRACKING_STATUS_KEY, status);
  window.dispatchEvent(new Event(EVENT));
  console.info("[PositionTracker]", status);
};
const readStatus = (): TrackingStatus => {
  const value = localStorage.getItem(TRACKING_STATUS_KEY);
  return ["connecting", "waiting-game", "reload-required", "live", "unavailable-map", "unsupported-build", "access-denied", "error"].includes(value ?? "")
    ? value as TrackingStatus : "waiting-game";
};
export const useTrackingStatus = () => {
  const [status, setStatus] = useState(readStatus);
  useEffect(() => {
    const update = () => setStatus(readStatus());
    window.addEventListener("storage", update);
    window.addEventListener(EVENT, update);
    return () => { window.removeEventListener("storage", update); window.removeEventListener(EVENT, update); };
  }, []);
  return status;
};
