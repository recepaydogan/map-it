import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BiomeCanvasState } from "../generation/biome-canvas";
import { useWorldMapFrameView } from "./world-map-frame-context";
import type { WorldResumeState } from "./world-types";

/** Historical coordinates are deliberately separate from live navigation/actions. */
const WorldLastPositionMarker = ({ position, dimension, view: settledView }: {
  position: NonNullable<WorldResumeState["lastPosition"]>;
  dimension: string; view: BiomeCanvasState | null;
}) => {
  const { t, i18n } = useTranslation();
  const view = useWorldMapFrameView(settledView);
  if (!view || dimension !== position.dimension) return null;
  const x = view.width / 2 + (position.x - view.x) * view.zoom;
  const y = view.height / 2 + (position.z - view.z) * view.zoom;
  if (x < 0 || y < 0 || x > view.width || y > view.height) return null;
  const label = t("tracking.lastKnown", { time: new Date(position.receivedAt).toLocaleString(i18n.resolvedLanguage) });
  return <div data-world-last-position role="img" aria-label={label}
    className="pointer-events-none absolute z-[12] -translate-x-1/2 -translate-y-1/2"
    style={{ left: x, top: y }}>
    <span className="grid size-6 place-items-center rounded-full border border-dashed border-zinc-300 bg-surface text-zinc-200">
      <MapPin size={14} aria-hidden="true" />
    </span>
    <span className="absolute left-1/2 top-8 max-w-60 -translate-x-1/2 rounded border border-border bg-surface px-2 py-1 text-center text-[10px] text-zinc-200">{label}</span>
  </div>;
};
export default WorldLastPositionMarker;
