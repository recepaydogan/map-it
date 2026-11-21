import { CircleStop, Eye, EyeOff, Play, Route, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BiomeCanvasState } from "../generation/biome-canvas.ts";
import type { WorldMapPlayer } from "../worlds/world-map-player.ts";
import JourneyDeathMarker from "./journey-death-marker.tsx";
import type { ObservedJourneyPortal } from "./journey-observed-portals.ts";
import { projectJourney } from "./journey-projection.ts";
import { correctedJourneyRouteForPortals } from "./journey-route-cleanup.ts";
import type { JourneyRead } from "./journey-storage.ts";
import type { useWorldJourney } from "./use-world-journey.ts";
import { useWorldMapFrameView } from "../worlds/world-map-frame-context";
import { GAME_OBSERVED_PORTAL_APPEARANCE } from "../../game-config.ts";

const countPoints = (read: JourneyRead) => {
  const journey = read.preferences.enabled && read.data.active ? read.data.active : read.data.journeys[0] ?? read.data.active;
  return journey?.segments.reduce((sum, segment) => sum + segment.points.length, 0) ?? 0;
};

export const WorldJourneyLayer = ({ read, dimension, view: settledView, portals }: {
  read: JourneyRead; dimension: string; view: BiomeCanvasState | null;
  portals: readonly ObservedJourneyPortal[];
}) => {
  const { t } = useTranslation();
  const view = useWorldMapFrameView(settledView);
  const journey = read.preferences.enabled && read.data.active ? read.data.active : read.data.journeys[0] ?? read.data.active;
  const route = useMemo(() => journey ? correctedJourneyRouteForPortals(journey, portals,
    GAME_OBSERVED_PORTAL_APPEARANCE.maxTransitionGapMs) : null, [journey, portals]);
  const projected = useMemo(() => projectJourney(read.preferences.visible ? route : null, dimension, view),
    [read.preferences.visible, route, dimension, view]);
  const diedHere = journey?.endReason === "death" && journey.segments.at(-1)?.dimension === dimension;
  if (!projected.paths.length && !(diedHere && projected.endpoint)) return null;
  return <svg className="pointer-events-none absolute inset-0 z-[4] h-full w-full overflow-hidden" aria-label={t("journey.mapLayer")}
    role="img" viewBox={`0 0 ${view?.width ?? 1} ${view?.height ?? 1}`} preserveAspectRatio="none">
    {projected.paths.map((path, index) => <g key={index}>
      <polyline points={path.map(point => point.join(",")).join(" ")} fill="none" stroke="rgba(12,14,12,.72)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={path.map(point => point.join(",")).join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </g>)}
    {projected.directionArrows.map((arrow, index) => <path key={index} data-journey-direction
      transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`}
      d="M 7 0 L -5 -5 L -2 0 L -5 5 Z" fill="white" stroke="rgba(12,14,12,.9)"
      strokeWidth="1.4" strokeLinejoin="round" />)}
    {diedHere && projected.endpoint && <JourneyDeathMarker x={projected.endpoint.x} y={projected.endpoint.y} />}
  </svg>;
};

export const WorldJourneySummary = ({ journey, player }: { journey: ReturnType<typeof useWorldJourney>; player: WorldMapPlayer | null }) => {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false), [error, setError] = useState(false);
  const points = countPoints(journey), hasJourney = points > 0;
  const command = (run: () => void) => {
    if (pending) return; setPending(true); setError(false);
    try { run(); } catch (reason) { console.error("Journey preference change failed", reason); setError(true); }
    finally { setPending(false); }
  };
  const clear = () => {
    if (!window.confirm(t("journey.clearConfirm"))) return;
    command(journey.clear);
  };
  return <section data-journey-summary className="border-b border-border/60 pb-2" aria-label={t("journey.title")}>
    <div className="flex items-center gap-2 py-2">
      <Route size={15} className="text-accent" aria-hidden="true" />
      <h3 className="min-w-0 flex-1 text-[13px] font-semibold text-zinc-100">{t("journey.title")}</h3>
      {hasJourney && <span className="rounded-[var(--radius-full)] bg-accent-soft px-2 py-0.5 text-[10px] font-semibold tabular-nums text-accent">
        {t("journey.points", { count: points })}
      </span>}
    </div>
    <p role="status" className="pb-2 text-[11px] leading-4 text-zinc-300">
      {t(journey.error ? "journey.storageError" : journey.preferences.enabled ? player ? "journey.recording" : "journey.waiting" : hasJourney ? "journey.ready" : "journey.off")}
    </p>
    <div className="grid grid-cols-3 gap-1.5">
      <button type="button" disabled={pending || !!journey.error} onClick={() => command(() => journey.setEnabled(!journey.preferences.enabled))}
        aria-pressed={journey.preferences.enabled} className="flex cursor-pointer items-center justify-center gap-1 rounded-[var(--radius-md)] border border-border bg-white/5 px-1.5 py-1.5 text-[10px] font-semibold text-zinc-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-zinc-300">
        {journey.preferences.enabled ? <CircleStop size={12} aria-hidden="true" /> : <Play size={12} aria-hidden="true" />}
        {t(journey.preferences.enabled ? "journey.stop" : "journey.start")}
      </button>
      <button type="button" disabled={pending || !!journey.error || !hasJourney} onClick={() => command(() => journey.setVisible(!journey.preferences.visible))}
        aria-pressed={journey.preferences.visible} className="flex cursor-pointer items-center justify-center gap-1 rounded-[var(--radius-md)] border border-border bg-white/5 px-1.5 py-1.5 text-[10px] font-semibold text-zinc-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-zinc-300">
        {journey.preferences.visible ? <EyeOff size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />}
        {t(journey.preferences.visible ? "journey.hide" : "journey.show")}
      </button>
      <button type="button" disabled={pending || !hasJourney && !journey.error} onClick={clear}
        className="flex cursor-pointer items-center justify-center gap-1 rounded-[var(--radius-md)] border border-border bg-white/5 px-1.5 py-1.5 text-[10px] font-semibold text-zinc-100 hover:bg-danger/10 hover:text-danger-text disabled:cursor-not-allowed disabled:text-zinc-300">
        <Trash2 size={12} aria-hidden="true" />{t("journey.clear")}
      </button>
    </div>
    {error && <p role="alert" className="pt-2 text-[11px] text-danger-text">{t("journey.commandFailed")}</p>}
  </section>;
};
