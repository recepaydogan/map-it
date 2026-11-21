import { useTranslation } from "react-i18next";
import Tooltip from "../../components/tooltip";
import type { BiomeCanvasState } from "../generation/biome-canvas";
import { BIOME_DEFAULT_ZOOM } from "../generation/biome-viewport";
import { useWorldMapFrameView } from "./world-map-frame-context";

const WorldMapZoomLevel = ({ view: settledView }: { view: BiomeCanvasState | null }) => {
  const { t } = useTranslation();
  const view = useWorldMapFrameView(settledView);
  const percentage = Math.max(1, Math.round((view?.zoom ?? BIOME_DEFAULT_ZOOM) / BIOME_DEFAULT_ZOOM * 100));
  const label = t("map.controls.zoomLevel", { value: percentage });
  return <Tooltip label={label} side="top" className="map-control-tooltip">
    <output data-biome-zoom-level data-tour="map-zoom-level" aria-label={label}>{percentage}%</output>
  </Tooltip>;
};

export default WorldMapZoomLevel;
