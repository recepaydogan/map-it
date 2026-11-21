import { useEffect, useState } from "react";

export type TrackingStatus = "disabled" | "connecting" | "waiting-game" | "live" | "unavailable-map" | "error";
export const TRACKING_STATUS_KEY = "wfm:tracking-status:v1";
const EVENT = "wfm:tracking-status-changed";
export const setTrackingStatus = (status: TrackingStatus) => {
  if (localStorage.getItem(TRACKING_STATUS_KEY) === status) return;
  localStorage.setItem(TRACKING_STATUS_KEY, status);
  window.dispatchEvent(new Event(EVENT));
  console.info("[PositionTracker]", status);
};
const readStatus = (): TrackingStatus => {
  const value = localStorage.getItem(TRACKING_STATUS_KEY);
  return ["disabled", "connecting", "waiting-game", "live", "unavailable-map", "error"].includes(value ?? "")
    ? value as TrackingStatus : "disabled";
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
