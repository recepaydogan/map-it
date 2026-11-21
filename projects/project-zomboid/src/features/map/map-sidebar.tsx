import { Hammer, Map, PackageSearch, PanelLeftClose } from "lucide-react";
import { useLayoutEffect, useRef, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { MapLibraryEntry } from "./community-map-types";
import CraftingPlanner from "./crafting-planner/crafting-planner";
import LootRunPlanner from "./loot-run-planner/loot-run-planner";
import type { LootRunItemOption } from "./loot-run-planner/loot-run-types";
import type { LootRunStartPickerProps } from "./loot-run-planner/loot-run-start-picker";
import MapExplorePanel from "./map-explore-panel";
import MapLibraryPanel from "./map-library-panel";
import MapLocationDetails from "./map-location-details";
import type { MapSidebarMode } from "./map-sidebar-mode-tabs";
import MapSidebarToolPanel from "./map-sidebar-tool-panel";
import type {
  MapMetadata,
  MapPoint,
  SavedLootRun,
  UserMarkerGroup,
  UserMarkerStyleChange,
} from "./types";

interface MapSidebarProps {
  data: MapMetadata;
  selectedPoint: MapPoint | null;
  mode: MapSidebarMode;
  activeCategories: string[];
  categoryCounts: Record<string, number>;
  favoriteIds: string[];
  lootedLocationIds: string[];
  notes: Record<string, string>;
  markerGroupCounts: Partial<Record<UserMarkerGroup, number>>;
  hiddenMarkerGroups: UserMarkerGroup[];
  hideLooted: boolean;
  hideFavorites: boolean;
  lootRunItems: LootRunItemOption[];
  lootRunQuery: string;
  selectedLootRunItemIds: string[];
  selectedLootRunItems: LootRunItemOption[];
  activeLootRun: SavedLootRun | null;
  lootRunStartPicker: LootRunStartPickerProps;
  open: boolean;
  libraryOpen: boolean;
  modRequestInputRef?: Ref<HTMLTextAreaElement>;
  compact?: boolean;
  onOpenChange: (open: boolean) => void;
  onLibraryOpenChange: (open: boolean) => void;
  onModeChange: (mode: MapSidebarMode) => void;
  onToggleCategory: (categoryId: string) => void;
  onSetCategories: (categoryIds: string[]) => void;
  onSelectPoint: (point: MapPoint | null) => void;
  onToggleFavorite: (id: string) => void;
  onToggleLooted: (id: string) => void;
  onSaveNote: (id: string, note: string) => void;
  onEditMarker: (point: MapPoint) => void;
  onRenameMarker: (id: string, name: string) => void;
  onUpdateMarkerStyle: (id: string, change: UserMarkerStyleChange) => void;
  onUpdateMarkerGroup: (id: string, group: UserMarkerGroup) => void;
  onToggleMarkerGroup: (group: UserMarkerGroup) => void;
  onHideLootedChange: (hidden: boolean) => void;
  onHideFavoritesChange: (hidden: boolean) => void;
  onRemoveMarker: (id: string) => void;
  onSaveCoordinate: (point: MapPoint) => void;
  mapLibraryEntries: MapLibraryEntry[];
  activeMapModKeys: string[];
  mapLibraryError: string | null;
  zomboidRootMissing: boolean;
  zomboidRootSelectionInvalid: boolean;
  onToggleMapMods: (keys: string[]) => void;
  onLocateZomboidRoot: () => Promise<void>;
  onRemoveMap: (key: string) => Promise<void>;
  onLootRunQueryChange: (query: string) => void;
  onToggleLootRunItem: (item: LootRunItemOption) => void;
  onStartNewLootRun: () => void;
  onBuildLootRunRoute: () => Promise<boolean>;
  onClearLootRun: () => void;
  onFindCraftingItem: (itemId: string) => void;
  usefulObjectsCoachmarkVisible?: boolean;
  onShowRecommendedUsefulObjects?: () => void;
  onDismissUsefulObjectsCoachmark?: () => void;
}

const MapSidebar = ({
  data, selectedPoint, mode, activeCategories, categoryCounts, favoriteIds, lootedLocationIds,
  notes,
  markerGroupCounts, hiddenMarkerGroups, lootRunItems, lootRunQuery,
  selectedLootRunItemIds, selectedLootRunItems,
  activeLootRun,
  hideLooted, hideFavorites,
  lootRunStartPicker, open, libraryOpen, modRequestInputRef, compact = false, onOpenChange, onLibraryOpenChange,
  onModeChange, onToggleCategory, onSetCategories, onSelectPoint, onToggleFavorite, onToggleLooted, onSaveNote,
  onEditMarker, onRenameMarker, onUpdateMarkerStyle, onUpdateMarkerGroup, onToggleMarkerGroup,
  onRemoveMarker,
  onHideLootedChange, onHideFavoritesChange,
  onSaveCoordinate, mapLibraryEntries, activeMapModKeys,
  mapLibraryError, zomboidRootMissing, zomboidRootSelectionInvalid,
  onToggleMapMods, onLocateZomboidRoot, onRemoveMap,
  onLootRunQueryChange, onToggleLootRunItem, onStartNewLootRun,
  onBuildLootRunRoute,
  onClearLootRun,
  onFindCraftingItem,
  usefulObjectsCoachmarkVisible = false,
  onShowRecommendedUsefulObjects,
  onDismissUsefulObjectsCoachmark,
}: MapSidebarProps) => {
  const { t } = useTranslation();
  const detailsScrollRef = useRef<HTMLDivElement | null>(null);
  const showLibrary = libraryOpen && !compact && !selectedPoint;
  const showToolPanel = open && mode !== "explore" && !selectedPoint && !showLibrary;
  const showMenu = open && !showLibrary && !(showToolPanel && mode === "runs");
  const selectedPointId = selectedPoint?.id;

  useLayoutEffect(() => {
    if (!selectedPointId) return;
    detailsScrollRef.current?.scrollTo({ top: 0 });
  }, [selectedPointId]);

  if (!open && !showLibrary) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-5 left-5 top-[4.75rem] z-40 flex items-start gap-3">
      {showMenu && (
        <aside
          aria-label={data.displayName}
          className={cn(
            "pointer-events-auto flex max-h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/90 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fade-in",
            compact ? "w-[17rem]" : "w-[19rem]",
          )}
        >
        {selectedPoint ? (
          <div ref={detailsScrollRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <MapLocationDetails
              point={selectedPoint}
              data={data}
              favorite={favoriteIds.includes(selectedPoint.id)}
              looted={lootedLocationIds.includes(selectedPoint.id)}
              note={notes[selectedPoint.id] ?? ""}
              onBack={() => onSelectPoint(null)}
              onToggleFavorite={() => onToggleFavorite(selectedPoint.id)}
              onToggleLooted={() => onToggleLooted(selectedPoint.id)}
              onSaveNote={(note) => onSaveNote(selectedPoint.id, note)}
              onEdit={() => onEditMarker(selectedPoint)}
              onRename={(name) => onRenameMarker(selectedPoint.id, name)}
              onRemove={() => onRemoveMarker(selectedPoint.id)}
              onSaveCoordinate={() => onSaveCoordinate(selectedPoint)}
              onUpdateStyle={(change) => onUpdateMarkerStyle(selectedPoint.id, change)}
              onUpdateGroup={(group) => onUpdateMarkerGroup(selectedPoint.id, group)}
            />
          </div>
        ) : (
          <>
            <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
              <Map size={16} className="shrink-0 text-accent" aria-hidden="true" />
              <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                {t("map.sidebar.menu")}
              </h1>
              <span className="map-build-pill">B{data.gameBuild}</span>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label={t("map.sidebar.collapse")}
                title={t("map.sidebar.collapse")}
                className="grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                <PanelLeftClose size={16} aria-hidden="true" />
              </button>
            </header>

            <div className="scroll-slim flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-3">
              <div
                id="map-sidebar-explore-panel"
                aria-label={t("map.filters.all")}
              >
                <MapExplorePanel
                  activeCategories={activeCategories}
                  categoryCounts={categoryCounts}
                  markerGroupCounts={markerGroupCounts}
                  hiddenMarkerGroups={hiddenMarkerGroups}
                  hideLooted={hideLooted}
                  hideFavorites={hideFavorites}
                  compact={compact}
                  onToggleCategory={onToggleCategory}
                  onSetCategories={onSetCategories}
                  onToggleMarkerGroup={onToggleMarkerGroup}
                  onHideLootedChange={onHideLootedChange}
                  onHideFavoritesChange={onHideFavoritesChange}
                  usefulObjectsCoachmarkVisible={usefulObjectsCoachmarkVisible}
                  onShowRecommendedUsefulObjects={onShowRecommendedUsefulObjects}
                  onDismissUsefulObjectsCoachmark={onDismissUsefulObjectsCoachmark}
                />
              </div>
            </div>

          </>
        )}
        </aside>
      )}

      {showLibrary && (
        <MapLibraryPanel
          modRequestInputRef={modRequestInputRef}
          entries={mapLibraryEntries}
          activeModKeys={activeMapModKeys}
          error={mapLibraryError}
          zomboidRootMissing={zomboidRootMissing}
          zomboidRootSelectionInvalid={zomboidRootSelectionInvalid}
          onToggleMods={onToggleMapMods}
          onLocateZomboidRoot={onLocateZomboidRoot}
          onRemove={onRemoveMap}
          onClose={() => onLibraryOpenChange(false)}
        />
      )}

      {showToolPanel && mode === "runs" && (
        <MapSidebarToolPanel
          title={t("map.lootRun.title")}
          description={t("map.lootRun.description")}
          icon={PackageSearch}
          onClose={() => onModeChange("explore")}
          scrollContent={false}
        >
          <LootRunPlanner
            items={lootRunItems}
            query={lootRunQuery}
            selectedItemIds={selectedLootRunItemIds}
            selectedItems={selectedLootRunItems}
            activeRun={activeLootRun}
            startPicker={lootRunStartPicker}
            onQueryChange={onLootRunQueryChange}
            onToggleItem={onToggleLootRunItem}
            onStartNewPlan={onStartNewLootRun}
            onBuildRoute={onBuildLootRunRoute}
            onClearRun={onClearLootRun}
            showHeader={false}
          />
        </MapSidebarToolPanel>
      )}

      {showToolPanel && mode === "craft" && (
        <MapSidebarToolPanel
          title={t("map.crafting.title")}
          description={t("map.crafting.description")}
          icon={Hammer}
          onClose={() => onModeChange("explore")}
        >
          {data.crafting ? (
            <CraftingPlanner
              crafting={data.crafting}
              items={data.items}
              lootIndex={data.lootIndex}
              onFindItem={onFindCraftingItem}
              showHeader={false}
            />
          ) : (
            <p className="rounded-[var(--radius-md)] border border-dashed border-border p-4 text-center text-[11px] text-white/75">
              {t("map.crafting.unavailable")}
            </p>
          )}
        </MapSidebarToolPanel>
      )}
    </div>
  );
};

export default MapSidebar;
