import { ArrowUp, Crosshair, DoorOpen, MapPin, Navigation, Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_MAP_DIMENSIONS, GAME_PORTAL_PLAN_APPEARANCE } from "../../game-config";
import { cn } from "../../lib/cn";
import Tooltip from "../../components/tooltip";
import { createRuntimeId } from "../../lib/runtime-id";
import type { BiomeCanvasState } from "../generation/biome-canvas";
import type { WorldMapPlayer } from "./world-map-player";
import { horizontalDestinationDistance, projectTrackedDestination,
  spreadDestinationEdges, type DestinationSafeArea } from "./world-map-destination";
import { createPortalPlanRecords, portalProjectionDestination, projectPortalDestination,
  samePortalPlan, type PortalProjection } from "./world-portal-projection";
import type { TrackedDestination, WorldPersonalState, WorldRecord } from "./world-types";
import { putWorldPin, removeWorldPin, TRACKED_DESTINATION_LIMIT, setTrackedDestination } from "./world-personal-actions";
import { useWorldMapFrameView } from "./world-map-frame-context";

type ChangePersonal = (change: (personal: WorldPersonalState) => WorldPersonalState) => Promise<void>;

const dimensionKey = (id: string) => GAME_MAP_DIMENSIONS.find(item => item.id === id)?.labelKey;
const conciseCoordinate = (value: number) => Number.isInteger(value) ? value : Number(value.toFixed(3));

const distanceLabel = (distance: number | null, t: ReturnType<typeof useTranslation>["t"]) =>
  distance === null ? "" : t("structureMap.destinations.distance", { count: Math.round(distance) });

export const WorldDestinationMarkers = ({ destinations, dimension, view: settledView, player, area, portalProjection, onCenter }: {
  destinations: readonly TrackedDestination[];
  dimension: string;
  view: BiomeCanvasState | null;
  player: WorldMapPlayer | null;
  area: DestinationSafeArea;
  portalProjection: PortalProjection | null;
  onCenter: (x: number, z: number) => void;
}) => {
  const { t } = useTranslation();
  const view = useWorldMapFrameView(settledView);
  const ghost = useMemo(() => portalProjection
    ? portalProjectionDestination(portalProjection, portalProjection.source.label) : null, [portalProjection]);
  const projected = useMemo(() => spreadDestinationEdges([
    ...destinations.slice(0, TRACKED_DESTINATION_LIMIT), ...(ghost ? [ghost] : []),
  ].map(destination => projectTrackedDestination(destination, dimension, view, area))
    .filter(item => item !== null), area), [destinations, dimension, view, area, ghost]);
  return <div className="pointer-events-none absolute inset-0 z-[8] overflow-hidden" aria-label={t("structureMap.destinations.mapLayer")}>
    {projected.map(item => {
      const isGhost = item.destination.id === ghost?.id, isPortalPlan = item.destination.kind === "portal-plan";
      const isPlayerPin = item.destination.kind === "player-pin";
      const distance = horizontalDestinationDistance(item.destination, player);
      const coordinates = t("structureMap.destinations.coordinates", { x: conciseCoordinate(item.destination.x), z: conciseCoordinate(item.destination.z) });
      const label = isGhost ? t("structureMap.portalPlan.ghostMarker", { name: item.destination.label, coordinates })
        : t(isPortalPlan ? "structureMap.portalPlan.savedMarker" : item.kind === "edge" ? "structureMap.destinations.edgeMarker" : "structureMap.destinations.mapMarker", {
          name: item.destination.label, coordinates, distance: distanceLabel(distance, t),
        });
      const color = isGhost || isPortalPlan ? GAME_PORTAL_PLAN_APPEARANCE.color : undefined;
      return <Tooltip key={item.destination.id} label={item.destination.label} side={item.y < 64 ? "bottom" : "top"}
        align={item.x < 160 ? "start" : item.x > (view?.width ?? 0) - 160 ? "end" : "center"}
        className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2" style={{ left: item.x, top: item.y }}>
        <button type="button" data-world-map-pan-target data-map-destination={isGhost ? undefined : item.destination.id}
        data-portal-ghost={isGhost || undefined} data-destination-kind={isGhost ? "portal-ghost" : item.kind}
        data-destination-type={isPortalPlan ? "portal-plan" : isPlayerPin ? "player-pin" : "destination"}
        aria-label={label} onClick={() => onCenter(item.destination.x, item.destination.z)}
        className={cn("grid cursor-pointer place-items-center rounded-[var(--radius-full)] border-2 bg-[var(--panel-bg)] shadow-[var(--panel-shadow)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          item.kind === "edge" ? "h-9 w-9" : "h-10 w-10 ring-2 ring-offset-2 ring-offset-map-surface",
          isGhost ? "border-dashed text-favorite ring-favorite/35" : isPortalPlan ? "border-dashed text-favorite ring-favorite/20"
            : isPlayerPin ? "border-success text-success ring-success/30" : "border-accent text-accent ring-accent/30")}
        style={{ borderColor: color }}>
        {item.kind === "edge"
          ? <ArrowUp size={18} aria-hidden="true" style={{ transform: `rotate(${item.angle}deg)` }} />
          : isGhost || isPortalPlan ? <DoorOpen size={18} aria-hidden="true" />
            : isPlayerPin ? <MapPin size={18} fill="currentColor" aria-hidden="true" />
            : <Navigation size={18} fill="currentColor" aria-hidden="true" />}
      </button></Tooltip>;
    })}
  </div>;
};

export const WorldDestinationSummary = ({ world, destinations, dimension, player, portalProjection,
  onSelectPortalSource, onClearPortalProjection, onCenter, onChange }: {
  world: Pick<WorldRecord, "edition" | "generation">;
  destinations: readonly TrackedDestination[];
  dimension: string;
  player: WorldMapPlayer | null;
  portalProjection: PortalProjection | null;
  onSelectPortalSource: (id: string) => void;
  onClearPortalProjection: () => void;
  onCenter: (x: number, z: number) => void;
  onChange: ChangePersonal;
}) => {
  const { t } = useTranslation();
  const [pending, setPending] = useState<string | null>(null), [error, setError] = useState(false);
  if (!destinations.length) return null;
  const remove = async (destination: TrackedDestination) => {
    if (pending) return;
    setPending(destination.id); setError(false);
    try { await onChange(state => (destination.kind === "portal-plan" || destination.kind === "player-pin") && destination.pointId
      ? removeWorldPin(state, destination.pointId) : setTrackedDestination(state, destination, false)); }
    catch (reason) { console.error("Tracked destination removal failed", reason); setError(true); }
    finally { setPending(null); }
  };
  const saved = portalProjection ? destinations.some(destination => samePortalPlan(destination, portalProjection)) : false;
  const savePortalPlan = async () => {
    if (!portalProjection || pending || saved) return;
    setPending("portal-plan"); setError(false);
    try {
      const label = t("structureMap.portalPlan.savedName", { name: portalProjection.source.label });
      const records = createPortalPlanRecords(portalProjection, `portal-plan-${createRuntimeId()}`, label);
      await onChange(state => setTrackedDestination(putWorldPin(state, records.pin), records.destination, true));
      onClearPortalProjection();
    } catch (reason) { console.error("Portal plan save failed", reason); setError(true); }
    finally { setPending(null); }
  };
  const sourceKey = portalProjection && dimensionKey(portalProjection.sourceDimension);
  const targetKey = portalProjection && dimensionKey(portalProjection.targetDimension);
  return <section data-destination-summary className="border-b border-border/60 pb-2" aria-label={t("structureMap.destinations.title")}>
    <div className="flex items-center gap-2 py-2">
      <Navigation size={15} className="text-accent" aria-hidden="true" />
      <h3 className="min-w-0 flex-1 text-[13px] font-semibold text-zinc-100">{t("structureMap.destinations.title")}</h3>
      <span className="rounded-[var(--radius-full)] bg-accent-soft px-2 py-0.5 text-[10px] font-semibold tabular-nums text-accent">
        {destinations.length} / {TRACKED_DESTINATION_LIMIT}
      </span>
    </div>
    <div className="flex flex-col gap-1">
      {destinations.slice(0, TRACKED_DESTINATION_LIMIT).map(destination => {
        const current = destination.dimension === dimension;
        const projection = current ? null : projectPortalDestination(world, destination, dimension);
        const key = dimensionKey(destination.dimension);
        const distance = horizontalDestinationDistance(destination, player);
        const actionLabel = current ? t("structureMap.destinations.center", { name: destination.label })
          : projection ? t("structureMap.portalPlan.preview", { name: destination.label, dimension: key ? t(key) : destination.dimension })
            : t("structureMap.destinations.otherDimension", { name: destination.label, dimension: key ? t(key) : destination.dimension });
        return <div key={destination.id} className="group/destination flex items-center gap-2 rounded-[var(--radius-sm)] border border-border/60 bg-black/20 px-2 py-1.5">
          <button type="button" disabled={!current && !projection}
            onClick={() => current ? onCenter(destination.x, destination.z) : onSelectPortalSource(destination.id)}
            aria-label={actionLabel} title={actionLabel}
            className={cn("grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-full)] border hover:bg-accent/25 disabled:cursor-not-allowed disabled:border-border disabled:bg-white/5 disabled:text-zinc-300",
              projection ? "border-favorite/60 bg-favorite/10 text-favorite" : "border-accent/60 bg-accent-soft text-accent")}>
            {projection ? <DoorOpen size={14} aria-hidden="true" /> : <Crosshair size={14} aria-hidden="true" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-zinc-100">{destination.label}</p>
            <p className="truncate text-[10px] tabular-nums text-zinc-300">
              {t("structureMap.destinations.row", { dimension: key ? t(key) : destination.dimension, x: destination.x, z: destination.z,
                distance: distanceLabel(distance, t) })}
            </p>
          </div>
          <button type="button" disabled={!!pending} onClick={() => { void remove(destination); }}
            aria-label={t("structureMap.destinations.remove", { name: destination.label })} title={t("structureMap.destinations.remove", { name: destination.label })}
            className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-300 hover:bg-white/8 hover:text-white disabled:cursor-wait disabled:text-zinc-300">
            <X size={14} aria-hidden="true" />
          </button>
        </div>;
      })}
    </div>
    {portalProjection && <div data-portal-projection className="mt-2 rounded-[var(--radius-md)] border border-favorite/45 bg-favorite/8 p-2.5">
      <div className="flex items-start gap-2">
        <DoorOpen size={15} className="mt-0.5 shrink-0 text-favorite" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-zinc-100">{t("structureMap.portalPlan.title", { name: portalProjection.source.label })}</p>
          <p className="mt-0.5 text-[10px] tabular-nums text-zinc-300">{t("structureMap.portalPlan.transform", {
            source: sourceKey ? t(sourceKey) : portalProjection.sourceDimension,
            target: targetKey ? t(targetKey) : portalProjection.targetDimension,
            scale: portalProjection.horizontalScale,
          })}</p>
          <p className="mt-1 text-[12px] font-semibold tabular-nums text-favorite">{t("structureMap.portalPlan.coordinates", {
            exactX: conciseCoordinate(portalProjection.exactX), exactZ: conciseCoordinate(portalProjection.exactZ),
            blockX: portalProjection.blockX, blockZ: portalProjection.blockZ,
          })}</p>
        </div>
        <button type="button" onClick={onClearPortalProjection} aria-label={t("structureMap.portalPlan.close")} title={t("structureMap.portalPlan.close")}
          className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-300 hover:bg-white/8 hover:text-white">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-zinc-300">{t("structureMap.portalPlan.disclaimer")}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onCenter(portalProjection.exactX, portalProjection.exactZ)}
          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-white/5 px-2 py-2 text-[11px] font-semibold text-zinc-100 hover:bg-white/10">
          <Crosshair size={13} aria-hidden="true" />{t("structureMap.portalPlan.centerGhost")}
        </button>
        <button type="button" disabled={saved || !!pending || destinations.length >= TRACKED_DESTINATION_LIMIT} onClick={() => { void savePortalPlan(); }}
          title={destinations.length >= TRACKED_DESTINATION_LIMIT ? t("structureMap.destinations.limit", { count: TRACKED_DESTINATION_LIMIT }) : undefined}
          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-favorite/55 bg-favorite/15 px-2 py-2 text-[11px] font-semibold text-favorite hover:bg-favorite/25 disabled:cursor-not-allowed disabled:opacity-50">
          <Save size={13} aria-hidden="true" />{t(saved ? "structureMap.portalPlan.saved" : "structureMap.portalPlan.save")}
        </button>
      </div>
    </div>}
    {destinations.length > TRACKED_DESTINATION_LIMIT && <p role="status" className="pt-2 text-[11px] leading-4 text-warning">
      {t("structureMap.destinations.overflow", { count: destinations.length - TRACKED_DESTINATION_LIMIT })}
    </p>}
    {error && <p role="alert" className="pt-2 text-[11px] text-danger-text">{t("structureMap.actions.saveFailed")}</p>}
  </section>;
};
