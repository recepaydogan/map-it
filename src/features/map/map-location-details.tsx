import { ArrowLeft, Check, CheckCheck, Copy, BookOpen, MapPin, MapPinned, MapPinPlus, Pencil, Star, Trash2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import MapMarkerItems from "../database/map-marker-items";
import MapItemPanel from "./map-item-panel";
import { getCategoryConfig, getPointAppearance, MAP_CATEGORY_GROUPS } from "./map-config";
import MapPointIcon from "./map-point-icon";
import { getMapPointDisplayName } from "./map-point-display-name";
import { getMapTrainerInfo } from "./map-trainer-info";
import MapMarkerStylePicker from "./map-marker-style-picker";
import MapMarkerGroupPicker from "./map-marker-group-picker";
import { DEFAULT_MARKER_GROUP } from "./marker-group-config";
import { isUserMapMarker, type MapPoint, type UserMarkerEdits, type UserMarkerGroup, type UserMarkerStyleChange } from "./types";
import { usePointDraft } from "./use-point-draft";
import { sameReferenceTarget, useReferenceNavigation, useSelectedReference } from "../reference/reference-navigation-context";
import MapMarkerTravel from "../reference/map-marker-travel";
import MapMarkerFlight from "../reference/map-marker-flight";
import MapMarkerAdventure from "../reference/map-marker-adventure";
import { useReferenceEntry, useReferenceIndex } from "../reference/use-reference-data";
import { getCreatureLevel } from "../reference/creature-heading";
import MapSearchSourceDetails from "./map-search-source-details";
import type { SearchSourceContext } from "./map-global-search";
import { COLLECTIBLE_PROGRESSION, CREATURE_REWARD_LAYOUT_TRIAL } from "../../game-config";
import MapCompanionRewards from "./map-companion-rewards";
import MapServicePortrait from "./map-service-portrait";
import MapMerchantShop from "./map-merchant-shop";
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
import { hasMapDefinition } from "./map-registry";
import { hasUsefulInstanceMapLink } from "./instance-map-link";
import MapLinkedMarkers from "./map-linked-markers";
import MapForeverdbQuest from "./map-foreverdb-quest";
import RareCreatureDetails from "./rare-creature-details";
import SpellLink from "../spells/spell-link";
import MapQuestNpcGuides from "./map-quest-npc-guides";
import MapQuestGiverOffers from "./map-quest-giver-offers";
import { NATIVE_WIKI_CATEGORIES } from "../reference/use-native-wiki";
import NativeMapReferenceSummary from "./native-map-reference-summary";

interface MapLocationDetailsProps {
  sourceContext?: SearchSourceContext;
  point: MapPoint;
  mapPoints?: MapPoint[];
  draftMarker: boolean;
  note: string;
  onCreateMarker: (name: string, note: string) => void;
  onSaveMarkerEdits: (edits: UserMarkerEdits) => void;
  flightRouteDestinationIds: ReadonlySet<string>;
  hiddenFlightRouteIds: string[];
  onToggleFlightRoute: (markerId: string) => void;
  mapId: string;
  mapName: string;
  onOpenItem?: (itemId: string) => void;
  onViewDetails?: () => void;
  selectedQuestId?: string;
  onSelectQuestOffer?: (questId: string) => void;
  onOpenMap: (mapId: string, markerId: string) => void;
  onOpenMapOverview: (mapId: string) => void;
  favorite: boolean;
  completed: boolean;
  onBack: () => void;
  backLabel?: string;
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
  mapPoints = [],
  draftMarker,
  note,
  onCreateMarker,
  onSaveMarkerEdits,
  flightRouteDestinationIds,
  hiddenFlightRouteIds,
  onToggleFlightRoute,
  sourceContext,
  mapId,
  mapName,
  onOpenItem,
  onViewDetails,
  selectedQuestId,
  onSelectQuestOffer,
  onOpenMap,
  onOpenMapOverview,
  favorite,
  completed,
  onBack,
  backLabel,
  onToggleFavorite,
  onToggleCompleted,
  onRemove,
  onSaveCoordinate,
  onUpdateStyle,
  onUpdateGroup,
}: MapLocationDetailsProps) => {
  const { t } = useTranslation();
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
  // Hunter pet NPC IDs identify the source creature, but there is no matching
  // standalone NPC reference page in this app.
  const reference = !custom && !point.category.startsWith("hunter-pet-") ? point.reference : undefined;
  const nativeReference = point.category.startsWith("native-") && reference && NATIVE_WIKI_CATEGORIES.has(reference.category);
  const creatureIndex = useReferenceIndex(!nativeReference && reference?.category === "creatures");
  const instanceEntrance = point.category === "instance-entrance" && !!reference;
  const instanceLocation = point.category === "dungeon" || point.category === "raid";
  const eventEntrance = point.category === "event-entrance" && !!reference;
  const companionSources = getMapCompanionSources(point);
  const itemId = !custom ? point.itemId : undefined;
  const itemIcon = !custom ? point.iconPath : undefined;
  const collectionItem = !!itemId && COLLECTIBLE_PROGRESSION.itemIds.includes(itemId);
  const inlineSelfItem = !!itemId && ["gatherable-fish-", "gatherable-cloth-",
    "gatherable-leather-", "gatherable-herb-"].some((prefix) => point.category.startsWith(prefix));
  const displayedCoordinates = "referenceCoordinates" in point
    ? point.referenceCoordinates ?? point
    : point;
  const description = "description" in point ? point.description : undefined;
  const foreverQuestMarker = ["quest", "repeatable-quest"].includes(point.category)
    && point.id.startsWith("mapgenie-");
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<UserMarkerEdits>(() => ({
    name: point.name,
    note,
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
  const categoryGroup = MAP_CATEGORY_GROUPS.find(({ id }) => id === category.groupId);
  const creatureSummary = creatureIndex.status === "ready" && reference?.category === "creatures"
    ? creatureIndex.data.entries.find((entry) => entry.id === reference.id && entry.category === reference.category)
    : undefined;
  const creatureEntry = useReferenceEntry(creatureSummary);
  const creatureLevel = creatureEntry.status === "ready" ? getCreatureLevel(creatureEntry.data)
    : creatureSummary?.worldBoss?.find((record) => typeof record.level === "number" && record.level > 0)?.level;
  const displayedName = "occurrences" in point && point.occurrences && point.occurrences > 1
    ? t("map.nearbyLocationCount", { name: getMapPointDisplayName(point), count: point.occurrences })
    : getMapPointDisplayName(point);
  const trainer = getMapTrainerInfo(point);
  const typeLabel = custom
    ? point.label || t("map.custom.personal")
    : coordinate
      ? point.label
      : "questOffers" in point && point.questOffers?.length
        ? t(point.subtype === "dungeon-quest-giver"
          ? "map.questGivers.dungeonQuestGiver" : "map.questGivers.questGiver")
      : point.category === "springboard" || trainer
        ? "" : eventEntrance ? t("map.fieldEvent.entrance") : t(category.labelKey);
  const headingType = reference?.category === "creatures" && creatureLevel !== undefined
    ? `${typeLabel} · ${t(reference.id === CREATURE_REWARD_LAYOUT_TRIAL.creatureId
      ? "database.acquisition.trialLevel" : "reference.adventure.level", { number: creatureLevel })}` : typeLabel;
  const headingWithDetail = trainer ? "" : [
    point.category.startsWith("gatherable-") && typeLabel.toLowerCase() === displayedName.toLowerCase()
      ? "" : headingType,
    "detailLabel" in point ? point.detailLabel : undefined,
  ]
    .filter((label, index, labels) => label && (index === 0 || label.toLowerCase() !== labels[0]?.toLowerCase())).join(" · ");
  const locationLabel = nativeReference ? mapName : point.region || mapName;

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
          {headingWithDetail && <p className="map-details-type">{headingWithDetail}</p>}
          {locationLabel && <p className="map-details-location"><MapPin size={12} aria-hidden="true" /><span className="min-w-0 truncate">{locationLabel}</span></p>}
          {categoryGroup && !nativeReference && <p className="map-details-type">{t(categoryGroup.labelKey)}</p>}
        </div>
        <button type="button" onClick={onBack} className="map-details-close" aria-label={backLabel ?? t("map.details.back")} title={backLabel ?? t("map.details.back")}>
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
              {reference && !nativeReference && !travelPoint && !["creatures", "exploration", "places", "flight-points", "battlegrounds"].includes(reference.category) && (
                <button
                  type="button"
                  onClick={onViewDetails ?? (() => openReference(reference))}
                  aria-pressed={selectedReference !== undefined ? sameReferenceTarget(selectedReference, reference) : undefined}
                  title={t("map.details.openEntry")}
                  className={cn("map-secondary-button min-w-0", sameReferenceTarget(selectedReference, reference) && (nativeReference ? "border-white/30 bg-white/5" : "border-accent/60 bg-accent-soft"))}
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

        {trainer && <dl className="mt-3 grid gap-3">
          <div>
            <dt className="map-micro-label">{t("map.details.category")}</dt>
            <dd className="mt-1 text-[13px] leading-relaxed text-zinc-200">{t(category.labelKey)}</dd>
          </div>
          <div>
            <dt className="map-micro-label">{t("map.details.trainer")}</dt>
            <dd className="mt-1 text-[13px] leading-relaxed text-zinc-200">{displayedName}</dd>
          </div>
          {trainer.className && trainer.className !== trainer.title && <div>
            <dt className="map-micro-label">{t("map.details.class")}</dt>
            <dd className="mt-1 text-[13px] leading-relaxed text-zinc-200">{trainer.className}</dd>
          </div>}
          {trainer.title && <div>
            <dt className="map-micro-label">{t("map.details.title")}</dt>
            <dd className="mt-1 text-[13px] leading-relaxed text-zinc-200">{trainer.title}</dd>
          </div>}
          {trainer.faction && <div>
            <dt className="map-micro-label">{t("map.details.faction")}</dt>
            <dd className="mt-1 text-[13px] leading-relaxed text-zinc-200">{trainer.faction}</dd>
          </div>}
        </dl>}

        {!custom && point.category.startsWith("hunter-pet-") && <section className="mt-4 space-y-2">
          <p className="text-xs text-zinc-200">{t("map.hunterPetDetails.tameable")}
            {point.petLevels && <> · {t("map.hunterPetDetails.level", { level: point.petLevels })}</>}</p>
          {!!point.petAbilities?.length && <><h3 className="map-micro-label">{t("map.hunterPetDetails.abilities")}</h3>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 138px), 1fr))" }}>
              {point.petAbilities.map((ability) => <SpellLink key={ability.id} id={ability.id} name={ability.name} showIcon
                wrapperClassName="block min-w-0 w-full"
                className={cn("flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-transparent px-2 py-2 text-left text-[12px] font-medium leading-4 text-zinc-100 transition-colors hover:border-white/30 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-accent",
                  selectedReference?.category === "spells" && selectedReference.id === String(ability.id) && "border-white/30 bg-white/[0.05]")} />)}
            </div></>}
        </section>}

        {!custom && point.droppedBy?.length ? <section className="mt-4">
          <h3 className="map-micro-label">{t(point.category.startsWith("gatherable-leather-")
            ? "map.details.skinnedFrom" : "map.details.droppedBy")}</h3>
          <p className="mt-1 text-xs leading-relaxed text-subtle">{t("map.details.farmingAreaCreatures")}</p>
          <ul className="mt-2 grid gap-1.5">
            {point.droppedBy.map((creature) => <li key={creature.id}
              className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[13px] text-zinc-200">
              {creature.name}
            </li>)}
          </ul>
        </section> : null}

        {returnTo && <button type="button"
          onClick={() => requestMapPointInMain(returnTo.markerId, returnTo.mapId)}
          className="map-secondary-button map-return-button mt-3">
          <ArrowLeft size={14} className="shrink-0" aria-hidden="true" />
          {t("map.details.backToSourceMarker")}
        </button>}

        {instanceLocation && description && <p className="mb-3 text-[13px] leading-relaxed text-zinc-300">{description}</p>}
        {instanceLocation && hasUsefulInstanceMapLink(point.id) && point.relatedMapId && hasMapDefinition(point.relatedMapId) && <button type="button"
          onClick={() => onOpenMapOverview(point.relatedMapId!)}
          className="map-secondary-button mt-3 w-full justify-center">
          <MapPinned size={14} className="shrink-0" aria-hidden="true" />
          {t("map.instanceMaps.open")}
        </button>}

        {point.category === "rift" && <MapRiftSchedule mapId={mapId}
          sourceActor={"sourceActor" in point ? point.sourceActor : undefined}
          entityId={"entityId" in point ? point.entityId : undefined} />}
        {travelPoint && <MapMarkerTravel key={`travel-${point.id}`} reference={point.reference} mapId={mapId} markerId={point.id} />}
        {point.category === "flight" && <MapMarkerFlight referenceId={reference?.id} />}
        {point.category === "springboard" && <MapSpringboardDetails effects={point.springboard} />}
        {(point.category === "rare" || point.category === "rare-elite") && <RareCreatureDetails
          npcId={"entityId" in point ? point.entityId : undefined} onOpenItem={onOpenItem}
          allowMissing />}

        {description && !instanceLocation && !travelPoint && !collectionItem && !instanceEntrance && !eventEntrance && !foreverQuestMarker && (
          <p className="mt-3 text-[13px] leading-relaxed text-zinc-300">{description}</p>
        )}
        {point.category === "npc" && !!point.questNpcDungeonIds?.length &&
          <MapQuestNpcGuides npcName={point.questNpcNameKey ? t(point.questNpcNameKey) : point.name}
            dungeonIds={point.questNpcDungeonIds} />}

        {point.category === "quest-area" && <p className="mt-3 text-xs leading-relaxed text-subtle">{t("map.questAreaNotice")}</p>}
        {(foreverQuestMarker || "questId" in point && !!point.questId) &&
          <MapForeverdbQuest markerId={point.id} mapId={mapId} questName={point.name}
            mapPoints={mapPoints}
            offeredQuestId={"questId" in point ? point.questId : undefined}
            offeredQuestLevel={"questLevel" in point ? point.questLevel : undefined}
            questGiverName={"questGiverName" in point ? point.questGiverName : undefined}
            questGiverMarkerId={"questGiverMarkerId" in point ? point.questGiverMarkerId : undefined}
            questInfo={"questInfo" in point ? point.questInfo : undefined}
            dungeonIds={"questNpcDungeonIds" in point ? point.questNpcDungeonIds : undefined}
            questNpcName={"questNpcNameKey" in point && point.questNpcNameKey ? t(point.questNpcNameKey) : undefined}
            existingDescription={description} onOpenMap={onOpenMap} />}
        {"questOffers" in point && !!point.questOffers?.length &&
          <MapQuestGiverOffers point={point} selectedQuestId={selectedQuestId}
            onSelectQuest={onSelectQuestOffer} />}
        {nativeReference && reference && <NativeMapReferenceSummary reference={reference} markerId={point.id} markerCategory={point.category} />}
        {sourceContext && <MapSearchSourceDetails context={sourceContext} />}
        {"linkedMarkers" in point && point.linkedMarkers?.length && point.linkedMarkersTitleKey &&
          <MapLinkedMarkers links={point.linkedMarkers} titleKey={point.linkedMarkersTitleKey}
            onOpenMap={onOpenMap}
            routeControls={category.routeLinksTitleKey
              && point.linkedMarkersTitleKey === category.routeLinksTitleKey
              ? { mapId, availableDestinationIds: flightRouteDestinationIds,
                hiddenDestinationIds: hiddenFlightRouteIds, onToggle: onToggleFlightRoute }
              : undefined} />}
        {"linkedMarkerGroups" in point && point.linkedMarkerGroups?.map((group) =>
          <MapLinkedMarkers key={`${point.id}:${group.titleKey}`} links={group.links}
            titleKey={group.titleKey} onOpenMap={onOpenMap} />)}
        {!nativeReference && reference && !travelPoint && !instanceEntrance && !eventEntrance && point.category !== "signpost" && !["flight", "craft-service", "storage"].includes(point.category) && ["creatures", "exploration", "dungeons", "quests"].includes(reference.category) && <MapMarkerAdventure key={`adventure-${point.id}`} reference={reference} objectVariants={"objectVariants" in point ? point.objectVariants : undefined} mapId={mapId} markerId={point.id} showDrops={!["boss", "enemy", "merchant"].includes(point.category)} showDescription={!collectionItem} showFacts={!collectionItem} showDivider={!collectionItem} instanceFacts={instanceLocation ? point.instanceFacts : undefined} instanceEncounters={instanceLocation ? point.instanceEncounters : undefined} companionSources={reference.category === "creatures" ? companionSources : undefined} onOpenMap={onOpenMap} />}
        {instanceEntrance && reference && <MapInstanceEntrance key={`instance-${point.id}`} referenceId={reference.id} />}
        {eventEntrance && <MapEventEntrance key={`event-${point.id}`} npcId={"entityId" in point ? point.entityId : undefined}
          markerId={point.id} onOpenMap={onOpenMap} showArtwork={false} />}
        {point.category === "merchant" && "entityId" in point && point.entityId
          && <MapMerchantShop npcId={point.entityId} onOpenItem={onOpenItem} />}
        {point.category === "craft-service" && <MapCraftService npcId={"entityId" in point ? point.entityId : undefined} />}
        {point.category === "storage" && (storageServices.status === "ready" && storageNpc
          ? <MapStorageService costs={storageServices.data.costs} />
          : storageServices.status === "error" || storageServices.status === "ready"
            ? <p role="alert" className="mt-4 text-xs text-danger-text">{t("reference.error")}</p>
            : <p role="status" className="mt-4 text-xs text-subtle">{t("reference.loading")}</p>)}
        {reference?.category !== "creatures" && <MapCompanionRewards sources={companionSources} />}

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

        {!custom && !coordinate && !collectionItem && (itemId || ["boss", "enemy"].includes(point.category)) && (
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
            onOpenMap={onOpenMap}
            inlineSelfItem={inlineSelfItem}
          />
        )}

        {custom && editMode && (
          <>
            <MapMarkerStylePicker
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
