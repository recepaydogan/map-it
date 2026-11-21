import { LocateFixed, MapPinPlus, Minus, Navigation, Plus, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import "./player-map-controls.css";

interface PlayerMapControlsProps {
  compact: boolean;
  available: boolean;
  following: boolean;
  zoom: number;
  minimum: number;
  maximum: number;
  onCenter: () => void;
  onFollow: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  placementMode: boolean;
  onTogglePlacement: () => void;
}

export const PlayerMapControls = (props: PlayerMapControlsProps) => {
  const { t } = useTranslation();
  const tooltip = (key: string) => props.compact ? <span className="player-control-tooltip" role="tooltip">{t(key)}</span> : null;
  const followLabel = props.following ? "map.controls.stopFollowing" : "map.controls.followMe";
  return <div className={cn("player-map-controls", props.compact && "player-map-controls-compact")} data-map-ui>
    {!props.compact && <div className="player-control-group" data-tour="map-tools">
      <button type="button" onClick={props.onTogglePlacement} aria-pressed={props.placementMode} aria-label={t("map.controls.addMarker")} title={t("map.controls.addMarker")}><MapPinPlus size={16} aria-hidden="true" /></button>
    </div>}
    {props.available && <div className="player-control-group">
      <button type="button" onClick={props.onCenter} aria-label={t("map.controls.centerOnMe")} title={props.compact ? undefined : t("map.controls.centerOnMe")}>
        <LocateFixed size={16} aria-hidden="true" />{tooltip("map.controls.centerOnMe")}
      </button>
      <button type="button" onClick={props.onFollow} aria-pressed={props.following} aria-label={t(followLabel)} title={props.compact ? undefined : t(followLabel)}>
        <Navigation size={16} fill={props.following ? "currentColor" : "none"} aria-hidden="true" />
        {props.following && <span className="player-follow-indicator" aria-hidden="true" />}{tooltip(followLabel)}
      </button>
    </div>}
    <div className="player-control-group" data-tour="map-zoom" role="group" aria-label={t("map.controls.zoomControls")}>
      {!props.compact && <output aria-label={t("map.controls.zoomLevel", { value: Math.round(props.zoom * 100) })}>{Math.round(props.zoom * 100)}%</output>}
      <button type="button" onClick={props.onZoomIn} disabled={props.zoom >= props.maximum} aria-label={t("map.controls.zoomIn")} title={props.compact ? undefined : t("map.controls.zoomIn")}>
        <Plus size={16} aria-hidden="true" />{tooltip("map.controls.zoomIn")}
      </button>
      <button type="button" onClick={props.onZoomOut} disabled={props.zoom <= props.minimum} aria-label={t("map.controls.zoomOut")} title={props.compact ? undefined : t("map.controls.zoomOut")}>
        <Minus size={16} aria-hidden="true" />{tooltip("map.controls.zoomOut")}
      </button>
      {!props.compact && <button type="button" onClick={props.onReset} aria-label={t("map.controls.resetView")} title={t("map.controls.resetView")}><RotateCcw size={15} aria-hidden="true" /></button>}
    </div>
  </div>;
};
