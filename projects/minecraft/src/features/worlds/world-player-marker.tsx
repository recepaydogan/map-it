import { Navigation } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { BiomeCanvasState } from "../generation/biome-canvas";
import { projectWorldMapPlayer } from "./world-map-player";
import { useWorldMapFrameView } from "./world-map-frame-context";
import type { SmoothedWorldMapPlayer } from "./use-smoothed-world-map-player";

/** The standard amber map marker with its arrow bound to the live player facing. */
const WorldPlayerMarker = ({ motion, dimension, view: settledView, centered = false }: { motion: SmoothedWorldMapPlayer; dimension: string;
  view: BiomeCanvasState | null; centered?: boolean }) => {
  const { t } = useTranslation();
  const player = useSyncExternalStore(motion.subscribe, motion.getSnapshot);
  const view = useWorldMapFrameView(settledView);
  const projected = centered && player?.dimension === dimension && view
    ? { x: view.width / 2, y: view.height / 2, visible: true }
    : projectWorldMapPlayer(player, dimension, view);
  if (!player || !projected?.visible) return null;
  return <div data-world-player data-player-dimension={dimension} className="pointer-events-none absolute z-[12] -translate-x-1/2 -translate-y-1/2"
    style={{ left: projected.x, top: projected.y }} role="img" aria-label={t("mapPlayer.position", { x: player.x.toFixed(1), y: player.y.toFixed(1), z: player.z.toFixed(1) })}>
    <span className="map-marker map-marker-custom-amber" style={{ width: 24, height: 24 }} aria-hidden="true">
      {player.yaw !== null && <Navigation size={14} strokeWidth={2.4}
        style={{ transform: `rotate(${player.yaw + 135}deg)` }} />}
    </span>
  </div>;
};
export default WorldPlayerMarker;
