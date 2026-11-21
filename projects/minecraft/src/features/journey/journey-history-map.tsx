import { LocateFixed, Minus, Plus, RotateCcw, Skull } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { GAME_BIOME_COLORS, GAME_BIOME_PREVIEWS, GAME_MAP_DIMENSIONS, GAME_OBSERVED_PORTAL_APPEARANCE,
  GAME_PORTAL_PROJECTIONS, GAME_WORLD_MAP_PREVIEWS } from "../../game-config";
import { createBiomeCanvas, type BiomeCanvasState } from "../generation/biome-canvas";
import { createBrowserBiomePool } from "../generation/create-browser-biome-pool";
import { createBiomeTileSource } from "../generation/biome-tile-source";
import { createUniformBiomeTileSource } from "../generation/create-uniform-biome-source";
import { resolveBiomePreview, resolveDimensionBiomePreview } from "../generation/resolve-biome-preview";
import type { WorldRecord } from "../worlds/world-types";
import { projectWorldPoint } from "../worlds/world-polyline-projection";
import type { JourneyDimensionTransition } from "./journey-dimension-transitions";
import JourneyMarkerDetails, { type JourneyMarkerSelection } from "./journey-marker-details";
import { mergeObservedPortals, observedJourneyPortals } from "./journey-observed-portals";
import JourneyPortalMarkers from "./journey-portal-markers";
import { projectJourney } from "./journey-projection";
import { correctedJourneyRoute, correctedJourneyRouteForPortals } from "./journey-route-cleanup";
import type { WorldJourney } from "./journey-state";
import JourneyTransitionMarkers from "./journey-transition-markers";

const routeCamera = (journey: WorldJourney, dimension: string) => {
  const points = journey.segments.filter(segment => segment.dimension === dimension).flatMap(segment => segment.points);
  if (!points.length) return { x: 0, z: 0, zoom: 0.25 };
  const xs = points.map(point => point.x), zs = points.map(point => point.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2,
    zoom: Math.max(1 / 64, Math.min(8, 760 / Math.max(96, maxX - minX), 460 / Math.max(96, maxZ - minZ))) };
};

const JourneyHistoryMap = ({ world, journey, dimension, focusTarget, onFollowTransition }: {
  world: WorldRecord; journey: WorldJourney; dimension: string;
  focusTarget: { dimension: string; x: number; z: number } | null;
  onFollowTransition: (target: JourneyDimensionTransition["to"]) => void;
}) => {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ReturnType<typeof createBiomeCanvas> | null>(null);
  const [state, setState] = useState<BiomeCanvasState | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<JourneyMarkerSelection | null>(null);
  const portalRules = useMemo(() => GAME_PORTAL_PROJECTIONS.filter(rule => rule.edition === world.edition
    && rule.versions.some(version => version === world.generation.version)), [world.edition, world.generation.version]);
  const portalLinks = useMemo(() => {
    const observed = observedJourneyPortals([journey], portalRules,
      GAME_OBSERVED_PORTAL_APPEARANCE.maxTransitionGapMs, GAME_OBSERVED_PORTAL_APPEARANCE.maxTargetOffset,
      GAME_OBSERVED_PORTAL_APPEARANCE.mergeDistance);
    return mergeObservedPortals([], observed, GAME_OBSERVED_PORTAL_APPEARANCE.mergeDistance,
      world.personal.removedPortals ?? []);
  }, [journey, portalRules, world.personal.removedPortals]);
  const [failed, setFailed] = useState(false);
  const displayJourney = useMemo(() => correctedJourneyRouteForPortals(correctedJourneyRoute(journey,
    GAME_OBSERVED_PORTAL_APPEARANCE.maxTransitionGapMs), portalLinks,
  GAME_OBSERVED_PORTAL_APPEARANCE.maxTransitionGapMs), [journey, portalLinks]);
  const route = useMemo(() => routeCamera(displayJourney, dimension), [displayJourney, dimension]);
  const [initial] = useState(() => {
    return focusTarget?.dimension === dimension
      ? { x: focusTarget.x, z: focusTarget.z, zoom: Math.min(2, Math.max(1, route.zoom)) } : route;
  });
  const dimensionConfig = GAME_MAP_DIMENSIONS.find(item => item.id === dimension) ?? GAME_MAP_DIMENSIONS[0];
  const preview = useMemo(() => resolveBiomePreview(world, GAME_WORLD_MAP_PREVIEWS), [world]);
  const dimensionPreview = useMemo(() => preview
    ? resolveDimensionBiomePreview(world, preview, dimensionConfig.code, GAME_BIOME_PREVIEWS) : null,
  [dimensionConfig.code, preview, world]);

  useEffect(() => {
    if (!canvas.current || !dimensionPreview) return;
    const abort = new AbortController();
    const { config, profile, uniformBiomeId } = dimensionPreview;
    const source = config.kind === "uniform" ? createUniformBiomeTileSource(uniformBiomeId!)
      : createBiomeTileSource(createBrowserBiomePool());
    let view: ReturnType<typeof createBiomeCanvas> | null = null;
    setState(null); setFailed(false);
    void (async () => {
      try {
        let bytes: Uint8Array, artifactConfig: { sha256: string; profiles: readonly string[] };
        if (config.kind === "seeded") {
          const response = await fetch(`${import.meta.env.BASE_URL}${config.url}`, { signal: abort.signal });
          if (!response.ok) throw new Error(`Biome artifact load failed: ${response.status}`);
          bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length !== config.bytes) throw new Error("Biome artifact size mismatch");
          artifactConfig = { sha256: config.sha256, profiles: config.profiles };
        } else {
          bytes = new Uint8Array([uniformBiomeId!]);
          artifactConfig = { sha256: "0".repeat(64), profiles: [profile] };
        }
        if (abort.signal.aborted || !canvas.current) return;
        const scope = source.select({ worldId: world.id, edition: world.edition, version: profile,
          seed: world.generation.seed, dimension: dimensionConfig.code, artifact: { bytes, config: artifactConfig } });
        if (!scope) throw new Error("Biome scope is unavailable");
        view = createBiomeCanvas(canvas.current, source, scope, GAME_BIOME_COLORS, (next, painting) => {
          if (painting) flushSync(() => setState(next));
          else setState(next);
        }, initial);
        renderer.current = view;
      } catch (error) {
        if (!abort.signal.aborted) { console.error("Journey history biome map failed", error); setFailed(true); }
      }
    })();
    return () => { abort.abort(); view?.dispose(); source.dispose(); if (renderer.current === view) renderer.current = null; };
  }, [dimensionConfig.code, dimensionPreview, initial, world.edition, world.generation.seed, world.id]);

  const projected = useMemo(() => projectJourney(displayJourney, dimension, state), [displayJourney, dimension, state]);
  const startPoint = !displayJourney.truncated && displayJourney.segments[0]?.dimension === dimension
    ? displayJourney.segments[0].points[0] : null;
  const projectedStart = startPoint ? projectWorldPoint(startPoint, state) : null;
  const endedHere = displayJourney.endedAt !== null && displayJourney.segments.at(-1)?.dimension === dimension;
  const diedHere = displayJourney.endReason === "death" && endedHere;
  const fitRoute = () => {
    if (!state) return;
    renderer.current?.center(route.x, route.z);
    renderer.current?.zoom(route.zoom / state.zoom);
  };
  if (!dimensionPreview) return <div className="grid h-full place-items-center bg-map-surface px-8 text-center text-sm text-zinc-300">{t("journeyHistory.mapUnavailable")}</div>;
  return <div className="relative h-full min-h-0 overflow-hidden bg-map-surface">
    <canvas ref={canvas} tabIndex={0} role="application" aria-label={t("journeyHistory.mapCanvas")}
      onPointerDown={() => setSelectedMarker(null)}
      className="absolute inset-0 h-full w-full cursor-grab touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing" />
    {state && <svg className="pointer-events-none absolute inset-0 z-[2] h-full w-full" viewBox={`0 0 ${state.width} ${state.height}`} aria-hidden="true">
      {projected.paths.map((path, index) => <g key={index}>
        <polyline points={path.map(point => point.join(",")).join(" ")} fill="none" stroke="rgba(10,12,10,.82)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={path.map(point => point.join(",")).join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>)}
      {projected.directionArrows.map((arrow, index) => <path key={index} data-journey-direction
        transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`}
        d="M 7 0 L -5 -5 L -2 0 L -5 5 Z" fill="white" stroke="rgba(10,12,10,.9)"
        strokeWidth="1.4" strokeLinejoin="round" />)}
    </svg>}
    {projectedStart && startPoint && <button type="button" data-journey-start
      aria-label={t("journeyHistory.start")}
      aria-pressed={selectedMarker?.kind === "start"}
      onClick={() => setSelectedMarker({ kind: "start", point: startPoint })}
      style={{ left: projectedStart.x, top: projectedStart.y }}
      className="absolute z-[12] grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      <span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 rounded-[var(--radius-md)] border border-border bg-surface/95 px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-white shadow-[var(--panel-shadow)]">{t("journeyHistory.start")}</span>
      <span className="h-3 w-3 rounded-full border-[3px] border-accent bg-map-surface shadow-[0_0_0_2px_white]" aria-hidden="true" />
    </button>}
    {endedHere && projected.endpoint && <button type="button" data-journey-finish
      aria-label={t("journeyHistory.end")}
      aria-pressed={selectedMarker?.kind === (diedHere ? "death" : "finish")}
      onClick={() => setSelectedMarker({ kind: diedHere ? "death" : "finish", point: displayJourney.segments.at(-1)!.points.at(-1)! })}
      style={{ left: projected.endpoint.x, top: projected.endpoint.y }}
      className="absolute z-[12] grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      <span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 rounded-[var(--radius-md)] border border-border bg-surface/95 px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-white shadow-[var(--panel-shadow)]">{t("journeyHistory.end")}</span>
      {diedHere ? <span className="grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-danger text-white"><Skull size={12} aria-hidden="true" /></span>
        : <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-accent" aria-hidden="true" />}
    </button>}
    <JourneyTransitionMarkers journey={displayJourney} dimension={dimension} view={state}
      selectedIndex={selectedMarker?.kind === "transition" ? selectedMarker.transition.index : null}
      onSelect={(transition, side) => setSelectedMarker({ kind: "transition", transition, side })}
      excludedPairs={portalRules} />
    <JourneyPortalMarkers links={portalLinks} dimension={dimension} view={state}
      selectedId={selectedMarker?.kind === "portal" ? selectedMarker.portal.id : null}
      onSelect={portal => setSelectedMarker({ kind: "portal", portal })} />
    {selectedMarker && <JourneyMarkerDetails key={selectedMarker.kind === "portal" ? selectedMarker.portal.id
      : selectedMarker.kind === "transition" ? `transition:${selectedMarker.transition.index}:${selectedMarker.side}` : selectedMarker.kind}
      selection={selectedMarker} dimension={dimension}
      onClose={() => setSelectedMarker(null)} onFollow={target => {
        setSelectedMarker(null);
        if (target.dimension === dimension) renderer.current?.center(target.point.x, target.point.z);
        else onFollowTransition(target);
      }} />}
    {!state && !failed && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-map-surface/70 text-xs text-zinc-300">{t("journeyHistory.loadingMap")}</div>}
    {failed && <div role="alert" className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-[var(--radius-md)] border border-danger/40 bg-surface/95 px-3 py-2 text-xs text-danger-text">
      <RotateCcw size={14} />{t("journeyHistory.mapFailed")}</div>}
    <div className="absolute bottom-4 right-4 z-10 flex overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface/95 shadow-[var(--panel-shadow)]">
      <button type="button" onClick={() => renderer.current?.zoom(.5)} aria-label={t("biomeMap.zoomOut")} className="grid h-9 w-9 cursor-pointer place-items-center text-zinc-100 hover:bg-white/10"><Minus size={15} /></button>
      <button type="button" onClick={fitRoute} aria-label={t("journeyHistory.fitRoute")} className="grid h-9 w-9 cursor-pointer place-items-center border-x border-border text-accent hover:bg-white/10"><LocateFixed size={15} /></button>
      <button type="button" onClick={() => renderer.current?.zoom(2)} aria-label={t("biomeMap.zoomIn")} className="grid h-9 w-9 cursor-pointer place-items-center text-zinc-100 hover:bg-white/10"><Plus size={15} /></button>
    </div>
  </div>;
};

export default JourneyHistoryMap;
