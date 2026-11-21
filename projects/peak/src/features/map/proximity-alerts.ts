import { useEffect, useState } from "react";
import { mapToWorld, localPlayerOf, type LiveState } from "./live-state";
import type { MapMarker, PeakDailyLevel } from "./map-data";

// Surfaces "something notable is close by" toasts from the live position and
// the catalog markers of the level being played. Everything is automatic and
// deliberately conservative: three category kinds, one toast at a time, a
// per-marker cooldown so nothing nags.

export interface ProximityAlert {
  markerId: string;
  name: string;
  category: string;
  distance: number;
}

const ALERT_CATEGORIES = new Set(["luggage", "secret", "respawn"]);
const ALERT_RADIUS_METERS = 30;
const ELEVATION_GATE_METERS = 30;
const COOLDOWN_MS = 60_000;
const DISPLAY_MS = 6_000;

// Cooldowns persist for the window's lifetime, across map/scene switches.
const cooldowns = new Map<string, number>();

export const useProximityAlerts = (
  liveState: LiveState | null,
  level: PeakDailyLevel | null,
  markers: MapMarker[],
): ProximityAlert | null => {
  const [alert, setAlert] = useState<ProximityAlert | null>(null);

  const updatedAt = liveState?.updatedAt ?? 0;
  useEffect(() => {
    // Deferred so the scan's setState happens in a timer callback, and each
    // fresh sample cancels the previous pending scan.
    const timer = window.setTimeout(() => {
      if (!liveState || !level || level.scene !== liveState.sceneName) return;
      const player = localPlayerOf(liveState);
      if (!player || player.dead || player.passedOut) return;

      const now = Date.now();
      let nearest: ProximityAlert | null = null;
      for (const marker of markers) {
        if (!ALERT_CATEGORIES.has(marker.category)) continue;
        if (Math.abs(marker.elevation - player.y) > ELEVATION_GATE_METERS) continue;
        const cooledUntil = cooldowns.get(marker.id) ?? 0;
        if (now < cooledUntil) continue;
        const world = mapToWorld(level.projection, marker.x, marker.y);
        const distance = Math.hypot(world.x - player.x, world.z - player.z);
        if (distance > ALERT_RADIUS_METERS) continue;
        if (!nearest || distance < nearest.distance) {
          nearest = {
            markerId: marker.id,
            name: marker.name,
            category: marker.category,
            distance,
          };
        }
      }
      if (nearest) {
        cooldowns.set(nearest.markerId, now + COOLDOWN_MS);
        setAlert(nearest);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [level, liveState, markers, updatedAt]);

  useEffect(() => {
    if (!alert) return undefined;
    const timer = window.setTimeout(() => setAlert(null), DISPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [alert]);

  return alert;
};
