import { getItemDisplayName } from "../../lib/item-display-name";
import { ArrowLeft, MapPin, PanelLeftClose, Settings, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import { ReferenceNavigationContext, SelectedReferenceContext, sameReferenceTarget } from "../reference/reference-navigation-context";
import { ReferenceLocationContext } from "../reference/reference-location-context";
import MapExplorePanel from "./map-explore-panel";
import MapReferencePanel from "./map-reference-panel";
import type { ReferenceTarget } from "../reference/reference-types";
import MapLocationDetails from "./map-location-details";
import MapMarkerSizePanel from "./map-marker-size-panel";
import type { SearchSourceContext } from "./map-global-search";
import { getLocalizedMapPointDisplayName } from "./map-point-display-name";
import { getPointFilterCategories, type MapCategoryGroupId } from "./map-config";
import type { MapPetSource } from "./map-pet-sources";
import type { MapReferenceSearch } from "./map-focus-request";
import type {
  MapMetadata,
  MapPoint,
  UserMarkerEdits,
  UserMarkerGroup,
  UserMarkerStyleChange,
} from "./types";

interface MapSidebarProps {
  sourceContext?: SearchSourceContext;
  data: MapMetadata;
  referenceHistory: ReferenceTarget[];
  onOpenReference: (target: ReferenceTarget, fromPrimary?: boolean) => void;
  onBackReference: () => void;
  onCloseDetailReference: (keepPrimary?: boolean) => void;
  onOpenMapFromReference: (mapId: string, markerId: string, search?: MapReferenceSearch) => void;
  returnToMarker?: { name: string; onReturn: () => void };
  selectedPoint: MapPoint | null;
  draftMarker: boolean;
  markerNotes: Record<string, string>;
  onCreateMarker: (name: string, note: string) => void;
  onSaveMarkerEdits: (id: string, edits: UserMarkerEdits) => void;
  open: boolean;
  bottomInset?: number;
  markerSizePanelOpen: boolean;
  onMarkerSizePanelOpenChange: (open: boolean) => void;
  compact?: boolean;
  activeCategories: string[];
  pets: MapPetSource[];
  requestedFilterGroup: { groupId: MapCategoryGroupId } | null;
  onFilterGroupOpened: (request: { groupId: MapCategoryGroupId }) => void;
  categoryCounts: Record<string, number>;
  favoriteIds: string[];
  completedIds: string[];
  hideCompleted: boolean;
  hideFavorites: boolean;
  completedPoints: MapPoint[];
  shownMarkerCount: number;
  onOpenChange: (open: boolean) => void;
  onToggleCategory: (categoryId: string) => void;
  onSetCategories: (categoryIds: string[]) => void;
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
  data, sourceContext, referenceHistory, onOpenReference, onBackReference, onCloseDetailReference, onOpenMapFromReference, returnToMarker, selectedPoint, draftMarker, markerNotes, onCreateMarker, onSaveMarkerEdits, open, bottomInset = 0, markerSizePanelOpen, onMarkerSizePanelOpenChange, compact = false,
  activeCategories, pets, requestedFilterGroup, onFilterGroupOpened, categoryCounts, favoriteIds, completedIds, hideCompleted, hideFavorites,
  completedPoints,
  shownMarkerCount,
  onOpenChange, onToggleCategory, onSetCategories, onSelectPoint,
  onToggleFavorite, onToggleCompleted, onToggleHideCompleted, onToggleHideFavorites,
  onUpdateMarkerStyle,
  onUpdateMarkerGroup, onRemoveMarker,
  onSaveCoordinate,
}: MapSidebarProps) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const closeMarkerSizePanel = () => onMarkerSizePanelOpenChange(false);

  if (!open) return null;

  const primaryQuest = selectedPoint && "reference" in selectedPoint && selectedPoint.reference?.category === "exploration" && referenceHistory[0]?.category === "quests"
    ? referenceHistory[0] : undefined;
  const selectedDetail = referenceHistory.length > (primaryQuest ? 1 : 0) ? referenceHistory[referenceHistory.length - 1] : undefined;
  const previousDetail = referenceHistory[referenceHistory.length - 2];
  const togglePrimaryReference = (target: ReferenceTarget) => {
    if (sameReferenceTarget(selectedDetail, target)) onCloseDetailReference();
    else onOpenReference(target);
  };
  const foundCounts = completedPoints.reduce<Record<string, number>>((counts, point) => {
    for (const categoryId of getPointFilterCategories(point)) {
      counts[categoryId] = (counts[categoryId] ?? 0) + 1;
    }
    return counts;
  }, {});

  return (
    <ReferenceNavigationContext.Provider value={onOpenReference}>
    <ReferenceLocationContext.Provider value={selectedPoint ? { mapId: data.id, markerId: selectedPoint.id } : null}>
    <div className="@container pointer-events-none absolute left-5 right-5 top-[4.75rem] z-40 flex items-start gap-3" style={{ bottom: 20 + bottomInset }}>
      {(!markerSizePanelOpen || selectedPoint) && <aside
          aria-label={data.displayName}
          data-map-selection-panel={selectedPoint ? "" : undefined}
          className={cn(
            "pointer-events-auto flex max-h-full max-w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/90 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fade-in",
            selectedPoint ? "map-details-panel" : "map-filter-panel",
            compact ? "w-[17rem]" : selectedPoint ? "w-[22.5rem]" : "w-[19rem]",
            selectedPoint && selectedDetail && "hidden @min-[600px]:flex @min-[600px]:w-[calc(50%_-_0.375rem)] @min-[732px]:w-[22.5rem]",
          )}
        >
          {selectedPoint && returnToMarker && <button type="button" onClick={returnToMarker.onReturn}
            className="flex w-full shrink-0 cursor-pointer items-center gap-1.5 border-b border-border px-4 py-2.5 text-left text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
            <ArrowLeft size={15} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{t("mapInteriors.backToMarker", { name: returnToMarker.name })}</span>
          </button>}
          {selectedPoint && primaryQuest ? (
            <SelectedReferenceContext.Provider value={selectedDetail ?? null}>
            <ReferenceNavigationContext.Provider value={(target) => {
              if (sameReferenceTarget(selectedDetail, target)) onCloseDetailReference(true);
              else onOpenReference(target, true);
            }}>
              <MapReferencePanel target={primaryQuest} backLabel={getLocalizedMapPointDisplayName(selectedPoint, gameText)}
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
                draftMarker={draftMarker}
                note={markerNotes[selectedPoint.id] ?? ""}
                onCreateMarker={onCreateMarker}
                onSaveMarkerEdits={(edits) => onSaveMarkerEdits(selectedPoint.id, edits)}
                sourceContext={sourceContext}
                mapId={data.id}
                mapName={data.displayName}
                onOpenItem={(id) => togglePrimaryReference({ category: "items", id })}
                onOpenMap={onOpenMapFromReference}
                favorite={favoriteIds.includes(selectedPoint.id)}
                completed={completedIds.includes(selectedPoint.id)}
                onBack={() => onSelectPoint(null)}
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
                <button type="button" onClick={() => onMarkerSizePanelOpenChange(true)}
                  aria-label={t("map.filters.markerSizes")}
                  title={t("map.filters.markerSizes")}
                  className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Settings size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => { closeMarkerSizePanel(); onOpenChange(false); }}
                  aria-label={t("map.sidebar.collapse")}
                  title={t("map.sidebar.collapse")}
                  className="grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <PanelLeftClose size={16} aria-hidden="true" />
                </button>
              </header>

              <div className="scroll-slim flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-4">
                <div id="map-sidebar-explore-panel" aria-label={t("map.filters.categories")}>
                  <MapExplorePanel
                    activeCategories={activeCategories}
                    pets={pets}
                    requestedFilterGroup={requestedFilterGroup}
                    onFilterGroupOpened={onFilterGroupOpened}
                    categoryCounts={categoryCounts}
                    foundCounts={foundCounts}
                    hideCompleted={hideCompleted}
                    hideFavorites={hideFavorites}
                    onToggleHideCompleted={onToggleHideCompleted}
                    onToggleHideFavorites={onToggleHideFavorites}
                    onToggleCategory={onToggleCategory}
                    onSetCategories={onSetCategories}
                  />
                </div>
              </div>
            </>
          )}
        </aside>}
      {!selectedPoint && markerSizePanelOpen
        && <MapMarkerSizePanel categoryCounts={categoryCounts} onClose={closeMarkerSizePanel} />}
      {selectedPoint && selectedDetail && <aside aria-label={selectedDetail.name ? getItemDisplayName(selectedDetail.name, gameText(selectedDetail.name)) : t(`reference.categories.${selectedDetail.category}`)}
        data-map-selection-panel
        className="pointer-events-auto flex max-h-full min-w-0 max-w-[26.25rem] flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/95 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fade-in">
        <MapReferencePanel target={selectedDetail}
          backLabel={previousDetail?.name ? getItemDisplayName(previousDetail.name, gameText(previousDetail.name)) : getLocalizedMapPointDisplayName(selectedPoint, gameText)}
          onBack={onBackReference} onClose={() => onCloseDetailReference(Boolean(primaryQuest))} onOpenMap={onOpenMapFromReference} />
      </aside>}
    </div>
    </ReferenceLocationContext.Provider>
    </ReferenceNavigationContext.Provider>
  );
};

export default MapSidebar;
