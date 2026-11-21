import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2, Crosshair, Info, Save, Skull, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GAME_OBSERVED_PORTAL_APPEARANCE, GAME_STRUCTURE_DISCOVERIES, GAME_STRUCTURE_HIGHLIGHTS,
  GAME_STRUCTURE_TYPES } from "../../game-config";
import { cn } from "../../lib/cn";
import type { BiomeCanvasState } from "../generation/biome-canvas";
import type { MapPointImageSource } from "../map/map-point-icon";
import type { StructurePoint, StructureViewportState } from "../generation/structure-viewport-stream";
import { createMapPointClusters, getClusterDispersalZoom } from "../map/map-clustering";
import { createInspectorController } from "../inspector/inspector-controller";
import InspectorViewport from "../inspector/inspector-viewport";
import { WorldDestinationMarkers, WorldDestinationSummary } from "./world-map-destinations";
import { projectPortalDestination } from "./world-portal-projection";
import type { WorldMapPlayer } from "./world-map-player";
import { defaultDimensionView, pointReference, type WorldPersonalState, type WorldPin, type WorldRecord } from "./world-types";
import WorldDeathPinDetails from "./world-death-pin-details";
import { visibleStructurePoints, type StructureFilterState } from "./world-structure-filter-state";
import WorldStructureFilterRail from "./world-structure-filter-rail";
import { structureIcon } from "./world-structure-icons";
import { savePointNote, togglePointState } from "./world-personal-actions";
import { createConnectedKnowledgeInspectorResolver } from "../knowledge/connected-knowledge-inspector-content";
import { knowledgeCatalogRevision, type KnowledgeCatalogs } from "../knowledge/knowledge-catalogs";
import { gameKnowledgeSubjectDisplay,
  gameKnowledgeSubjectHeroImage } from "../knowledge/game-knowledge-subject-display";
import WorldStructureMarker from "./world-structure-marker";
import WorldPinGroupFilter from "./world-pin-group-filter";
import { useWorldMapCameraTransform } from "./world-map-frame-context";
import { createStructureDiscoverySections } from "./world-structure-discovery-sections";
import WorldCoordinateCopy from "./world-coordinate-copy";
import { BIOME_DEFAULT_ZOOM } from "../generation/biome-viewport";
import { isStructureVisibleAtZoom } from "./world-structure-zoom";

const appearances = new Map<string, { id: string; icon: Parameters<typeof structureIcon>[0]; color: string;
  image?: MapPointImageSource; preview?: string; markerScale: number; iconScale: number }>(
  GAME_STRUCTURE_TYPES.map(type => [type.id, { ...type, image: type.artwork,
    markerScale: "markerScale" in type ? type.markerScale : 1,
    iconScale: "markerIconScale" in type ? type.markerIconScale : "iconScale" in type ? type.iconScale : 1 }]),
);
const labelKey = (type: string) => `structureMap.types.${type}`;

export type SaveWorldPersonal = (worldId: string, change: (personal: WorldPersonalState) => WorldPersonalState) => Promise<WorldPersonalState>;
export interface StructureActionPoint { id: string; type: string; x: number; y: number | null; z: number }
export const PointActions = ({ point, dimension, personal, onCenter, onChange }: { point: StructureActionPoint; dimension: string; personal: WorldPersonalState;
  onCenter: () => void; onChange: (change: (personal: WorldPersonalState) => WorldPersonalState) => Promise<void> }) => {
  const { t } = useTranslation(), reference = pointReference(dimension, point.id);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const found = personal.found.includes(reference), favorite = personal.favorites.includes(reference);
  const run = async (key: string, change: (personal: WorldPersonalState) => WorldPersonalState) => {
    if (pending) return; setPending(key); setError(false);
    try { await onChange(change); } catch { setError(true); } finally { setPending(null); }
  };
  return <div className="space-y-3">
    <WorldCoordinateCopy point={point} />
    <div className="grid grid-cols-3 gap-2">
      <button type="button" data-inspector-focus="found" disabled={!!pending} aria-pressed={found} onClick={() => { void run("found", state => togglePointState(state, "found", dimension, point.id)); }}
        className={cn("flex min-w-0 cursor-pointer items-center justify-center gap-1 rounded-[var(--radius-md)] border px-1.5 py-2 text-[11px] font-semibold disabled:cursor-wait", found ? "border-success/60 bg-success-soft text-success-text" : "border-border bg-white/5 text-zinc-200 hover:bg-white/10")}><CheckCircle2 size={13} className="shrink-0" aria-hidden="true" /><span className="truncate">{t("structureMap.actions.found")}</span></button>
      <button type="button" data-inspector-focus="favorite" disabled={!!pending} aria-pressed={favorite} onClick={() => { void run("favorite", state => togglePointState(state, "favorites", dimension, point.id)); }}
        className={cn("flex min-w-0 cursor-pointer items-center justify-center gap-1 rounded-[var(--radius-md)] border px-1.5 py-2 text-[11px] font-semibold disabled:cursor-wait", favorite ? "border-favorite/60 bg-favorite/15 text-favorite" : "border-border bg-white/5 text-zinc-200 hover:bg-white/10")}><Star size={13} className="shrink-0" fill={favorite ? "currentColor" : "none"} aria-hidden="true" /><span className="truncate">{t("structureMap.actions.favorite")}</span></button>
      <button type="button" data-inspector-focus="center" onClick={onCenter}
        title={t(point.y === null ? "structureMap.center" : "structureMap.centerOccurrence")}
        aria-label={t(point.y === null ? "structureMap.center" : "structureMap.centerOccurrence")}
        className="grid min-h-9 cursor-pointer place-items-center rounded-[var(--radius-md)] border border-border bg-white/5 text-zinc-200 hover:bg-white/10"><Crosshair size={15} aria-hidden="true" /></button>
    </div>
    {error && <p role="alert" className="text-xs text-danger-text">{t("structureMap.actions.saveFailed")}</p>}
  </div>;
};

export const PointNote = ({ point, dimension, personal, onChange }: { point: StructureActionPoint; dimension: string; personal: WorldPersonalState;
  onChange: (change: (personal: WorldPersonalState) => WorldPersonalState) => Promise<void> }) => {
  const { t } = useTranslation(), reference = pointReference(dimension, point.id);
  const [note, setNote] = useState(personal.notes[reference] ?? ""), [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const save = async () => {
    if (pending) return; setPending(true); setError(false);
    try { await onChange(state => savePointNote(state, dimension, point.id, note)); }
    catch { setError(true); } finally { setPending(false); }
  };
  return <div className="space-y-3">
    <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{t("structureMap.actions.note")}
      <textarea value={note} maxLength={10000} onChange={event => setNote(event.target.value)} placeholder={t("structureMap.actions.notePlaceholder")}
        className="mt-1.5 min-h-20 w-full resize-y rounded-[var(--radius-md)] border border-border bg-black/25 px-2.5 py-2 text-[13px] normal-case leading-5 tracking-normal text-zinc-100 placeholder:text-zinc-400 focus:border-accent focus:outline-none" />
    </label>
    <button type="button" data-inspector-focus="save-note" disabled={pending || note === (personal.notes[reference] ?? "")} onClick={() => { void save(); }}
      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border border-border bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-100 hover:bg-white/10 disabled:cursor-default disabled:opacity-50"><Save size={13} aria-hidden="true" />{t("structureMap.actions.saveNote")}</button>
    {error && <p role="alert" className="text-xs text-danger-text">{t("structureMap.actions.saveFailed")}</p>}
  </div>;
};

/** The seed source establishes candidate X/Z only, never actual terrain, loot or moving entities. */
const WorldStructureLayer = ({ world, dimension, view, state, filter, active, markersVisible = true, compact = false,
  compactInteractive = false, compactSelection = null, onCompactSelectionChange = () => {}, player,
  filterOpen, onFilterOpenChange, onFilterChange, savePersonal, onCenter, onCenterSelected, onDisperse, onDismiss, knowledgeCatalogs,
  selectedDeathPin, onDeathPinClose, personalMarkerOpen = false, onSelectStructure = () => {}, searchTypeIds = null,
  dismissDetailsRevision = 0,
  portalMarkerCount = 0 }: {
  world: WorldRecord; dimension: string; view: BiomeCanvasState | null; state: Readonly<StructureViewportState> | null;
  filter: StructureFilterState; active: boolean; markersVisible?: boolean; compact?: boolean; compactInteractive?: boolean;
  searchTypeIds?: readonly string[] | null;
  compactSelection?: StructurePoint | null; onCompactSelectionChange?: (point: StructurePoint | null) => void;
  selectedDeathPin: WorldPin | null; onDeathPinClose: () => void;
  dismissDetailsRevision?: number;
  personalMarkerOpen?: boolean; onSelectStructure?: (point: StructurePoint) => void;
  portalMarkerCount?: number;
  player: WorldMapPlayer | null;
  filterOpen: boolean; onFilterOpenChange: (open: boolean) => void;
  onFilterChange: (filter: StructureFilterState) => void; savePersonal: SaveWorldPersonal;
  onCenter: (x: number, z: number) => void; onCenterSelected: (x: number, z: number) => void;
  onDisperse: (x: number, z: number, zoom: number) => void; onDismiss: () => void;
  knowledgeCatalogs: KnowledgeCatalogs;
}) => {
  const { t, i18n } = useTranslation();
  const catalogRevision = knowledgeCatalogRevision(knowledgeCatalogs);
  const [controller] = useState(() => createInspectorController({ worldId: world.id, edition: world.edition,
    version: world.generation.version, dimension, catalogRevision }));
  const navigation = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [personalOverride, setPersonalOverride] = useState<{ source: WorldPersonalState; value: WorldPersonalState } | null>(null);
  const personal = personalOverride?.source === world.personal ? personalOverride.value : world.personal;
  const [selected, setSelected] = useState<StructurePoint | null>(null);
  const [portalSourceId, setPortalSourceId] = useState<string | null>(null);
  const markerStage = useWorldMapCameraTransform(view, active && markersVisible);
  useEffect(() => {
    controller.setContext({ worldId: world.id, edition: world.edition, version: world.generation.version, dimension, catalogRevision });
  }, [controller, world.id, world.edition, world.generation.version, dimension, catalogRevision]);
  useEffect(() => {
    if (!selectedDeathPin || compact) return;
    controller.open({ kind: "poi", id: selectedDeathPin.id });
  }, [compact, controller, selectedDeathPin]);
  const selectedId = compact ? compactSelection?.id ?? null : navigation.entries[0]?.subject.id ?? null;
  useEffect(() => {
    if (filterOpen && navigation.entries.length) controller.close();
  }, [controller, filterOpen, navigation.entries.length]);
  useEffect(() => {
    if (personalMarkerOpen && navigation.entries.length) controller.close();
  }, [controller, navigation.entries.length, personalMarkerOpen]);
  useEffect(() => {
    if (dismissDetailsRevision) controller.close();
  }, [controller, dismissDetailsRevision]);
  const points = state?.points;
  const filteredPredictedPoints = useMemo(() => visibleStructurePoints(points ?? [], dimension, personal, filter, searchTypeIds),
  [points, filter, personal, dimension, searchTypeIds]);
  const visibilityZoom = view?.zoom ?? BIOME_DEFAULT_ZOOM;
  const visiblePoints = useMemo(() => filteredPredictedPoints.filter(point => isStructureVisibleAtZoom(point.type, visibilityZoom)),
    [filteredPredictedPoints, visibilityZoom]);
  const hasZoomHiddenMarkers = markersVisible
    ? visiblePoints.length < filteredPredictedPoints.length : filteredPredictedPoints.length > 0;
  const displayPoints = visiblePoints;
  const displayPointsById = useMemo(() => new Map(displayPoints.map(point => [point.id, point])), [displayPoints]);
  const visibleSelected = selected && (searchTypeIds === null || searchTypeIds.includes(selected.type)) ? selected : null;
  const portalProjection = useMemo(() => {
    const source = personal.tracked.find(item => item.id === portalSourceId);
    return source ? projectPortalDestination(world, source, dimension) : null;
  }, [world, personal.tracked, dimension, portalSourceId]);
  const markerZoom = view?.zoom;
  const clusters = useMemo(() => {
    if (markerZoom === undefined) return [];
    // Cluster in world space once, then translate with the camera. Structure
    // markers must not orbit their true coordinates to avoid visual overlaps.
    const projected = visiblePoints.map(point => ({ left: point.x * markerZoom,
      top: point.z * markerZoom,
      point: { id: point.id, category: point.type, x: point.x, y: point.z, name: "", label: "", subtype: "", region: "", regionId: dimension } }));
    return createMapPointClusters(projected, selectedId, markerZoom, false);
  }, [visiblePoints, markerZoom, selectedId, dimension]);
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const knowledgeResolver = useMemo(() => createConnectedKnowledgeInspectorResolver(knowledgeCatalogs,
    gameKnowledgeSubjectDisplay, t, locale, world.edition, world.generation.version),
  [knowledgeCatalogs, t, locale,
    world.edition, world.generation.version]);
  const open = (id: string) => {
    const point = points?.find(item => item.id === id);
    if (point) { onSelectStructure(point); onDeathPinClose(); onFilterOpenChange(false); setSelected(point); controller.open({ kind: "poi", id }); }
  };
  const toggleCompact = (id: string) => {
    const point = points?.find(item => item.id === id);
    if (point) onCompactSelectionChange(compactSelection?.id === id ? null : point);
  };
  const changePersonal = async (change: (personal: WorldPersonalState) => WorldPersonalState) => {
    try { setPersonalOverride({ source: world.personal, value: await savePersonal(world.id, change) }); }
    catch (error) { console.error("World structure personal action failed", error); throw error; }
  };
  const activation = useRef<(id: string, x: number, z: number, zoom: number | null) => void>(() => {});
  useLayoutEffect(() => {
    activation.current = (id, x, z, zoom) => {
      if (zoom !== null) onDisperse(x, z, zoom);
      else if (compact) toggleCompact(id);
      else open(id);
    };
  });
  const activateMarker = useCallback((id: string, x: number, z: number, zoom: number | null) => {
    activation.current(id, x, z, zoom);
  }, []);
  const marker = (point: { id: string; type: string }, left: number, top: number, count = 1,
    targetX = 0, targetZ = 0, targetZoom: number | null = null) => {
    const appearance = appearances.get(point.type);
    if (!appearance || !view || !isStructureVisibleAtZoom(point.type, visibilityZoom)) return null;
    const candidate = displayPointsById.get(point.id);
    return <WorldStructureMarker key={point.id} id={point.id} type={point.type} left={left} top={top}
      width={view.width} count={count} x={candidate?.x} z={candidate?.z} selected={selectedId === point.id}
      interactive={!compact || compactInteractive} appearance={appearance} onActivate={activateMarker}
      targetX={targetX} targetZ={targetZ} targetZoom={targetZoom} />;
  };
  if (!active) return null;
  const zoomNotice = hasZoomHiddenMarkers && <div role="status" data-structure-zoom-notice
    className={cn("pointer-events-none absolute right-3 z-10 flex w-52 max-w-[calc(100%-1.5rem)] items-start gap-2 rounded-[var(--radius-md)] border border-border bg-[var(--panel-bg)] px-3 py-2 text-[11px] leading-4 text-zinc-200 shadow-[var(--panel-shadow)]",
      compactInteractive ? "top-3" : "top-[6.5rem] @[720px]:top-14")}>
    <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
    <span>{t("structureMap.zoomFiltered")}</span>
  </div>;
  if (compact) {
    if (!view) return null;
    if (!markersVisible) return zoomNotice;
    const selectedX = compactSelection ? view.width / 2 + (compactSelection.x - view.x) * view.zoom : null;
    const selectedY = compactSelection ? view.height / 2 + (compactSelection.z - view.z) * view.zoom : null;
    return <>
      {zoomNotice}
      <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-label={t("structureMap.markers")}>
      <div ref={markerStage} data-structure-marker-stage className="absolute inset-0 origin-top-left will-change-transform">
      {clusters.map(cluster => {
      const item = cluster.items.length === 1 ? displayPointsById.get(cluster.items[0].point.id) : null;
      return marker({ id: item?.id ?? cluster.key, type: cluster.categoryKey }, view.width / 2 + (cluster.x - view.x) * view.zoom,
        view.height / 2 + (cluster.y - view.z) * view.zoom, cluster.items.length, cluster.x, cluster.y, item ? null : getClusterDispersalZoom(cluster.items, false));
      })}
      {compactSelection && selectedX !== null && selectedY !== null && marker(compactSelection, selectedX, selectedY)}
      </div>
      </div>
    </>;
  }
  // A selected map subject owns the panel area. Keeping the filter beside it on
  // wide windows made marker details compete with a second full-height panel.
  // Closing the inspector restores the filter in its previous expanded state.
  const detailsOpen = !!selectedId, showFilter = filterOpen && !detailsOpen && !personalMarkerOpen;
  const panelLeft = showFilter ? 316 : 0;
  const occupiedLeft = 12 + (showFilter ? 304 : 0) + (detailsOpen ? 360 : 0);
  const destinationArea = view ? {
    left: Math.min(view.width - 20, Math.max(20, occupiedLeft + 18)), top: Math.min(112, Math.max(20, view.height / 2 - 20)),
    right: Math.max(20, view.width - 20), bottom: Math.max(Math.min(112, Math.max(20, view.height / 2 - 20)), view.height - 96),
  } : { left: 0, top: 0, right: 0, bottom: 0 };
  const hiddenPinGroups = personal.views[dimension]?.hiddenPinGroups ?? [];
  const pinGroupCounts = personal.pins.filter(pin => pin.dimension === dimension).reduce<Record<string, number>>((counts, pin) => {
    counts[pin.group] = (counts[pin.group] ?? 0) + 1; return counts;
  }, {});
  if (portalMarkerCount) pinGroupCounts[GAME_OBSERVED_PORTAL_APPEARANCE.group] =
    (pinGroupCounts[GAME_OBSERVED_PORTAL_APPEARANCE.group] ?? 0) + portalMarkerCount;
  const allPinGroupIds = Object.keys(pinGroupCounts);
  const setHiddenPinGroups = (hiddenPinGroups: string[]) => {
    void changePersonal(current => {
      const view = current.views[dimension] ?? defaultDimensionView();
      return { ...current, views: { ...current.views, [dimension]: { ...view, hiddenPinGroups } } };
    });
  };
  return <>
    {zoomNotice}
    {markersVisible && <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-label={t("structureMap.markers")}>
      <div ref={markerStage} data-structure-marker-stage className="absolute inset-0 origin-top-left will-change-transform">
      {view && clusters.map(cluster => {
        const item = cluster.items.length === 1 ? displayPointsById.get(cluster.items[0].point.id) : null;
        return marker({ id: item?.id ?? cluster.key, type: cluster.categoryKey }, view.width / 2 + (cluster.x - view.x) * view.zoom,
          view.height / 2 + (cluster.y - view.z) * view.zoom, cluster.items.length, cluster.x, cluster.y, item ? null : getClusterDispersalZoom(cluster.items, false));
      })}
      {visibleSelected && visibleSelected.id === selectedId && view && marker(visibleSelected, view.width / 2 + (visibleSelected.x - view.x) * view.zoom, view.height / 2 + (visibleSelected.z - view.z) * view.zoom)}
      </div>
    </div>}
    <WorldDestinationMarkers destinations={personal.tracked} dimension={dimension} view={view} player={player}
      area={destinationArea} portalProjection={portalProjection} onCenter={onCenter} />
    <div className="pointer-events-none absolute inset-x-3 bottom-3 top-[3.75rem] z-[60]">
      {showFilter && <WorldStructureFilterRail filter={filter} state={state} onClose={() => onFilterOpenChange(false)} onChange={onFilterChange}
        onOnlyStructure={() => setHiddenPinGroups(allPinGroupIds)}
        onSetAllStructureVisibility={visible => setHiddenPinGroups(visible ? [] : allPinGroupIds)} beforeGroups={<div>
          <WorldPinGroupFilter hidden={hiddenPinGroups} counts={pinGroupCounts} query={filter.search}
            expanded={filter.expandedGroup === "personal-markers"}
            onExpandedChange={expanded => onFilterChange({ ...filter, expandedGroup: expanded ? "personal-markers" : null })}
            onSetHidden={setHiddenPinGroups}
            onOnly={group => {
              onFilterChange({ ...filter, visibleCategories: [] });
              setHiddenPinGroups(group ? allPinGroupIds.filter(id => id !== group) : []);
            }} />
          <WorldDestinationSummary world={world} destinations={personal.tracked} dimension={dimension} player={player}
            portalProjection={portalProjection} onSelectPortalSource={setPortalSourceId} onClearPortalProjection={() => setPortalSourceId(null)}
            onCenter={onCenter} onChange={changePersonal} />
        </div>} />}
      <div className="absolute inset-y-0 right-0" style={{ left: panelLeft }}>
      <InspectorViewport controller={controller} baseLabel={t("structureMap.filters.title")} onDismiss={onDismiss} resolve={subject => {
        if (selectedDeathPin && subject.kind === "poi" && subject.id === selectedDeathPin.id) return {
          name: selectedDeathPin.name, category: t("journeyHistory.died"), fallbackIcon: Skull,
          contextLabel: `${world.name} · ${world.generation.version}`,
          body: <WorldDeathPinDetails key={selectedDeathPin.id} pin={selectedDeathPin}
            onCenter={() => onCenterSelected(selectedDeathPin.x, selectedDeathPin.z)} />,
        };
        if (!selected || subject.kind !== "poi" || subject.id !== selected.id) {
          const resolved = knowledgeResolver(subject), heroImage = gameKnowledgeSubjectHeroImage(subject.kind, subject.id);
          return resolved && heroImage ? { ...resolved, heroImage } : resolved;
        }
        const discoveries = GAME_STRUCTURE_DISCOVERIES[selected.type as keyof typeof GAME_STRUCTURE_DISCOVERIES];
        const highlights = GAME_STRUCTURE_HIGHLIGHTS[selected.type];
        const approach = t(`inspector.structureGuide.tips.${selected.type}`, { defaultValue: "" });
        return { name: t(labelKey(selected.type)), category: t("structureMap.candidate"), image: appearances.get(selected.type)?.image,
          heroImage: appearances.get(selected.type)?.preview,
          contextLabel: `${world.name} · ${world.generation.version}`, description: t(`structureMap.descriptions.${selected.type}`),
          summarySections: createStructureDiscoverySections(discoveries, gameKnowledgeSubjectDisplay, {
            mobs: t("inspector.subjectKinds.entity"), loot: t("inspector.subjectKinds.loot"),
          }, { edition: world.edition, version: world.generation.version }),
          pillSections: highlights ? [{ key: "structure:highlights", title: t(highlights.titleKey),
            values: highlights.valueKeys.map(key => t(key)) }] : undefined,
          body: <div>
            <PointActions key={selected.id} point={selected} dimension={dimension} personal={personal}
              onCenter={() => onCenterSelected(selected.x, selected.z)} onChange={changePersonal} />
            {approach && <section className="mt-3 border-t border-border/70 pt-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{t("inspector.structureGuide.approach")}</h3>
              <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-zinc-300">{approach}</p>
            </section>}
          </div>,
          footer: <PointNote key={selected.id} point={selected} dimension={dimension} personal={personal} onChange={changePersonal} /> };
      }} /></div>
    </div>
  </>;
};
export default WorldStructureLayer;
