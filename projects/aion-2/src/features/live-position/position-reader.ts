import { GAME_CONFIG } from "../../game-config";
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import { LIVE_MAP_PROJECTIONS } from "../map/map-registry";
import { selectMap } from "../map/use-selected-map";
import { clearDesktopMapFollow, startDesktopMapFollow } from "./desktop-map-follow";
import { publishLivePosition } from "./live-position-store";

interface NativeSnapshot {
  state: string;
  ownershipVerified?: boolean;
  processId?: number;
  nativeMapId?: number;
  position?: { x: number; y: number; z: number };
}
interface PositionPlugin {
  poll: (name: string, directory: string, bounds: string, callback: (result: NativeSnapshot) => void) => void;
  stop: (callback: (result: unknown) => void) => void;
}

// Keep deduplication across reader restarts in the same background window.
let reportedProcessId: number | undefined;

export const startPositionReader = () => {
  let disposed = false;
  let timer = 0;
  let watchdog = 0;
  let plugin: PositionPlugin | undefined;
  let previousMap = "";
  let previousState = "";
  let lastLog = 0;
  const bounds = JSON.stringify(Object.fromEntries(Object.entries(LIVE_MAP_PROJECTIONS).map(([id, value]) =>
    [id, [value.origin[0], value.origin[1], value.origin[0] + value.size[0], value.origin[1] + value.size[1]]])));
  const publish = (result: NativeSnapshot) => {
    if (result.state === "game-not-running" && reportedProcessId !== undefined) {
      reportedProcessId = undefined;
      clearDesktopMapFollow();
    }
    const projection = result.nativeMapId ? LIVE_MAP_PROJECTIONS[result.nativeMapId] : undefined;
    const identity = projection ? `${result.processId}:${result.nativeMapId}` : "";
    if (identity && identity !== previousMap) {
      selectMap(projection!.mapId);
      console.info("[LivePosition] map-switch", { nativeMapId: result.nativeMapId, mapId: projection!.mapId });
    }
    previousMap = identity;
    let point: { x: number; y: number } | undefined;
    if (projection && result.ownershipVerified === true && result.state === "tracking" && result.position) {
      const { x, y, z } = result.position;
      if ([x, y, z].every(Number.isFinite)) {
        point = {
          x: projection.bounds.minX + (x - projection.origin[0]) * (projection.bounds.maxX - projection.bounds.minX) / projection.size[0],
          y: projection.bounds.minY + (y - projection.origin[1]) * (projection.bounds.maxY - projection.bounds.minY) / projection.size[1],
        };
      }
    }
    publishLivePosition({ state: result.state === "tracking" && result.ownershipVerified !== true ? "identity-unverified" : result.state, timestamp: Date.now(), processId: result.processId,
      nativeMapId: result.nativeMapId, mapId: projection?.mapId, point });
    if (point && Number.isInteger(result.processId) && result.processId! > 0 && result.processId !== reportedProcessId) {
      reportedProcessId = result.processId;
      startDesktopMapFollow(result.processId);
      track(EVENTS.LIVE_POSITION_RECEIVED, {
        map: projection!.mapId,
        native_map_id: result.nativeMapId,
      });
    }
    if (result.state !== previousState || Date.now() - lastLog > 10_000) {
      console.info("[LivePosition]", JSON.stringify(result));
      previousState = result.state; lastLog = Date.now();
    }
  };
  const poll = () => {
    if (disposed || !plugin) return;
    // Only one request may be in flight; a hung native callback never creates a queue.
    watchdog = window.setTimeout(() => { if (!disposed) publish({ state: "reader-timeout" }); }, 5000);
    try {
      plugin.poll(GAME_CONFIG.gameProcessName, GAME_CONFIG.positionSessionDirectory, bounds, (result) => {
        window.clearTimeout(watchdog);
        if (disposed) return;
        publish(result);
        const active = ["tracking", "identity-unverified"].includes(result.state);
        timer = window.setTimeout(poll, active ? 100 : 2000);
      });
    } catch (error) {
      window.clearTimeout(watchdog);
      console.error("[LivePosition] poll-failed", error);
      publish({ state: "reader-error" });
      timer = window.setTimeout(poll, 5000);
    }
  };
  const load = () => {
    if (disposed) return;
    try {
      overwolf.extensions.current.getExtraObject("access-probe", (response) => {
        if (disposed) return;
        if (!response.success || !response.object) {
          console.error("[LivePosition] plugin-load", response.error);
          publish({ state: "plugin-unavailable" });
          timer = window.setTimeout(load, 10_000);
          return;
        }
        plugin = response.object as PositionPlugin;
        poll();
      });
    } catch (error) {
      console.error("[LivePosition] plugin-load", error);
      publish({ state: "plugin-unavailable" });
      timer = window.setTimeout(load, 10_000);
    }
  };
  load();
  return () => {
    disposed = true;
    window.clearTimeout(timer); window.clearTimeout(watchdog);
    try { plugin?.stop(() => {}); } catch (error) { console.error("[LivePosition] stop", error); }
    publishLivePosition({ state: "stopped", timestamp: Date.now() });
  };
};
