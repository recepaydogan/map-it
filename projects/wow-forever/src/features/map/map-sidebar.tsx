import { getItemDisplayName } from "../../lib/item-display-name";
import { ArrowLeft, Bookmark, Leaf, MapPin, PanelLeftClose, Settings, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { ReferenceNavigationContext, SelectedReferenceContext, sameReferenceTarget } from "../reference/reference-navigation-context";
import { ReferenceLocationContext } from "../reference/reference-location-context";
import MapExplorePanel from "./map-explore-panel";
import type { MapFilterFocusRequest } from "./map-config";
import MapReferencePanel from "./map-reference-panel";
import type { ReferenceTarget } from "../reference/reference-types";
import MapLocationDetails from "./map-location-details";
import MapForeverdbQuest from "./map-foreverdb-quest";
import MapPointIcon from "./map-point-icon";
import { getPointAppearance } from "./map-config";
import MapMarkerSizePanel from "./map-marker-size-panel";
import MapQuestGroupPanel from "./map-quest-group-panel";
import type { MapQuestGroup } from "./map-marker-overlap";
import type { MapFaction } from "./map-faction-filter";
import type { SearchSourceContext } from "./map-global-search";
import MapSavedPanel from "./map-saved-panel";
import MapGatheringZonesPanel, { type GatheringZone } from "./map-gathering-zones-panel";
import MapSidebarToolPanel from "./map-sidebar-tool-panel";
import type { MapCharacterProfile } from "./map-character-profiles";
import type {
  MapMetadata,
  MapPoint,
  UserMarkerEdits,
  UserMarkerGroup,
  UserMarkerStyleChange,
} from "./types";

/** Which side panel the workspace is showing. Add a mode per new tool panel. */
export type MapSidebarMode = "explore" | "saved" | "gathering";

interface MapSidebarProps {
  filterFocusRequest?: MapFilterFocusRequest | null;
  sourceContext?: SearchSourceContext;
  data: MapMetadata;
  referenceHistory: ReferenceTarget[];
  onOpenReference: (target: ReferenceTarget, fromPrimary?: boolean) => void;
  onBackReference: () => void;
  onCloseDetailReference: (keepPrimary?: boolean) => void;
  onOpenMapFromReference: (mapId: string, markerId: string) => void;
  onReturnToPanel?: () => void;
  returnLabel?: string;
  onOpenMapOverview: (mapId: string) => void;
  selectedPoint: MapPoint | null;
  questGroup: MapQuestGroup | null;
  onCloseQuestGroup: () => void;
  onBackToQuestGroup: () => void;
  draftMarker: boolean;
  markerNotes: Record<string, string>;
  onCreateMarker: (name: string, note: string) => void;
  onSaveMarkerEdits: (id: string, edits: UserMarkerEdits) => void;
  hiddenFlightRouteIds: string[];
  onToggleFlightRoute: (markerId: string) => void;
  mode: MapSidebarMode;
  open: boolean;
  keepFiltersOpen?: boolean;
  compact?: boolean;
  activeCategories: string[];
  characterScopeId: string | null;
  hasCharacters: boolean;
  selectedCharacter: MapCharacterProfile | null;
  onToggleCharacterFilter: () => void;
  categoryCounts: Record<string, number>;
  foundCategoryCounts: Record<string, number>;
  markerGroupCounts: Partial<Record<UserMarkerGroup, number>>;
  foundMarkerGroupCounts: Partial<Record<UserMarkerGroup, number>>;
  hiddenMarkerGroups: UserMarkerGroup[];
  hiddenTrainerTypes: string[];
  favoriteIds: string[];
  completedIds: string[];
  hideCompleted: boolean;
  hideFavorites: boolean;
  savedPoints: MapPoint[];
  completedPoints: MapPoint[];
  gatheringRoute: MapPoint[];
  onPlanGatheringRoute: () => void;
  onClearGatheringRoute: () => void;
  onFocusGatheringZone: (zone: GatheringZone) => void;
  shownMarkerCount: number;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: MapSidebarMode) => void;
  onToggleCategory: (categoryId: string) => void;
  onSetCategories: (categoryIds: string[]) => void;
  onSetHiddenMarkerGroups: (groups: UserMarkerGroup[]) => void;
  onSetHiddenTrainerTypes: (types: string[]) => void;
  factions: readonly MapFaction[];
  onToggleFaction: (faction: MapFaction) => void;
  onSelectPoint: (point: MapPoint | null) => void;
  onToggleFavorite: (id: string) => void;
  onToggleCompleted: (id: string) => void;
  onToggleHideCompleted: () => void;
  onToggleHideFavorites: () => void;
  onUpdateMarkerStyle: (id: string, change: UserMarkerStyleChange) => void;
  onUpdateMarkerGroup: (id: string, group: UserMarkerGroup) => void;
  onRemoveMarker: (id: string) => void;
  onSaveCoordinate: (point: MapPoint) => void;
}

/**
 * Map details and their linked-record inspector share the available workspace.
 * Narrow workspaces retain the same history while showing the inspector alone.
 */
const MapSidebar = ({
  data, filterFocusRequest, sourceContext, referenceHistory, onOpenReference, onBackReference, onCloseDetailReference, onOpenMapFromReference, onReturnToPanel, returnLabel, onOpenMapOverview, selectedPoint, questGroup, onCloseQuestGroup, onBackToQuestGroup, draftMarker, markerNotes, onCreateMarker, onSaveMarkerEdits, hiddenFlightRouteIds, onToggleFlightRoute, mode, open, compact = false,
  keepFiltersOpen = false, activeCategories, characterScopeId, hasCharacters, selectedCharacter, onToggleCharacterFilter,
  categoryCounts, foundCategoryCounts, markerGroupCounts, foundMarkerGroupCounts, hiddenMarkerGroups, hiddenTrainerTypes,
  favoriteIds, completedIds, hideCompleted, hideFavorites,
  savedPoints, completedPoints, gatheringRoute, onPlanGatheringRoute, onClearGatheringRoute,
  onFocusGatheringZone,
  shownMarkerCount,
  onOpenChange, onModeChange, onToggleCategory, onSetCategories, onSetHiddenMarkerGroups, onSetHiddenTrainerTypes, onSelectPoint,
  factions, onToggleFaction,
  onToggleFavorite, onToggleCompleted, onToggleHideCompleted, onToggleHideFavorites,
  onUpdateMarkerStyle,
  onUpdateMarkerGroup, onRemoveMarker,
  onSaveCoordinate,
}: MapSidebarProps) => {
  const { t } = useTranslation();
  const [showMarkerSizes, setMarkerSizePanelOpen] = useState(false);
  const markerSizePanelOpen = showMarkerSizes && !keepFiltersOpen;
  const [questSelection, setQuestSelection] = useState<{ giverId: string; questId: string } | null>(null);
  useEffect(() => {
    if (!filterFocusRequest) return;
    const frame = window.requestAnimationFrame(() => setMarkerSizePanelOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [filterFocusRequest]);
  const flightRouteDestinationIds = useMemo(() => new Set(data.locations
    .filter((point) => point.category === "flight-master").map((point) => point.id)), [data.locations]);

  if (!open) return null;

  const primaryQuest = selectedPoint && "reference" in selectedPoint && selectedPoint.reference?.category === "exploration" && referenceHistory[0]?.category === "quests"
    ? referenceHistory[0] : undefined;
  const selectedDetail = referenceHistory.length > (primaryQuest ? 1 : 0) ? referenceHistory[referenceHistory.length - 1] : undefined;
  const selectedQuest = selectedPoint && questSelection?.giverId === selectedPoint.id
    ? data.locations.find((point) => point.questId === questSelection.questId
      && point.questGiverMarkerId === selectedPoint.id) : undefined;
  const showQuestDetail = !!selectedQuest && !selectedDetail;
  const previousDetail = referenceHistory[referenceHistory.length - 2];
  const openedFromDungeon = !!selectedDetail && (
    (selectedPoint && "reference" in selectedPoint && selectedPoint.reference?.category === "dungeons"
      && selectedPoint.reference.id === selectedDetail.id)
    || referenceHistory.slice(0, -1).some((entry) => entry.category === "dungeons"
      && entry.id === selectedDetail.id && !entry.group)
  );
  const togglePrimaryReference = (target: ReferenceTarget) => {
    if (sameReferenceTarget(selectedDetail, target)) onCloseDetailReference();
    else onOpenReference(target);
  };
  const showSavedPanel = mode === "saved" && !selectedPoint && !questGroup;
  const showGatheringPanel = mode === "gathering" && !selectedPoint && !questGroup;

  return (
    <ReferenceNavigationContext.Provider value={onOpenReference}>
    <ReferenceLocationContext.Provider value={selectedPoint ? { mapId: data.id, markerId: selectedPoint.id } : null}>
    <div className="@container pointer-events-none absolute bottom-5 left-5 right-5 top-[4.75rem] z-40 flex items-start gap-3 @max-[760px]:top-[8.75rem]">
      {questGroup && !selectedPoint ? (
        <MapQuestGroupPanel group={questGroup} onSelect={onSelectPoint} onClose={onCloseQuestGroup} />
      ) : showSavedPanel ? (
        <MapSidebarToolPanel
          title={t("map.saved.title")}
          description={t("map.saved.description")}
          icon={Bookmark}
          onClose={() => onModeChange("explore")}
        >
          <MapSavedPanel
            savedPoints={savedPoints}
            completedPoints={completedPoints}
            onSelect={onSelectPoint}
            gatheringRoute={gatheringRoute}
            onPlanGatheringRoute={onPlanGatheringRoute}
            onClearGatheringRoute={onClearGatheringRoute}
          />
        </MapSidebarToolPanel>
      ) : showGatheringPanel ? (
        <MapSidebarToolPanel title={t("map.gathering.title")}
          description={t("map.gathering.description")} icon={Leaf}
          onClose={() => onModeChange("explore")}>
          <MapGatheringZonesPanel onFocusZone={onFocusGatheringZone} />
        </MapSidebarToolPanel>
      ) : (
        <aside
          aria-label={data.displayName}
          data-tour={!selectedPoint ? "filters-panel" : undefined}
          data-map-selection-panel={selectedPoint ? "" : undefined}
          style={!selectedPoint ? { maxWidth: "min(100%, max(0px, calc(100cqw - var(--map-notification-reserved-width, 0px))))" } : undefined}
          className={cn(
            "pointer-events-auto flex max-h-full min-w-0 max-w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/90 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fade-in",
            selectedPoint ? "map-details-panel" : "map-filter-panel",
            markerSizePanelOpen && !selectedPoint && "@max-[700px]:hidden",
            selectedPoint
              ? compact ? "w-[calc(17rem*var(--app-font-scale))]" : "w-[calc(22.5rem*var(--app-font-scale))]"
              : keepFiltersOpen
                ? "w-[min(calc(27rem*var(--app-font-scale)),55cqw)] @max-[600px]:max-h-[55%] @max-[600px]:w-[calc(19rem*var(--app-font-scale))]"
                : "w-[calc(27rem*var(--app-font-scale))] @max-[620px]:w-[calc(19rem*var(--app-font-scale))]",
            selectedPoint && (selectedDetail || showQuestDetail) && "hidden @min-[600px]:flex @min-[600px]:w-[calc(50%_-_0.375rem)] @min-[732px]:w-[calc(22.5rem*var(--app-font-scale))]",
          )}
        >
          {selectedPoint && onReturnToPanel && <button type="button" onClick={onReturnToPanel}
            className="flex w-full shrink-0 cursor-pointer items-center gap-1.5 border-b border-border px-4 py-3 text-left text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
            <ArrowLeft size={15} className="shrink-0" aria-hidden="true" />
            {returnLabel ?? t("mapInteriors.backToDetails")}
          </button>}
          {selectedPoint && primaryQuest ? (
            <SelectedReferenceContext.Provider value={selectedDetail ?? null}>
            <ReferenceNavigationContext.Provider value={(target) => {
              if (sameReferenceTarget(selectedDetail, target)) onCloseDetailReference(true);
              else onOpenReference(target, true);
            }}>
              <MapReferencePanel target={primaryQuest} backLabel={selectedPoint.name}
                onBack={() => onCloseDetailReference()} onClose={() => onSelectPoint(null)} onOpenMap={onOpenMapFromReference} />
            </ReferenceNavigationContext.Provider>
            </SelectedReferenceContext.Provider>
          ) : selectedPoint ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <SelectedReferenceContext.Provider value={selectedDetail ?? null}>
              <ReferenceNavigationContext.Provider value={togglePrimaryReference}>
              <MapLocationDetails
                key={selectedPoint.id}
                point={selectedPoint}
                mapPoints={data.locations}
                draftMarker={draftMarker}
                note={markerNotes[selectedPoint.id] ?? ""}
                onCreateMarker={onCreateMarker}
                onSaveMarkerEdits={(edits) => onSaveMarkerEdits(selectedPoint.id, edits)}
                flightRouteDestinationIds={flightRouteDestinationIds}
                hiddenFlightRouteIds={hiddenFlightRouteIds}
                onToggleFlightRoute={onToggleFlightRoute}
                sourceContext={sourceContext}
                mapId={data.id}
                mapName={data.displayName}
                selectedQuestId={showQuestDetail ? selectedQuest?.questId : undefined}
                onSelectQuestOffer={(questId) => setQuestSelection({ giverId: selectedPoint.id, questId })}
                onOpenItem={(id) => togglePrimaryReference({ category: "items", id })}
                onOpenMap={onOpenMapFromReference}
                onOpenMapOverview={onOpenMapOverview}
                favorite={favoriteIds.includes(selectedPoint.id)}
                completed={completedIds.includes(selectedPoint.id)}
                onBack={questGroup ? onBackToQuestGroup : () => onSelectPoint(null)}
                backLabel={questGroup ? t("map.questGroup.back") : undefined}
                onToggleFavorite={() => onToggleFavorite(selectedPoint.id)}
                onToggleCompleted={() => onToggleCompleted(selectedPoint.id)}
                onRemove={() => onRemoveMarker(selectedPoint.id)}
                onSaveCoordinate={() => onSaveCoordinate(selectedPoint)}
                onUpdateStyle={(change) => onUpdateMarkerStyle(selectedPoint.id, change)}
                onUpdateGroup={(group) => onUpdateMarkerGroup(selectedPoint.id, group)}
              />
              </ReferenceNavigationContext.Provider>
              </SelectedReferenceContext.Provider>
            </div>
          ) : (
            <>
              <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
                <SlidersHorizontal size={16} className="shrink-0 text-accent" aria-hidden="true" />
                <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                  {t("map.filters.title")}
                </h1>
                <span
                  className="flex items-center gap-1 rounded-[var(--radius-full)] bg-white/8 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-200"
                  title={t("map.filters.countTitle")}
                >
                  <MapPin size={11} className="text-accent" aria-hidden="true" />
                  {shownMarkerCount.toLocaleString()}
                </span>
                <button type="button" onClick={() => setMarkerSizePanelOpen((current) => !current)}
                  disabled={keepFiltersOpen}
                  aria-label={t("map.filters.markerSizes")}
                  title={t("map.filters.markerSizes")}
                  aria-expanded={markerSizePanelOpen}
                  aria-controls={markerSizePanelOpen ? "map-sidebar-tool-panel" : undefined}
                  className={cn("grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-accent",
                    markerSizePanelOpen ? "bg-accent/10 text-accent" : "text-zinc-400")}
                >
                  <Settings size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={keepFiltersOpen}
                  onClick={() => { setMarkerSizePanelOpen(false); onOpenChange(false); }}
                  aria-label={t("map.sidebar.collapse")}
                  title={t("map.sidebar.collapse")}
                  className="grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <PanelLeftClose size={16} aria-hidden="true" />
                </button>
              </header>

              <div className="scroll-slim flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
                <div id="map-sidebar-explore-panel" aria-label={t("map.filters.categories")}>
                  <MapExplorePanel
                    fishingLevelsAvailable={data.id === "azeroth"}
                    filterFocusRequest={filterFocusRequest}
                    activeCategories={activeCategories}
                    characterScopeId={characterScopeId}
                    hasCharacters={hasCharacters}
                    selectedCharacter={selectedCharacter}
                    onToggleCharacterFilter={onToggleCharacterFilter}
                    categoryCounts={categoryCounts}
                    foundCategoryCounts={foundCategoryCounts}
                    markerGroupCounts={markerGroupCounts}
                    foundMarkerGroupCounts={foundMarkerGroupCounts}
                    hiddenMarkerGroups={hiddenMarkerGroups}
                    hiddenTrainerTypes={hiddenTrainerTypes}
                    hideCompleted={hideCompleted}
                    hideFavorites={hideFavorites}
                    onToggleHideCompleted={onToggleHideCompleted}
                    onToggleHideFavorites={onToggleHideFavorites}
                    onToggleCategory={onToggleCategory}
                    onSetCategories={onSetCategories}
                    onSetHiddenMarkerGroups={onSetHiddenMarkerGroups}
                    onSetHiddenTrainerTypes={onSetHiddenTrainerTypes}
                    factions={factions}
                    onToggleFaction={onToggleFaction}
                  />
                </div>
              </div>
            </>
          )}
        </aside>
      )}
      {mode === "explore" && !selectedPoint && !questGroup && markerSizePanelOpen
        && <MapMarkerSizePanel categoryCounts={categoryCounts} onClose={() => setMarkerSizePanelOpen(false)} />}
      {selectedPoint && selectedDetail && <aside aria-label={getItemDisplayName(selectedDetail.name ?? t(`reference.categories.${selectedDetail.category}`))}
        data-map-selection-panel
        className="pointer-events-auto flex max-h-full min-w-0 max-w-[26.25rem] flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/95 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fade-in">
        {onReturnToPanel && <button type="button" onClick={onReturnToPanel}
          className="flex w-full shrink-0 cursor-pointer items-center gap-1.5 border-b border-border px-4 py-3 text-left text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-accent @min-[600px]:hidden">
          <ArrowLeft size={15} className="shrink-0" aria-hidden="true" />
          {returnLabel ?? t("mapInteriors.backToDetails")}
        </button>}
         <MapReferencePanel target={selectedDetail}
          backLabel={previousDetail?.name ?? selectedPoint.name}
          openedFromDungeon={openedFromDungeon}
          onBack={onBackReference} onClose={() => onCloseDetailReference(Boolean(primaryQuest))} onOpenMap={onOpenMapFromReference} />
      </aside>}
      {selectedPoint && selectedQuest && showQuestDetail && <aside aria-label={selectedQuest.name}
        data-map-selection-panel
        className="pointer-events-auto flex max-h-full min-w-0 max-w-[26.25rem] flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/95 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fade-in">
        <header className="map-details-header shrink-0">
          <span className="map-details-icon">
            <MapPointIcon fallback={getPointAppearance(selectedQuest).icon}
              source={getPointAppearance(selectedQuest).nativeIconPath} size={28} />
          </span>
          <div className="map-details-heading">
            <h2 className="map-details-title">{selectedQuest.name}</h2>
          </div>
          <button type="button" onClick={() => setQuestSelection(null)}
            className="map-details-close" aria-label={t("map.details.back")}
            title={t("map.details.back")}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="map-details-body scroll-slim min-h-0 flex-1 overflow-y-auto">
          <MapForeverdbQuest key={selectedQuest.id} markerId={selectedQuest.id} showNavigateToQuest
            showSectionHeading={false} currentGiverMarkerId={selectedPoint.id}
            offeredQuestId={selectedQuest.questId}
            offeredQuestLevel={selectedQuest.questLevel}
            questGiverName={selectedQuest.questGiverName}
            questGiverMarkerId={selectedQuest.questGiverMarkerId}
            mapId={data.id} mapPoints={data.locations} questName={selectedQuest.name}
            questInfo={selectedQuest.questInfo} onOpenMap={(nextMapId, markerId) => {
              if (nextMapId === data.id && markerId === selectedPoint.id) setQuestSelection(null);
              else onOpenMapFromReference(nextMapId, markerId);
            }} />
        </div>
      </aside>}
    </div>
    </ReferenceLocationContext.Provider>
    </ReferenceNavigationContext.Provider>
  );
};

export default MapSidebar;
