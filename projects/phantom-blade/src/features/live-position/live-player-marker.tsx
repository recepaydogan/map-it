import { Navigation2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "../../lib/cn";
import {
  worldDirectionToScreenAngle,
  worldToScreen,
  type MapProjectionMode,
} from "../map/map-projection";
import type { MapView } from "../map/types";
import {
  getLatestLiveMotionPosition,
  subscribeLiveMotion,
  type LiveMotionPosition,
} from "./live-motion";
import { getLatestLivePosition, subscribeLivePosition } from "./live-position-store";
import type { LivePosition, LivePositionStatus } from "./live-position-types";

interface LivePlayerMarkerProps {
  status: LivePositionStatus;
  view: MapView;
  width: number;
  height: number;
  projection: MapProjectionMode;
}

/** Keep the marker mounted this far outside the viewport before hiding it. */
const CULL_MARGIN_PX = 160;
const HEADING_GLIDE_MS = 160;

/** Unwraps `to` next to `from` so a CSS rotate never spins the long way round. */
const continuousHeading = (from: number, to: number) => {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return from + delta;
};

/**
 * The player's pin. A real member of the translated world: its coordinate and
 * the followed camera both come from `live-motion`, so the marker's local
 * movement and the world's opposite movement cancel exactly at the viewport
 * centre. Writes only compositor transforms; the map never re-renders for it.
 */
const LivePlayerMarker = ({ status, view, width, height, projection }: LivePlayerMarkerProps) => {
  const markerRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const viewRef = useRef(view);
  const sizeRef = useRef({ width, height });
  const projectionRef = useRef(projection);
  const placedRef = useRef<LiveMotionPosition | null>(null);
  const headingRef = useRef(0);

  const place = useCallback((position: LiveMotionPosition) => {
    const marker = markerRef.current;
    if (!marker) return;
    placedRef.current = position;
    const { width: mapWidth, height: mapHeight } = sizeRef.current;
    const { left, top } = worldToScreen(
      position,
      viewRef.current,
      mapWidth,
      mapHeight,
      projectionRef.current,
    );
    const visible = left >= -CULL_MARGIN_PX
      && left <= mapWidth + CULL_MARGIN_PX
      && top >= -CULL_MARGIN_PX
      && top <= mapHeight + CULL_MARGIN_PX;
    marker.style.visibility = visible ? "visible" : "hidden";
    marker.style.transform = `translate3d(${left}px, ${top}px, 0) translate(-50%, -50%)`;
  }, []);

  const pointAt = useCallback((heading: number, glide: boolean) => {
    const icon = iconRef.current;
    if (!icon) return;
    icon.style.transition = glide ? `transform ${HEADING_GLIDE_MS}ms linear` : "none";
    icon.style.transform = `rotate(${heading}deg)`;
  }, []);

  // A React view change is a pan, zoom or a follow rebase. Reproject the same
  // shared visual coordinate before paint, without starting another motion.
  useLayoutEffect(() => {
    const reprojected = projectionRef.current !== projection;
    viewRef.current = view;
    sizeRef.current = { width, height };
    projectionRef.current = projection;
    const position = getLatestLiveMotionPosition() ?? placedRef.current;
    if (position) place(position);
    if (reprojected) pointAt(headingRef.current, false);
  }, [height, place, pointAt, projection, view, width]);

  useEffect(() => {
    if (status === "disconnected") {
      placedRef.current = null;
      return;
    }
    const current = getLatestLiveMotionPosition();
    if (current) place(current);
    return subscribeLiveMotion((position) => {
      if (position) place(position);
    });
  }, [place, status]);

  // Facing is intentionally separate from position smoothing. It changes the
  // small arrow only and must not wake the map/camera when the player stands.
  useEffect(() => {
    if (status === "disconnected") return;
    const accept = (sample: LivePosition, glide: boolean) => {
      if (sample.dx === 0 && sample.dy === 0) return;
      const heading = continuousHeading(
        headingRef.current,
        worldDirectionToScreenAngle(sample.dx, sample.dy, projectionRef.current),
      );
      if (heading === headingRef.current) return;
      headingRef.current = heading;
      pointAt(heading, glide);
    };
    const current = getLatestLivePosition();
    if (current) accept(current, false);
    return subscribeLivePosition((sample) => {
      if (sample) accept(sample, true);
    });
  }, [pointAt, status]);

  if (status === "disconnected") return null;

  return (
    <div
      ref={markerRef}
      className={cn("map-live-player absolute", status === "stale" && "map-live-player-stale")}
      style={{ visibility: "hidden" }}
      aria-hidden="true"
    >
      <span className="map-live-player-pulse" />
      <span className="map-live-player-icon">
        <span ref={iconRef} className="map-live-player-arrow">
          <Navigation2 size={14} fill="currentColor" aria-hidden="true" />
        </span>
      </span>
    </div>
  );
};

export default LivePlayerMarker;
