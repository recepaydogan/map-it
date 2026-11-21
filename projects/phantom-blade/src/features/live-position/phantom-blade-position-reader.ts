import { clearLivePosition, publishLivePosition } from "./live-position-store";
import { clearDesktopMapFollow, startDesktopMapFollow } from "./desktop-map-follow";
import { setTrackingStatus, type TrackingStatus } from "./tracking-status";
import { TRACKING_REGION_MAPS } from "../map/map-registry";
import type { LivePosition } from "./live-position-types";
import { startPositionProfileUpdates } from "./position-profile-updates";

interface NativeReader {
  setProfiles(json: string, callback: (result: { success: boolean }) => void): void;
  start(processId: number, callback: (result: { success: boolean }) => void): void;
  getSnapshot(callback: (snapshot: string) => void): void;
  stop(callback: () => void): void;
}

let sequence = Date.now() * 1000;
export const decodePhantomBladePosition = (raw: string, now: number): {
  sourceSequence: number; processId: number | null; position: LivePosition;
} | null => {
  try {
    const value = JSON.parse(raw);
    const map = typeof value.region === "string" ? TRACKING_REGION_MAPS[value.region.toLowerCase()] : undefined;
    if (value.state !== "live" || !map || value.layer !== 0 || !Number.isSafeInteger(value.sequence) || value.sequence < 1
      || ![value.u, value.v, value.x, value.y, value.z, value.dx, value.dy, value.sampledAt].every(Number.isFinite)
      || value.u < 0 || value.u > 1 || value.v < 0 || value.v > 1
      || Math.abs(value.dx) > 1.001 || Math.abs(value.dy) > 1.001
      || now - value.sampledAt > 1500 || value.sampledAt - now > 1000) return null;
    // Mesh UVs refer to the original texture, including rectangular maps.
    const dx = value.dx * map.width, dy = value.dy * map.height, length = Math.hypot(dx, dy);
    const processId = Number.isSafeInteger(value.pid) && value.pid > 0 ? value.pid : null;
    return { sourceSequence: value.sequence, processId, position: {
      version: 1, sequence: ++sequence, mapId: map.id,
      x: value.u * map.width, y: value.v * map.height, z: value.z,
      dx: length ? dx / length : 0, dy: length ? dy / length : 0,
      updatedAt: value.sampledAt, receivedAt: now,
    } };
  } catch { return null; }
};

/** One owner per window; production ownership is in the background page. */
export const startPhantomBladePositionReader = (onPositionReceived?: (processId: number) => void): (() => void) => {
  let stopped = false;
  let native: NativeReader | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSequence = 0;
  let lastSourceAt = 0;
  let hasPosition = false;
  let abort: AbortController | undefined;
  let profileUpdates: ReturnType<typeof startPositionProfileUpdates> | undefined;
  let requestedProfiles = false;
  clearLivePosition();
  clearDesktopMapFollow();
  setTrackingStatus("connecting");
  const stop = () => {
    if (stopped) return;
    stopped = true; clearTimeout(timer); abort?.abort();
    profileUpdates?.stop();
    try { native?.stop(() => {}); } catch { /* The host may have exited. */ }
    clearLivePosition(); setTrackingStatus("waiting-game");
  };
  const accept = (raw: string) => {
    const now = Date.now(), sample = decodePhantomBladePosition(raw, now);
    if (sample && sample.sourceSequence > lastSequence) {
      lastSequence = sample.sourceSequence; lastSourceAt = now; hasPosition = true;
      if (sample.processId !== null) startDesktopMapFollow(sample.processId);
      publishLivePosition(sample.position);
      setTrackingStatus("live");
      if (sample.processId !== null) onPositionReceived?.(sample.processId);
      return;
    }
    if (sample && now - lastSourceAt <= 1500) return;
    if (hasPosition) { hasPosition = false; clearLivePosition(); }
    let status: TrackingStatus = "connecting";
    try {
      const state = JSON.parse(raw).state;
      if (state === "connecting") lastSequence = 0;
      if (state === "waiting-game" || state === "stopped") {
        clearDesktopMapFollow();
        status = "waiting-game";
        lastSequence = 0;
        requestedProfiles = false;
      }
      else if (state === "unavailable-map") status = "unavailable-map";
      else if (state === "unsupported-build") {
        status = "unsupported-build";
        if (!requestedProfiles && profileUpdates) {
          requestedProfiles = true;
          void profileUpdates.refresh();
        }
      }
      else if (state === "access-denied") status = "access-denied";
      else if (state === "unavailable" || state === "live") status = "unavailable-map";
    } catch { status = "error"; }
    setTrackingStatus(status);
  };
  const poll = async () => {
    if (stopped) return;
    timer = setTimeout(() => { abort?.abort(); if (!stopped) { clearLivePosition(); setTrackingStatus("error"); } }, 3000);
    if (native) {
      try { native.getSnapshot((raw) => { if (stopped) return; clearTimeout(timer); accept(raw); timer = setTimeout(() => { void poll(); }, 50); }); }
      catch { clearTimeout(timer); accept('{"state":"unavailable"}'); timer = setTimeout(() => { void poll(); }, 1000); }
    } else {
      abort = new AbortController();
      try {
        const response = await fetch("/__pbz/position", { cache: "no-store", signal: abort.signal });
        if (!response.ok) throw new Error("Position transport unavailable");
        const raw = await response.text(); if (!stopped) accept(raw);
      } catch { if (!stopped) { clearLivePosition(); setTrackingStatus("error"); } }
      finally { clearTimeout(timer); if (!stopped) timer = setTimeout(() => { void poll(); }, 50); }
    }
  };
  if (typeof overwolf !== "undefined") {
    timer = setTimeout(() => { setTrackingStatus("error"); }, 5000);
    overwolf.extensions.current.getExtraObject("phantom-blade-position-reader", (result) => {
      if (stopped) return; clearTimeout(timer);
      if (!result.success || !result.object) { setTrackingStatus("error"); return; }
      const reader = result.object as NativeReader;
      native = reader;
      profileUpdates = startPositionProfileUpdates((json, callback) => reader.setProfiles(json, callback));
      reader.start(0, (started) => { if (!stopped && started.success) void poll(); });
    });
  } else if (import.meta.env.DEV) { void poll(); }
  else { setTrackingStatus("waiting-game"); }
  return stop;
};
