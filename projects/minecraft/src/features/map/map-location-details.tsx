import { ArrowLeft, Check, CheckCheck, Copy, MapPinned, Star, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { formatGameTeleportCommand } from "../../game-config";
import { getPointAppearance } from "./map-config";
import MapPointIcon from "./map-point-icon";
import MapMarkerStylePicker from "./map-marker-style-picker";
import MapMarkerGroupPicker from "./map-marker-group-picker";
import { DEFAULT_MARKER_GROUP } from "./marker-group-config";
import { isUserMapMarker, type MapPoint, type UserMarkerGroup, type UserMarkerStyleChange } from "./types";
import { usePointDraft } from "./use-point-draft";

interface MapLocationDetailsProps {
  point: MapPoint;
  favorite: boolean;
  completed: boolean;
  note: string;
  onBack: () => void;
  onToggleFavorite: () => void;
  onToggleCompleted: () => void;
  onSaveNote: (note: string) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onSaveCoordinate: () => void;
  onUpdateStyle: (change: UserMarkerStyleChange) => void;
  onUpdateGroup: (group: UserMarkerGroup) => void;
}

/**
 * The detail panel for one selected point — a shipped location, a personal
 * marker or a typed coordinate. Personal markers can be renamed, restyled,
 * regrouped and deleted here; everything can be saved, completed and annotated.
 */
const MapLocationDetails = ({
  point,
  favorite,
  completed,
  note,
  onBack,
  onToggleFavorite,
  onToggleCompleted,
  onSaveNote,
  onRename,
  onRemove,
  onSaveCoordinate,
  onUpdateStyle,
  onUpdateGroup,
}: MapLocationDetailsProps) => {
  const { t } = useTranslation();
  const appearance = getPointAppearance(point);
  const custom = isUserMapMarker(point);
  const coordinate = point.subtype === "coordinate";
  const description = "description" in point ? point.description : undefined;
  const [draftNote, setDraftNote] = usePointDraft(point.id, note);
  const [draftName, setDraftName] = usePointDraft(point.id, point.name);
  const [copyStatus, setCopyStatus] = usePointDraft<"idle" | "copied" | "failed">(point.id, "idle");

  useEffect(() => {
    if (copyStatus === "idle") return;
    const timeout = window.setTimeout(() => setCopyStatus("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyStatus, setCopyStatus]);

  const copyCoordinates = async () => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API is unavailable.");
      await navigator.clipboard.writeText(formatGameTeleportCommand({ x: point.x, y: null, z: point.y }));
      setCopyStatus("copied");
    } catch (error) {
      console.warn("[Map] Failed to copy coordinates", error);
      setCopyStatus("failed");
    }
  };

  const subtitle = [point.label, point.region].filter(Boolean).join(" · ");

  return (
    <div className="map-location-details flex h-full min-h-0 flex-col">
      <button type="button" onClick={onBack} className="map-back-button">
        <ArrowLeft size={14} aria-hidden="true" />
        {t("map.details.back")}
      </button>

      <div className="mt-4 flex items-start gap-3">
        <span className={cn("map-details-icon", appearance.markerClass)}>
          <MapPointIcon fallback={appearance.icon} source={appearance.nativeIconPath} size={21} />
        </span>
        <div className="min-w-0 flex-1">
          {custom ? (
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={() => onRename(draftName.trim() || point.name)}
              className="map-name-input"
              aria-label={t("map.details.markerName")}
            />
          ) : (
            <h2 className="text-base font-semibold leading-6 text-white">{point.name}</h2>
          )}
          {subtitle && <p className="mt-1 text-[13px] text-white/70">{subtitle}</p>}
        </div>
      </div>

      {description && (
        <p className="mt-3 text-[13px] leading-relaxed text-zinc-300">{description}</p>
      )}

      <div className="map-coordinate-card">
        <div className="map-coordinate-value">
          <p className="map-micro-label">{t("map.details.coordinates")}</p>
          <p className="font-mono text-[12px] font-semibold text-white">{point.x}, {point.y}</p>
        </div>
        <button
          type="button"
          onClick={() => void copyCoordinates()}
          className={cn("map-icon-button", copyStatus !== "idle" && "map-icon-button-status")}
          aria-label={t(copyStatus === "copied"
            ? "map.details.coordinatesCopied"
            : copyStatus === "failed"
              ? "map.details.coordinatesCopyFailed"
              : "map.details.copyCoordinates")}
          title={t("map.details.copyCoordinates")}
          aria-live="polite"
        >
          {copyStatus === "copied"
            ? <Check size={13} aria-hidden="true" />
            : <Copy size={13} aria-hidden="true" />}
          {copyStatus !== "idle" && (
            <span>{t(copyStatus === "copied"
              ? "map.details.coordinatesCopied"
              : "map.details.coordinatesCopyFailed")}</span>
          )}
        </button>
      </div>

      {custom && (
        <>
          <MapMarkerStylePicker
            color={point.color ?? "sage"}
            icon={point.icon ?? "pin"}
            onChange={onUpdateStyle}
          />
          <MapMarkerGroupPicker
            group={point.group ?? DEFAULT_MARKER_GROUP}
            onChange={onUpdateGroup}
          />
        </>
      )}

      {!coordinate && (
        <div className="mt-4">
          <label htmlFor={`note-${point.id}`} className="map-micro-label">{t("map.details.notes")}</label>
          <textarea
            id={`note-${point.id}`}
            value={draftNote}
            onChange={(event) => setDraftNote(event.target.value)}
            onBlur={() => onSaveNote(draftNote)}
            placeholder={t("map.details.notesPlaceholder")}
            className="map-notes-input"
          />
        </div>
      )}

      <div className="mt-auto space-y-2 pt-4">
        {!coordinate && (
          <button
            type="button"
            onClick={onToggleCompleted}
            aria-pressed={completed}
            className={cn("map-secondary-button", completed && "map-completed-button-active")}
          >
            <CheckCheck size={14} aria-hidden="true" />
            {t("map.details.completed")}
          </button>
        )}
        {coordinate ? (
          <button type="button" onClick={onSaveCoordinate} className="map-secondary-button">
            <MapPinned size={14} aria-hidden="true" />
            {t("map.details.saveAsMarker")}
          </button>
        ) : (
          <button type="button" onClick={onToggleFavorite} className={cn("map-secondary-button", favorite && "map-favorite-button-active")}>
            <Star size={14} className={favorite ? "fill-current" : ""} aria-hidden="true" />
            {favorite ? t("map.details.removeFavorite") : t("map.details.addFavorite")}
          </button>
        )}
        {custom && (
          <button type="button" onClick={onRemove} className="map-danger-button">
            <Trash2 size={14} aria-hidden="true" />
            {t("map.details.deleteMarker")}
          </button>
        )}
      </div>
    </div>
  );
};

export default MapLocationDetails;
