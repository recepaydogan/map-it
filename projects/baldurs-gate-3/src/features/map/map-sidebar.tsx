import { Bookmark, Map as MapIcon, PanelLeftClose } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { useMediaQuery } from "../../utils/platform";
import ItemDatabaseDetail from "../items/item-database-detail";
import type { ItemDatabaseEntry } from "../items/types";
import { useItemDatabase } from "../items/use-item-database";
import MapExplorePanel from "./map-explore-panel";
import MapCharacterProfile from "./map-character-profile";
import type { MapPointStatusFilter } from "./map-filter-quick-controls";
import MapLocationDetails from "./map-location-details";
import { requestMapLocationNavigation } from "./map-location-navigation";
import type { PersonalMarkerLayer } from "./map-personal-marker-filter";
import MapSavedPanel from "./map-saved-panel";
import MapSidebarToolPanel from "./map-sidebar-tool-panel";
import type {
  MapMetadata,
  MapPoint,
  MapSearchIndexLocation,
  UserMarkerGroup,
  UserMarkerStyleChange,
} from "./types";

/** Which side panel the workspace is showing. Add a mode per new tool panel. */
export type MapSidebarMode = "explore" | "saved";

interface MapSidebarProps {
  data: MapMetadata;
  selectedPoint: MapPoint | null;
  /** The point the selected one was drilled into from, when there is one. */
  parentPoint: MapPoint | null;
  mode: MapSidebarMode;
  open: boolean;
  compact?: boolean;
  activeCategories: string[];
  categoryCounts: Record<string, number>;
  completedCategoryCounts: Record<string, number>;
  completedIds: string[];
  favoriteIds: string[];
  markerGroupCounts: Partial<Record<UserMarkerGroup, number>>;
  hiddenMarkerGroups: UserMarkerGroup[];
  personalMarkerCounts: Record<PersonalMarkerLayer, number>;
  hiddenPersonalMarkerLayers: PersonalMarkerLayer[];
  hiddenPointStatuses: MapPointStatusFilter[];
  connectedLocations: MapSearchIndexLocation[];
  accessLocations: MapSearchIndexLocation[];
  partyMemberLocations: MapSearchIndexLocation[];
  itemOwnerLocations: MapSearchIndexLocation[];
  combinationLocations: MapSearchIndexLocation[];
  mechanismLocations: MapSearchIndexLocation[];
  questLocations: MapSearchIndexLocation[];
  savedPoints: MapPoint[];
  completedPoints: MapPoint[];
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: MapSidebarMode) => void;
  onToggleCategory: (categoryId: string) => void;
  onSetCategories: (categoryIds: string[]) => void;
  onSelectPoint: (point: MapPoint | null) => void;
  onSelectMatchingLocation: (location: MapSearchIndexLocation) => void;
  onToggleCompleted: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onCenterPoint: (point: MapPoint) => void;
  onRenameMarker: (id: string, name: string) => void;
  onUpdateMarkerStyle: (id: string, change: UserMarkerStyleChange) => void;
  onUpdateMarkerGroup: (id: string, group: UserMarkerGroup) => void;
  onToggleMarkerGroup: (group: UserMarkerGroup) => void;
  onTogglePersonalMarkerLayer: (layer: PersonalMarkerLayer) => void;
  onTogglePointStatus: (status: MapPointStatusFilter) => void;
  onRemoveMarker: (id: string) => void;
  onSaveCoordinate: (point: MapPoint) => void;
  onBackToParent: () => void;
}

/**
 * The floating panel column on the map's left. Exactly one thing shows at a
 * time: a selected point's details, the Saved tool panel, or the Menu (map
 * layers). The workspace decides which through `open`, `mode` and
 * `selectedPoint`; this component only lays them out.
 */
const MapSidebar = ({
  data, selectedPoint, parentPoint, mode, open, compact = false,
  activeCategories, categoryCounts, completedCategoryCounts, completedIds, favoriteIds,
  markerGroupCounts, hiddenMarkerGroups, personalMarkerCounts, hiddenPersonalMarkerLayers,
  hiddenPointStatuses,
  connectedLocations,
  accessLocations,
  partyMemberLocations,
  itemOwnerLocations,
  combinationLocations,
  mechanismLocations,
  questLocations,
  savedPoints, completedPoints,
  onOpenChange, onModeChange, onToggleCategory, onSetCategories, onSelectPoint,
  onSelectMatchingLocation,
  onToggleCompleted, onToggleFavorite, onCenterPoint, onRenameMarker, onUpdateMarkerStyle,
  onUpdateMarkerGroup, onToggleMarkerGroup, onTogglePersonalMarkerLayer, onRemoveMarker,
  onTogglePointStatus,
  onSaveCoordinate,
  onBackToParent,
}: MapSidebarProps) => {
  const { t, i18n } = useTranslation();
  const [itemDrill, setItemDrill] = useState<{
    pointId: string;
    items: ItemDatabaseEntry[];
  } | null>(null);
  const { data: itemDatabase } = useItemDatabase();
  const itemById = useMemo(
    () => new Map((itemDatabase?.items ?? []).map((item) => [item.id, item])),
    [itemDatabase],
  );
  const [combatProfilePointId, setCombatProfilePointId] = useState<string | null>(null);
  const supportsAdjacentPanel = useMediaQuery("(min-width: 1300px)") && !compact;
  const combatContextPointId = open ? selectedPoint?.id ?? null : null;
  const [previousCombatContextPointId, setPreviousCombatContextPointId] = useState(combatContextPointId);
  if (combatContextPointId !== previousCombatContextPointId) {
    setPreviousCombatContextPointId(combatContextPointId);
    setCombatProfilePointId(null);
  }
  const combatProfileOpen = open && combatProfilePointId === selectedPoint?.id;

  useEffect(() => {
    if (!combatProfileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setCombatProfilePointId(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [combatProfileOpen]);

  if (!open) return null;

  const showToolPanel = mode === "saved" && !selectedPoint;
  const drilledItems = itemDrill && itemDrill.pointId === selectedPoint?.id ? itemDrill.items : [];
  const drilledItem = drilledItems.at(-1) ?? null;
  const previousDrilledItem = drilledItems.at(-2) ?? null;
  const selectedContent = selectedPoint && "contentId" in selectedPoint && selectedPoint.contentId
    ? data.content.entities[selectedPoint.contentId]
    : undefined;
  const language = (i18n.resolvedLanguage ?? i18n.language).split("-")[0];
  const pointName = (point: MapPoint | null) => {
    const content = point && "contentId" in point && point.contentId
      ? data.content.entities[point.contentId]
      : undefined;
    return content?.localizedTitles?.[language]
      ?? content?.localizedTitles?.en
      ?? point?.name
      ?? "";
  };
  const selectedPointName = pointName(selectedPoint);
  const itemName = (item: ItemDatabaseEntry) => (
    item.localizedNames[language]
      ?? item.localizedNames.en
      ?? item.name
  );
  const popItemDrill = () => setItemDrill((current) => {
    if (!current || current.pointId !== selectedPoint?.id || current.items.length <= 1) return null;
    return { ...current, items: current.items.slice(0, -1) };
  });
  const selectRelatedItem = (itemId: string) => {
    const item = itemById.get(itemId);
    if (!item) {
      console.error(`Related item "${itemId}" was not found in the item database.`);
      return;
    }
    setItemDrill((current) => {
      if (!selectedPoint) return current;
      if (!current || current.pointId !== selectedPoint.id) {
        return { pointId: selectedPoint.id, items: [item] };
      }
      if (current.items.at(-1)?.id === item.id) return current;
      return { ...current, items: [...current.items, item] };
    });
  };
  const panelClass = "pointer-events-auto flex max-h-full w-[22.5rem] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/90 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fade-in";
  const renderItemDetail = (adjacent: boolean) => drilledItem && (
    <ItemDatabaseDetail
      item={drilledItem}
      layout="panel"
      backLabel={t("items.backToLocation", {
        location: previousDrilledItem ? itemName(previousDrilledItem) : selectedPointName,
      })}
      onBack={adjacent && !previousDrilledItem ? undefined : popItemDrill}
      onClose={adjacent ? () => setItemDrill(null) : () => onSelectPoint(null)}
      onSelectRelatedItem={selectRelatedItem}
      onNavigateMapLocation={(target) => requestMapLocationNavigation({ ...target, drill: true })}
    />
  );

  return (
    <div className="pointer-events-none absolute bottom-5 left-5 top-[4.75rem] z-60 flex items-start gap-3">
      {showToolPanel ? (
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
          />
        </MapSidebarToolPanel>
      ) : (
        <aside
          aria-label={data.displayName}
          className={cn(
            panelClass,
            compact ? "w-[17rem]" : selectedPoint ? "w-[22.5rem]" : "w-[19rem]",
          )}
        >
          {selectedPoint ? (
            <div key={selectedPoint.id} className="flex min-h-0 flex-1 flex-col">
              {combatProfileOpen && selectedContent?.gameplay?.combat ? (
                <MapCharacterProfile
                  name={selectedPointName}
                  profile={selectedContent.gameplay.combat}
                  onBack={() => setCombatProfilePointId(null)}
                  onClose={() => onSelectPoint(null)}
                />
              ) : drilledItem && !supportsAdjacentPanel ? renderItemDetail(false) : (
                <MapLocationDetails
                  mapId={data.id}
                  point={selectedPoint}
                  content={selectedContent}
                  parentLabel={parentPoint
                    ? t("map.details.backTo", { location: pointName(parentPoint) })
                    : undefined}
                  onNavigateBack={parentPoint ? onBackToParent : undefined}
                  connectedLocations={connectedLocations}
                  accessLocations={accessLocations}
                  partyMemberLocations={partyMemberLocations}
                  itemOwnerLocations={itemOwnerLocations}
                  combinationLocations={combinationLocations}
                  mechanismLocations={mechanismLocations}
                  questLocations={questLocations}
                  completed={completedIds.includes(selectedPoint.id)}
                  favorite={favoriteIds.includes(selectedPoint.id)}
                  selectedLootItemId={drilledItems[0]?.id}
                  onBack={() => onSelectPoint(null)}
                  onToggleCompleted={() => onToggleCompleted(selectedPoint.id)}
                  onToggleFavorite={() => onToggleFavorite(selectedPoint.id)}
                  onCenter={() => onCenterPoint(selectedPoint)}
                  onOpenCombatProfile={() => {
                    setItemDrill(null);
                    setCombatProfilePointId(selectedPoint.id);
                  }}
                  onSelectMatchingLocation={onSelectMatchingLocation}
                  onRename={(name) => onRenameMarker(selectedPoint.id, name)}
                  onRemove={() => onRemoveMarker(selectedPoint.id)}
                  onSaveCoordinate={() => onSaveCoordinate(selectedPoint)}
                  onUpdateStyle={(change) => onUpdateMarkerStyle(selectedPoint.id, change)}
                  onUpdateGroup={(group) => onUpdateMarkerGroup(selectedPoint.id, group)}
                  onSelectRelatedItem={selectRelatedItem}
                  onSelectLootItem={(item) => {
                    setCombatProfilePointId(null);
                    setItemDrill((current) => (
                      current?.pointId === selectedPoint.id && current.items[0]?.id === item.id
                        ? null
                        : { pointId: selectedPoint.id, items: [item] }
                    ));
                  }}
                />
              )}
            </div>
          ) : (
            <>
              <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
                <MapIcon size={16} className="shrink-0 text-accent" aria-hidden="true" />
                <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                  {t("map.sidebar.menu")}
                </h1>
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
                <div id="map-sidebar-explore-panel" aria-label={t("map.filters.categories")}>
                  <MapExplorePanel
                    activeCategories={activeCategories}
                    categoryCounts={categoryCounts}
                    completedCategoryCounts={completedCategoryCounts}
                    markerGroupCounts={markerGroupCounts}
                    hiddenMarkerGroups={hiddenMarkerGroups}
                    personalMarkerCounts={personalMarkerCounts}
                    hiddenPersonalMarkerLayers={hiddenPersonalMarkerLayers}
                    hiddenPointStatuses={hiddenPointStatuses}
                    compact={compact}
                    onToggleCategory={onToggleCategory}
                    onSetCategories={onSetCategories}
                    onToggleMarkerGroup={onToggleMarkerGroup}
                    onTogglePersonalMarkerLayer={onTogglePersonalMarkerLayer}
                    onTogglePointStatus={onTogglePointStatus}
                  />
                </div>
              </div>
            </>
          )}
        </aside>
      )}
      {!showToolPanel && selectedPoint && drilledItem && supportsAdjacentPanel && (
        <aside aria-label={t("items.detailsFor", { item: drilledItem.name })} className={panelClass}>
          <div className="flex min-h-0 flex-1 flex-col">{renderItemDetail(true)}</div>
        </aside>
      )}
    </div>
  );
};

export default MapSidebar;
