import { ArrowLeft, Check, CheckCheck, Copy, BookOpen, MapPin, MapPinned, MapPinPlus, Pencil, Star, Trash2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import MapMarkerItems from "../database/map-marker-items";
import MapItemPanel from "./map-item-panel";
import { getCategoryConfig, getPointAppearance } from "./map-config";
import { localizeMapName } from "./map-registry";
import MapPointIcon from "./map-point-icon";
import { getLocalizedMapPointDisplayName } from "./map-point-display-name";
import MapMarkerStylePicker from "./map-marker-style-picker";
import MapMarkerGroupPicker from "./map-marker-group-picker";
import { DEFAULT_MARKER_GROUP } from "./marker-group-config";
import { isUserMapMarker, type MapPoint, type UserMarkerEdits, type UserMarkerGroup, type UserMarkerStyleChange } from "./types";
import { usePointDraft } from "./use-point-draft";
import { sameReferenceTarget, useReferenceNavigation, useSelectedReference } from "../reference/reference-navigation-context";
import MapMarkerTravel from "../reference/map-marker-travel";
import MapMarkerFlight from "../reference/map-marker-flight";
import MapMarkerAdventure from "../reference/map-marker-adventure";
import CreatureCombatAbilities from "../reference/creature-combat-abilities";
import { useBossPanelData, useReferenceEntry, useReferenceIndex } from "../reference/use-reference-data";
import { getCreatureLevel } from "../reference/creature-heading";
import MapSearchSourceDetails from "./map-search-source-details";
import type { SearchSourceContext } from "./map-global-search";
import { COLLECTIBLE_PROGRESSION } from "../../game-config";
import MapCompanionRewards from "./map-companion-rewards";
import MapPetRewards from "./map-pet-rewards";
import MapServicePortrait from "./map-service-portrait";
import MapMerchantShop from "./map-merchant-shop";
import MapEventMissionLink from "./map-event-mission-link";
import MapEventCandy from "./map-event-candy";
import MapCraftService from "./map-craft-service";
import MapStorageService from "./map-storage-service";
import { useStorageServices } from "./use-storage-services";
import MapInstanceEntrance from "./map-instance-entrance";
import MapEventEntrance from "./map-event-entrance";
import MapEventEntranceArtwork from "./map-event-entrance-artwork";
import MapRiftSchedule from "./map-rift-schedule";
import MapSpringboardDetails from "./map-springboard-details";
import { requestMapPointInMain } from "./map-window-bridge";
import { getMapCompanionSources } from "./map-companion-sources";
import { getMapPetSources } from "./map-pet-sources";

interface MapLocationDetailsProps {
  sourceContext?: SearchSourceContext;
  point: MapPoint;
  draftMarker: boolean;
  note: string;
  onCreateMarker: (name: string, note: string) => void;
  onSaveMarkerEdits: (edits: UserMarkerEdits) => void;
  mapId: string;
  mapName: string;
  onOpenItem?: (itemId: string) => void;
  onOpenMap: (mapId: string, markerId: string) => void;
  favorite: boolean;
  completed: boolean;
  onBack: () => void;
  onToggleFavorite: () => void;
  onToggleCompleted: () => void;
  onRemove: () => void;
  onSaveCoordinate: () => void;
  onUpdateStyle: (change: UserMarkerStyleChange) => void;
  onUpdateGroup: (group: UserMarkerGroup) => void;
}

/**
 * The detail panel for one selected point — a shipped location, a personal
 * marker or a typed coordinate. Personal markers can be renamed, restyled,
 * regrouped and deleted here; locations can be saved and completed.
 */
const MapLocationDetails = ({
  point,
  draftMarker,
  note,
  onCreateMarker,
  onSaveMarkerEdits,
  sourceContext,
  mapId,
  mapName,
  onOpenItem,
  onOpenMap,
  favorite,
  completed,
  onBack,
  onToggleFavorite,
  onToggleCompleted,
  onRemove,
  onSaveCoordinate,
  onUpdateStyle,
  onUpdateGroup,
}: MapLocationDetailsProps) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const openReference = useReferenceNavigation();
  const selectedReference = useSelectedReference();
  const appearance = getPointAppearance(point);
  const storageServices = useStorageServices(point.category === "storage");
  const storageNpc = storageServices.status === "ready" && "entityId" in point
    ? storageServices.data.npcs[point.entityId ?? ""] : undefined;
  const custom = isUserMapMarker(point);
  const coordinate = point.subtype === "coordinate";
  const returnTo = coordinate && "returnTo" in point ? point.returnTo : undefined;
  const travelPoint = !custom && !coordinate && ["teleport", "rift", "portal"].includes(point.category);
  const reference = !custom ? point.reference : undefined;
  const creatureIndex = useReferenceIndex(reference?.category === "creatures");
  const instanceEntrance = getCategoryConfig(point.category).showInstanceEntranceDetails === true && !!reference;
  const eventEntrance = point.category === "event-entrance" && !!reference;
  const companionSources = getMapCompanionSources(point);
  const petSources = getMapPetSources(point);
  const itemId = !custom ? point.itemId : undefined;
  const itemIcon = !custom ? point.iconPath : undefined;
  const collectionItem = !!itemId && COLLECTIBLE_PROGRESSION.itemIds.includes(itemId);
  const displayedCoordinates = "referenceCoordinates" in point
    ? point.referenceCoordinates ?? point
    : point;
  const description = "description" in point ? point.description : undefined;
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<UserMarkerEdits>(() => ({
    name: point.name,
    note,
    color: custom ? point.color ?? "sage" : "sage",
    icon: custom ? point.icon ?? "pin" : "pin",
    group: custom ? point.group ?? DEFAULT_MARKER_GROUP : DEFAULT_MARKER_GROUP,
  }));
  const editMode = draftMarker || editing;
  const [copyStatus, setCopyStatus] = usePointDraft<"idle" | "copied" | "failed">(point.id, "idle");
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const beginEditing = () => {
    if (!custom) return;
    setEditor({
      name: point.name,
      note,
      color: point.color ?? "sage",
      icon: point.icon ?? "pin",
      group: point.group ?? DEFAULT_MARKER_GROUP,
    });
    setEditing(true);
  };

  const saveEdits = () => {
    if (!editor.name.trim()) return;
    onSaveMarkerEdits({ ...editor, name: editor.name.trim() });
    setEditing(false);
  };

  useLayoutEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [point.id]);

  useEffect(() => {
    if (copyStatus === "idle") return;
    const timeout = window.setTimeout(() => setCopyStatus("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyStatus, setCopyStatus]);

  const copyCoordinates = async () => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API is unavailable.");
      await navigator.clipboard.writeText(`${displayedCoordinates.x}, ${displayedCoordinates.y}`);
      setCopyStatus("copied");
    } catch (error) {
      console.warn("[Map] Failed to copy coordinates", error);
      setCopyStatus("failed");
    }
  };

  const category = getCategoryConfig(point.category);
  const creatureSummary = creatureIndex.status === "ready" && reference?.category === "creatures"
    ? creatureIndex.data.entries.find((entry) => entry.id === reference.id && entry.category === reference.category)
    : undefined;
  const creatureEntry = useReferenceEntry(creatureSummary);
  const bossPanel = useBossPanelData((point.category === "boss" || point.category === "dungeon-boss") && reference?.category === "creatures");
  const creatureLevel = creatureEntry.status === "ready" ? getCreatureLevel(creatureEntry.data)
    : creatureSummary?.worldBoss?.find((record) => typeof record.level === "number" && record.level > 0)?.level;
  const displayedName = "occurrences" in point && point.occurrences && point.occurrences > 1
    ? t("map.nearbyLocationCount", { name: getLocalizedMapPointDisplayName(point, gameText), count: point.occurrences })
    : getLocalizedMapPointDisplayName(point, gameText);
  const typeLabel = custom
    ? point.label || t("map.custom.personal")
    : coordinate
      ? point.label
      : point.category === "springboard" ? "" : eventEntrance ? t("map.fieldEvent.entrance") : t(category.labelKey);
  const headingType = reference?.category === "creatures" && creatureLevel !== undefined
    ? `${typeLabel} · ${t(creatureSummary?.worldBoss?.length
      ? "database.acquisition.worldBossLevel" : "reference.adventure.level", { number: creatureLevel })}` : typeLabel;
  const locationLabel = custom ? point.region || mapName : localizeMapName(point.region || mapName, gameText);

  return (
    <div className="map-location-details flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="map-details-header shrink-0">
        <span className="map-details-icon">
          <MapPointIcon fallback={appearance.icon} source={appearance.nativeIconPath} size={appearance.itemArt ? 48 : 28} />
        </span>
        <div className="map-details-heading">
          {custom && editMode ? (
            <input
              value={editor.name}
              onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))}
              placeholder={t("map.details.markerNamePlaceholder")}
              maxLength={200}
              autoFocus={draftMarker}
              className="map-name-input"
              aria-label={t("map.details.markerName")}
            />
          ) : (
            <h2 className="map-details-title">{displayedName}</h2>
          )}
          {headingType && <p className="map-details-type">{headingType}</p>}
          {locationLabel && <p className="map-details-location"><MapPin size={12} aria-hidden="true" /><span className="min-w-0 truncate">{locationLabel}</span></p>}
        </div>
        <button type="button" onClick={onBack} className="map-details-close" aria-label={t("map.details.back")} title={t("map.details.back")}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div ref={bodyRef} className="map-details-body scroll-slim min-h-0 flex-1 overflow-y-auto">
        {point.category === "merchant" && <MapServicePortrait key={creatureEntry.status === "ready" ? creatureEntry.data.icon : "merchant"}
          source={creatureEntry.status === "ready" ? creatureEntry.data.icon : undefined} name={displayedName} />}
        {storageNpc && <MapServicePortrait key={storageNpc.portrait} source={storageNpc.portrait} name={displayedName} />}
        {eventEntrance && <MapEventEntranceArtwork npcId={"entityId" in point ? point.entityId : undefined}
          markerId={point.id} fallbackIconPath={itemIcon} />}
        {!returnTo && !editMode && <div className="map-details-actions">
          {coordinate ? (
            <button type="button" onClick={onSaveCoordinate} className="map-secondary-button">
              <MapPinned size={14} aria-hidden="true" />
              {t("map.details.saveAsMarker")}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggleCompleted}
                aria-pressed={completed}
                title={t("map.details.completed")}
                className={cn("map-secondary-button min-w-0", completed && "map-completed-button-active")}
              >
                <CheckCheck size={14} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{t("map.details.completed")}</span>
              </button>
              {reference && !travelPoint && !["creatures", "exploration"].includes(reference.category) && (
                <button
                  type="button"
                  onClick={() => openReference(reference)}
                  aria-pressed={selectedReference !== undefined ? sameReferenceTarget(selectedReference, reference) : undefined}
                  title={t("map.details.openEntry")}
                  className={cn("map-secondary-button min-w-0", sameReferenceTarget(selectedReference, reference) && "border-accent/60 bg-accent-soft")}
                >
                  <BookOpen size={14} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{t("map.details.openEntry")}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onToggleFavorite}
                aria-pressed={favorite}
                aria-label={t(favorite ? "map.details.removeFavorite" : "map.details.addFavorite")}
                title={t(favorite ? "map.details.removeFavorite" : "map.details.addFavorite")}
                className={cn("map-details-action-icon", favorite && "map-favorite-button-active")}
              >
                <Star size={16} className={favorite ? "fill-current" : ""} aria-hidden="true" />
              </button>
              {custom && <button
                type="button"
                onClick={beginEditing}
                className="map-secondary-button min-w-0"
                aria-label={t("map.details.editMarker")}
                title={t("map.details.editMarker")}
              >
                <Pencil size={14} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{t("map.details.editMarker")}</span>
              </button>}
            </>
          )}
        </div>}

        {returnTo && <button type="button"
          onClick={() => requestMapPointInMain(returnTo.markerId, returnTo.mapId, undefined, true)}
          className="map-secondary-button map-return-button mt-3">
          <ArrowLeft size={14} className="shrink-0" aria-hidden="true" />
          {t("reference.travel.backToPortal")}
        </button>}

        {point.category === "rift" && <MapRiftSchedule mapId={mapId}
          sourceActor={"sourceActor" in point ? point.sourceActor : undefined}
          entityId={"entityId" in point ? point.entityId : undefined} />}
        {travelPoint && <MapMarkerTravel key={`travel-${point.id}`} reference={point.reference} mapId={mapId} markerId={point.id} />}
        {point.category === "flight" && <MapMarkerFlight referenceId={reference?.id} />}
        {point.category === "springboard" && <MapSpringboardDetails effects={point.springboard} />}

        {description && !travelPoint && !collectionItem && !instanceEntrance && !eventEntrance && (
          <p className="mt-3 text-[13px] leading-relaxed text-zinc-300">{gameText(description)}</p>
        )}

        {point.category === "quest-area" && <p className="mt-3 text-xs leading-relaxed text-subtle">{t("map.questAreaNotice")}</p>}
        {sourceContext && <MapSearchSourceDetails context={sourceContext} />}
        {reference && !travelPoint && !instanceEntrance && !eventEntrance && !["flight", "craft-service", "storage"].includes(point.category) && ["creatures", "exploration", "dungeons", "quests"].includes(reference.category) && <MapMarkerAdventure key={`adventure-${point.id}`} reference={reference} objectVariants={"objectVariants" in point ? point.objectVariants : undefined} mapId={mapId} markerId={point.id} showDrops={!["boss", "dungeon-boss", "enemy", "merchant", "event-npc"].includes(point.category)} showDescription={!collectionItem} showFacts={!collectionItem} showDivider={!collectionItem} showCombatAbilities={point.category === "boss" || point.category === "dungeon-boss"} companionSources={reference.category === "creatures" ? companionSources : undefined} onOpenMap={onOpenMap} />}
        {instanceEntrance && reference && <MapInstanceEntrance key={`instance-${point.id}`} referenceId={reference.id} />}
        {eventEntrance && <MapEventEntrance key={`event-${point.id}`} npcId={"entityId" in point ? point.entityId : undefined}
          markerId={point.id} onOpenMap={onOpenMap} showArtwork={false} />}
        {point.category === "event-npc" && <MapEventMissionLink npcId={"entityId" in point ? point.entityId : undefined} />}
        {point.category === "event-object" && <MapEventCandy color={point.subtype} entityId={"entityId" in point ? point.entityId : undefined} />}
        {["merchant", "event-npc"].includes(point.category) && <MapMerchantShop npcId={"entityId" in point ? point.entityId : undefined} onOpenItem={onOpenItem} />}
        {point.category === "craft-service" && <MapCraftService npcId={"entityId" in point ? point.entityId : undefined} />}
        {point.category === "storage" && (storageServices.status === "ready" && storageNpc
          ? <MapStorageService costs={storageServices.data.costs} />
          : storageServices.status === "error" || storageServices.status === "ready"
            ? <p role="alert" className="mt-4 text-xs text-danger-text">{t("reference.error")}</p>
            : <p role="status" className="mt-4 text-xs text-subtle">{t("reference.loading")}</p>)}
        {reference?.category !== "creatures" && <MapCompanionRewards sources={companionSources} />}
        <MapPetRewards sources={petSources} />

        {coordinate && !returnTo && <div className="map-coordinate-card">
          <div className="map-coordinate-value">
            <p className="map-micro-label">{t("map.details.coordinates")}</p>
            <p className="font-mono text-[12px] font-semibold text-zinc-100">
              {displayedCoordinates.x}, {displayedCoordinates.y}
            </p>
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
        </div>}

        {!custom && !coordinate && collectionItem && itemId && (
          <section className="-mx-4 mt-4 border-t border-border">
            <MapItemPanel itemId={itemId} onOpenMap={onOpenMap} embedded />
          </section>
        )}

        {!custom && !coordinate && !collectionItem && (itemId || ["boss", "dungeon-boss", "enemy"].includes(point.category)) && (
          <MapMarkerItems
            key={`items-${point.id}`}
            mapId={mapId}
            markerId={point.id}
            category={point.category}
            reference={reference}
            hasReferenceDetails={reference?.category === "creatures"}
            excludedDropIds={companionSources.map(({ soul }) => soul.id)}
            linkedItemLabelKey={getCategoryConfig(point.category).linkedItemLabelKey}
            linkedItem={itemId ? { id: itemId, name: point.name, icon: itemIcon ?? appearance.nativeIconPath?.replace(/^\//, "") } : undefined}
            onOpenItem={onOpenItem}
          />
        )}

        {(point.category === "boss" || point.category === "dungeon-boss") && creatureEntry.status === "ready"
          && creatureEntry.data.combatGuide?.abilities.some((ability) => ability.effects.length || ability.conditional?.some((branch) => branch.effects.length))
          && bossPanel.status === "ready" && bossPanel.data.entries[creatureEntry.data.id]
          && <div className="mt-4 border-t border-border pt-4">
            <CreatureCombatAbilities abilities={creatureEntry.data.combatGuide?.abilities ?? []}
              icon={bossPanel.data.entries[creatureEntry.data.id].skillIcon} />
          </div>}

        {custom && editMode && (
          <>
            <MapMarkerStylePicker
              color={editor.color}
              icon={editor.icon}
              onChange={(change) => {
                setEditor((current) => ({ ...current, ...change }));
                if (draftMarker) onUpdateStyle(change);
              }}
            />
            <MapMarkerGroupPicker
              group={editor.group}
              onChange={(group) => {
                setEditor((current) => ({ ...current, group }));
                if (draftMarker) onUpdateGroup(group);
              }}
            />
            <section className="map-marker-note">
              <label htmlFor={`map-marker-note-${point.id}`} className="map-micro-label">
                {t("map.details.markerNote")}
              </label>
              <textarea
                id={`map-marker-note-${point.id}`}
                value={editor.note}
                onChange={(event) => setEditor((current) => ({ ...current, note: event.target.value }))}
                placeholder={t("map.details.markerNotePlaceholder")}
                maxLength={10_000}
                rows={4}
              />
            </section>
          </>
        )}

        {custom && !editMode && <div className="map-marker-readonly">
          <section>
            <p className="map-micro-label">{t("map.markerGroups.group")}</p>
            <p>{t(`map.markerGroups.${point.group ?? DEFAULT_MARKER_GROUP}`)}</p>
          </section>
          <section>
            <p className="map-micro-label">{t("map.details.markerNote")}</p>
            <p className={cn(!note && "map-marker-note-empty")}>{note || t("map.details.noMarkerNote")}</p>
          </section>
        </div>}

        {custom && editing && (
          <button type="button" onClick={onRemove} className="map-danger-button">
            <Trash2 size={14} aria-hidden="true" />
            {t("map.details.deleteMarker")}
          </button>
        )}
      </div>
      {editMode && (
        <footer className="map-marker-create-footer">
          {editing && <button type="button" onClick={() => setEditing(false)} className="map-marker-cancel-button">
            {t("map.details.cancelEditing")}
          </button>}
          <button type="button"
            onClick={draftMarker ? () => onCreateMarker(editor.name.trim(), editor.note) : saveEdits}
            disabled={!editor.name.trim()}
            className="map-marker-create-button">
            {draftMarker ? <MapPinPlus size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
            {t(draftMarker ? "map.details.createMarker" : "map.details.saveMarkerChanges")}
          </button>
        </footer>
      )}
    </div>
  );
};

export default MapLocationDetails;
