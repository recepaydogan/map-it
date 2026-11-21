import { Bookmark, Map, PanelLeftClose } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import MapExplorePanel from "./map-explore-panel";
import MapLocationDetails from "./map-location-details";
import type { PersonalMarkerLayer } from "./map-personal-marker-filter";
import MapSavedPanel from "./map-saved-panel";
import MapSidebarToolPanel from "./map-sidebar-tool-panel";
import type {
  MapMetadata,
  MapPoint,
  UserMarkerGroup,
  UserMarkerStyleChange,
} from "./types";

/** Which side panel the workspace is showing. Add a mode per new tool panel. */
export type MapSidebarMode = "explore" | "saved";

interface MapSidebarProps {
  data: MapMetadata;
  selectedPoint: MapPoint | null;
  mode: MapSidebarMode;
  open: boolean;
  compact?: boolean;
  activeCategories: string[];
  categoryCounts: Record<string, number>;
  favoriteIds: string[];
  completedIds: string[];
  notes: Record<string, string>;
  markerGroupCounts: Partial<Record<UserMarkerGroup, number>>;
  hiddenMarkerGroups: UserMarkerGroup[];
  personalMarkerCounts: Record<PersonalMarkerLayer, number>;
  hiddenPersonalMarkerLayers: PersonalMarkerLayer[];
  savedPoints: MapPoint[];
  completedPoints: MapPoint[];
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: MapSidebarMode) => void;
  onToggleCategory: (categoryId: string) => void;
  onSetCategories: (categoryIds: string[]) => void;
  onSelectPoint: (point: MapPoint | null) => void;
  onToggleFavorite: (id: string) => void;
  onToggleCompleted: (id: string) => void;
  onSaveNote: (id: string, note: string) => void;
  onRenameMarker: (id: string, name: string) => void;
  onUpdateMarkerStyle: (id: string, change: UserMarkerStyleChange) => void;
  onUpdateMarkerGroup: (id: string, group: UserMarkerGroup) => void;
  onToggleMarkerGroup: (group: UserMarkerGroup) => void;
  onTogglePersonalMarkerLayer: (layer: PersonalMarkerLayer) => void;
  onRemoveMarker: (id: string) => void;
  onSaveCoordinate: (point: MapPoint) => void;
}

/**
 * The floating panel column on the map's left. Exactly one thing shows at a
 * time: a selected point's details, the Saved tool panel, or the Menu (map
 * layers). The workspace decides which through `open`, `mode` and
 * `selectedPoint`; this component only lays them out.
 */
const MapSidebar = ({
  data, selectedPoint, mode, open, compact = false,
  activeCategories, categoryCounts, favoriteIds, completedIds, notes,
  markerGroupCounts, hiddenMarkerGroups, personalMarkerCounts, hiddenPersonalMarkerLayers,
  savedPoints, completedPoints,
  onOpenChange, onModeChange, onToggleCategory, onSetCategories, onSelectPoint,
  onToggleFavorite, onToggleCompleted, onSaveNote, onRenameMarker, onUpdateMarkerStyle,
  onUpdateMarkerGroup, onToggleMarkerGroup, onTogglePersonalMarkerLayer, onRemoveMarker,
  onSaveCoordinate,
}: MapSidebarProps) => {
  const { t } = useTranslation();
  const detailsScrollRef = useRef<HTMLDivElement | null>(null);
  const selectedPointId = selectedPoint?.id;

  useLayoutEffect(() => {
    if (!selectedPointId) return;
    detailsScrollRef.current?.scrollTo({ top: 0 });
  }, [selectedPointId]);

  if (!open) return null;

  const showToolPanel = mode === "saved" && !selectedPoint;

  return (
    <div className="pointer-events-none absolute bottom-5 left-5 top-[4.75rem] z-40 flex items-start gap-3">
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
          data-map-selection-panel={selectedPoint ? "" : undefined}
          className={cn(
            "pointer-events-auto flex max-h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/90 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fade-in",
            compact ? "w-[17rem]" : "w-[19rem]",
          )}
        >
          {selectedPoint ? (
            <div ref={detailsScrollRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <MapLocationDetails
                point={selectedPoint}
                favorite={favoriteIds.includes(selectedPoint.id)}
                completed={completedIds.includes(selectedPoint.id)}
                note={notes[selectedPoint.id] ?? ""}
                onBack={() => onSelectPoint(null)}
                onToggleFavorite={() => onToggleFavorite(selectedPoint.id)}
                onToggleCompleted={() => onToggleCompleted(selectedPoint.id)}
                onSaveNote={(note) => onSaveNote(selectedPoint.id, note)}
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
                    markerGroupCounts={markerGroupCounts}
                    hiddenMarkerGroups={hiddenMarkerGroups}
                    personalMarkerCounts={personalMarkerCounts}
                    hiddenPersonalMarkerLayers={hiddenPersonalMarkerLayers}
                    compact={compact}
                    onToggleCategory={onToggleCategory}
                    onSetCategories={onSetCategories}
                    onToggleMarkerGroup={onToggleMarkerGroup}
                    onTogglePersonalMarkerLayer={onTogglePersonalMarkerLayer}
                  />
                </div>
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  );
};

export default MapSidebar;
