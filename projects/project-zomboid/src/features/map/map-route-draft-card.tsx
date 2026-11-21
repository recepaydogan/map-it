import { Check, Route, Undo2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface MapRouteDraftCardProps {
  message: string;
  stopCount: number;
  onUndo: () => void;
  onCancel: () => void;
  onSave: () => void;
}

const MapRouteDraftCard = ({ message, stopCount, onUndo, onCancel, onSave }: MapRouteDraftCardProps) => {
  const { t } = useTranslation();
  const canSave = stopCount >= 2;

  return (
    <div className="map-route-draft-card pointer-events-auto" data-map-ui>
      <span className="map-route-card-icon"><Route size={15} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="map-route-heading-row">
          <span className="map-route-heading">{t("map.route.newRoute")}</span>
          <span className="map-route-planning-badge">{t("map.route.planning")}</span>
        </span>
        <span className="map-route-summary">{message}</span>
      </span>
      {stopCount > 0 && (
        <span className="map-route-stop-count">{t("map.route.stops", { count: stopCount })}</span>
      )}
      <div className="map-route-draft-actions">
        <button
          type="button"
          onClick={onUndo}
          disabled={stopCount === 0}
          aria-label={t("map.route.undo")}
          title={t("map.route.undo")}
        >
          <Undo2 size={14} aria-hidden="true" />
        </button>
        <button type="button" onClick={onCancel} aria-label={t("map.route.cancel")} title={t("map.route.cancel")}>
          <X size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="map-route-save"
          aria-label={canSave ? t("map.route.save") : t("map.route.minimumStops")}
          title={canSave ? t("map.route.save") : t("map.route.minimumStops")}
        >
          <Check size={14} aria-hidden="true" />
          <span>{t("map.route.save")}</span>
        </button>
      </div>
    </div>
  );
};

export default MapRouteDraftCard;
