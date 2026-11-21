import { ArrowLeft, Check, Copy, MapPinned, PackageCheck, Star, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getLocationLiveLoot } from "../live-loot/location-live-loot";
import { useLiveLoot } from "../live-loot/live-loot-store";
import { getPointAppearance, PERSONAL_MARKERS_UI_ENABLED } from "./map-config";
import MapBuildingSummary from "./map-building-summary";
import { mergeLocationLootProfile } from "./map-loot-utils";
import MapPointIcon from "./map-point-icon";
import MapMarkerStylePicker from "./map-marker-style-picker";
import MapMarkerGroupPicker from "./map-marker-group-picker";
import MapLootProfile from "./map-loot-profile";
import MapLiveLoot from "./map-live-loot";
import { DEFAULT_MARKER_GROUP } from "./marker-group-config";
import { isUserMapMarker, type MapLocation, type MapMetadata, type MapPoint, type UserMarkerGroup, type UserMarkerStyleChange } from "./types";
import { usePointDraft } from "./use-point-draft";

interface MapLocationDetailsProps {
  point: MapPoint;
  data: MapMetadata;
  favorite: boolean;
  looted: boolean;
  note: string;
  onBack: () => void;
  onToggleFavorite: () => void;
  onToggleLooted: () => void;
  onSaveNote: (note: string) => void;
  onEdit: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onSaveCoordinate: () => void;
  onUpdateStyle: (change: UserMarkerStyleChange) => void;
  onUpdateGroup: (group: UserMarkerGroup) => void;
}

const MapLocationDetails = ({
  point,
  data,
  favorite,
  looted,
  note,
  onBack,
  onToggleFavorite,
  onToggleLooted,
  onSaveNote,
  onEdit,
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
  const location = point.category !== "custom" ? point as MapLocation : undefined;
  const lootLocation = location && !point.subtype.startsWith("object:") ? location : undefined;
  const lootProfile = lootLocation ? mergeLocationLootProfile(lootLocation, data) : undefined;
  const liveLootSnapshot = useLiveLoot();
  const liveLoot = lootLocation ? getLocationLiveLoot(liveLootSnapshot, lootLocation, data.items) : null;
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
      await navigator.clipboard.writeText(`${point.x}, ${point.y}`);
      setCopyStatus("copied");
    } catch (error) {
      console.warn("[Map] Failed to copy coordinates", error);
      setCopyStatus("failed");
    }
  };

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
          <p className="mt-1 text-[13px] text-white/70">{point.label} · {point.town}</p>
        </div>
      </div>

      {location && <MapBuildingSummary location={location} />}

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
          <button type="button" onClick={onEdit} className="map-secondary-button">{t("map.custom.edit")}</button>
          <MapMarkerStylePicker
            imageCategory={point.imageCategory}
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

      {!custom && liveLoot && <MapLiveLoot loot={liveLoot} />}
      {!custom && lootProfile && <MapLootProfile profile={lootProfile} />}

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

      <div className="mt-auto space-y-2 pt-4">
        {!coordinate && (
          <button
            type="button"
            onClick={onToggleLooted}
            aria-pressed={looted}
            className={cn("map-secondary-button", looted && "map-looted-button-active")}
          >
            <PackageCheck size={14} aria-hidden="true" />
            {t("map.details.looted")}
          </button>
        )}
        {coordinate ? (
          PERSONAL_MARKERS_UI_ENABLED && (
            <button type="button" onClick={onSaveCoordinate} className="map-secondary-button">
              <MapPinned size={14} aria-hidden="true" />
              {t("map.details.saveAsMarker")}
            </button>
          )
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
