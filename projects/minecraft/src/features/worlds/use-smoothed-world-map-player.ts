import { useEffect, useLayoutEffect, useState } from "react";
import type { WorldMapPlayer } from "./world-map-player";

const DEFAULT_MOTION_GLIDE_MS = 200;
const MIN_MOTION_GLIDE_MS = 120;
const MAX_MOTION_GLIDE_MS = 260;
const TELEPORT_DISTANCE = 96;
const POSITION_EPSILON = 0.000_001;

const shortestAngle = (from: number, to: number) =>
  from + (((to - from + 540) % 360) - 180);

const samePosition = (left: WorldMapPlayer, right: WorldMapPlayer) =>
  Math.abs(left.x - right.x) <= POSITION_EPSILON
  && Math.abs(left.y - right.y) <= POSITION_EPSILON
  && Math.abs(left.z - right.z) <= POSITION_EPSILON
  && left.yaw === right.yaw;

/** One motion clock shared by the followed camera and the small player marker. */
export const createSmoothedWorldMapPlayer = (initial: WorldMapPlayer | null,
  now = () => performance.now(), schedule = (tick: () => void) => {
    let frame = 0, active = true;
    const paint = () => {
      if (!active) return;
      tick();
      if (active) frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => { active = false; cancelAnimationFrame(frame); };
  }) => {
  let visual = initial;
  let motion: { from: WorldMapPlayer; target: WorldMapPlayer; startedAt: number; duration: number } | null = null;
  let lastSampleAt: number | null = null;
  let cancelTick: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: WorldMapPlayer | null) => {
    visual = next;
    for (const listener of listeners) listener();
  };
  const stop = () => { cancelTick?.(); cancelTick = null; motion = null; };
  const sampleMotion = (at: number): WorldMapPlayer | null => {
    const active = motion;
    if (!active) return visual;
    const progress = Math.min(1, Math.max(0, (at - active.startedAt) / active.duration));
    const yawTarget = active.from.yaw === null || active.target.yaw === null
      ? active.target.yaw : shortestAngle(active.from.yaw, active.target.yaw);
    return { ...active.target,
      x: active.from.x + (active.target.x - active.from.x) * progress,
      y: active.from.y + (active.target.y - active.from.y) * progress,
      z: active.from.z + (active.target.z - active.from.z) * progress,
      yaw: active.from.yaw === null || yawTarget === null
        ? yawTarget : active.from.yaw + (yawTarget - active.from.yaw) * progress,
    };
  };
  const tick = () => {
    if (!motion) return;
    const at = now(), complete = at >= motion.startedAt + motion.duration;
    publish(sampleMotion(at));
    if (complete) stop();
  };
  return {
    getSnapshot: () => visual,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setTarget(player: WorldMapPlayer | null) {
      if (!player) { stop(); lastSampleAt = null; if (visual) publish(null); return; }
      if (!visual || visual.sessionKey !== player.sessionKey || visual.dimension !== player.dimension
        || Math.hypot(player.x - visual.x, player.y - visual.y, player.z - visual.z) > TELEPORT_DISTANCE) {
        stop(); lastSampleAt = null; publish(player); return;
      }
      if (motion && samePosition(motion.target, player)) { motion.target = player; return; }
      if (!motion && samePosition(visual, player)) {
        if (visual.receivedAt !== player.receivedAt || visual.expiresAt !== player.expiresAt) publish(player);
        return;
      }
      const startedAt = now();
      // Advance elapsed motion even when incoming telemetry outruns display frames.
      // Starting every glide from the last painted frame can pin the marker in place.
      const from = sampleMotion(startedAt)!;
      const duration = lastSampleAt === null ? DEFAULT_MOTION_GLIDE_MS : Math.max(MIN_MOTION_GLIDE_MS,
        Math.min(MAX_MOTION_GLIDE_MS, (startedAt - lastSampleAt) * 1.1));
      lastSampleAt = startedAt;
      motion = { from, target: player, startedAt, duration };
      cancelTick ??= schedule(tick);
    },
    dispose() { stop(); listeners.clear(); },
  };
};

/** Motion updates stay outside the map's React tree. */
export const useSmoothedWorldMapPlayer = (player: WorldMapPlayer | null) => {
  const [motion] = useState(() => createSmoothedWorldMapPlayer(player));
  useLayoutEffect(() => { motion.setTarget(player); }, [motion, player]);
  useEffect(() => () => motion.dispose(), [motion]);
  return motion;
};

export type SmoothedWorldMapPlayer = ReturnType<typeof createSmoothedWorldMapPlayer>;
