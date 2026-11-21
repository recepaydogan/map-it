import { Focus, LoaderCircle, MapPin, Navigation, Route, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn.ts";
import MapSelectDropdown, { type MapSelectOption } from "../map/map-select-dropdown.tsx";
import type { WorldPin } from "./world-types.ts";
import type { CalculatedWorldRoute, WorldRouteEndpointSelection, WorldRouteError, WorldRoutePhase,
  WorldRoutePoint } from "./world-route-types.ts";

interface StructureOption { id: string; label: string }

interface WorldRoutePanelProps {
  start: WorldRouteEndpointSelection;
  destination: WorldRouteEndpointSelection;
  startPoint: WorldRoutePoint | null;
  destinationPoint: WorldRoutePoint | null;
  playerAvailable: boolean;
  pins: readonly WorldPin[];
  structures: readonly StructureOption[];
  picking: "start" | "destination" | null;
  phase: WorldRoutePhase;
  error: WorldRouteError | null;
  route: CalculatedWorldRoute | null;
  onStartChange: (selection: WorldRouteEndpointSelection) => void;
  onDestinationChange: (selection: WorldRouteEndpointSelection) => void;
  onPickMap: (target: "start" | "destination") => void;
  onCalculate: () => void;
  onFocus: () => void;
  onClear: () => void;
  onClose: () => void;
  onCancelPick?: () => void;
}

const selectionId = (selection: WorldRouteEndpointSelection) => selection.kind === "pin" ? `pin:${selection.pinId}`
  : selection.kind === "nearest" ? `nearest:${selection.structureType}` : selection.kind;

const parseSelection = (id: string): WorldRouteEndpointSelection => {
  if (id === "player") return { kind: "player" };
  if (id === "map") return { kind: "map", point: null };
  if (id.startsWith("pin:")) return { kind: "pin", pinId: id.slice(4) };
  if (id.startsWith("nearest:")) return { kind: "nearest", structureType: id.slice(8) };
  throw new Error("Unknown route endpoint selection");
};

const coordinateLabel = (point: WorldRoutePoint | null, locale: string) => point
  ? `X ${Math.round(point.x).toLocaleString(locale)} · Z ${Math.round(point.z).toLocaleString(locale)}` : null;

const WorldRoutePanel = ({ start, destination, startPoint, destinationPoint, playerAvailable, pins, structures,
  picking, phase, error, route, onStartChange, onDestinationChange, onPickMap, onCalculate, onFocus, onClear,
  onClose, onCancelPick }: WorldRoutePanelProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const startOptions: MapSelectOption[] = [
    ...(playerAvailable ? [{ id: "player", name: t("worldRoute.currentPosition") }] : []),
    { id: "map", name: start.kind === "map" && start.point
      ? t("worldRoute.selectedMapPoint", { x: Math.round(start.point.x).toLocaleString(locale), z: Math.round(start.point.z).toLocaleString(locale) })
      : t("worldRoute.chooseOnMap") },
    ...pins.map(pin => ({ id: `pin:${pin.id}`, name: pin.name })),
  ];
  const destinationOptions: MapSelectOption[] = [
    { id: "map", name: destination.kind === "map" && destination.point
      ? t("worldRoute.selectedMapPoint", { x: Math.round(destination.point.x).toLocaleString(locale), z: Math.round(destination.point.z).toLocaleString(locale) })
      : t("worldRoute.chooseOnMap") },
    ...pins.map(pin => ({ id: `pin:${pin.id}`, name: pin.name })),
    ...structures.map(structure => ({ id: `nearest:${structure.id}`,
      name: t("worldRoute.nearestStructure", { structure: structure.label }) })),
  ];
  const working = phase === "resolving" || phase === "calculating";
  const nearestAvailable = destination.kind === "nearest"
    && structures.some(structure => structure.id === destination.structureType);
  const canCalculate = !!startPoint && (nearestAvailable || !!destinationPoint) && !working;
  const status = phase === "resolving" ? t("worldRoute.findingNearest")
    : phase === "calculating" ? t("worldRoute.calculating")
      : error ? t(`worldRoute.errors.${error}`)
        : route ? t(route.terrainAware ? "worldRoute.biomeAware" : "worldRoute.directFallback")
          : null;
  const routeDistance = route ? t("worldRoute.distance", {
    count: Math.round(route.distance).toLocaleString(locale),
  }) : null;
  const choose = (target: "start" | "destination", id: string) => {
    const selection = parseSelection(id);
    if (target === "start") onStartChange(selection);
    else onDestinationChange(selection);
    if (selection.kind === "map") onPickMap(target);
  };

  return <section className="world-route-panel pointer-events-auto w-[min(21rem,calc(100vw-1.5rem))] overflow-visible rounded-[var(--radius-lg)] border border-border bg-surface/95 shadow-[var(--panel-shadow)] backdrop-blur-xl"
    aria-label={t("worldRoute.title")}>
    {picking && (
      <div
        role="status"
        data-target={picking}
        className="world-route-pick-hint"
      >
        <div className="flex min-w-0 items-center gap-2">
          {picking === "start" ? (
            <Navigation size={13} className="shrink-0 text-accent" aria-hidden="true" />
          ) : (
            <MapPin size={13} className="shrink-0 text-danger" aria-hidden="true" />
          )}
          <span className="truncate">
            {t(picking === "start" ? "worldRoute.pickStartOnMap" : "worldRoute.pickDestinationOnMap")}
          </span>
        </div>
        {onCancelPick && (
          <button
            type="button"
            onClick={onCancelPick}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            title={t("worldRoute.close")}
            aria-label={t("worldRoute.close")}
          >
            <span className="text-[9px]">Esc</span>
            <X size={10} aria-hidden="true" />
          </button>
        )}
      </div>
    )}
    <header className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-md)] bg-accent-soft text-accent">
        <Route size={17} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-[13px] font-semibold text-white">{t("worldRoute.title")}</strong>
        <small className="block text-[10px] text-white/80">{t("worldRoute.subtitle")}</small>
      </span>
      <button type="button" onClick={onClose} className="grid size-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-white/80 hover:bg-white/10 hover:text-white"
        aria-label={t("worldRoute.close")} title={t("worldRoute.close")}><X size={15} aria-hidden="true" /></button>
    </header>

    <div className="space-y-3 p-3">
      <div className="relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2.5 gap-y-3">
        <div className="relative grid place-items-center self-stretch">
          <span className="absolute bottom-[-14px] top-1/2 w-px bg-border" aria-hidden="true" />
          <span className="relative z-[1] size-2.5 rounded-[var(--radius-full)] border-2 border-accent bg-surface" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[.08em] text-white/80">{t("worldRoute.start")}</label>
          <MapSelectDropdown options={startOptions} value={selectionId(start)} onSelect={id => choose("start", id)}
            placeholder={t("worldRoute.selectStart")} ariaLabel={t("worldRoute.start")}
            searchPlaceholder={t("worldRoute.searchOptions")} noResultsLabel={t("worldRoute.noOptions")}
            icon={Navigation} placement="top" triggerClassName={cn("h-9 w-full bg-black/20 text-[11px]",
              picking === "start" && "border-accent ring-2 ring-accent bg-accent/15")} />
          {startPoint && start.kind !== "map" && <p className="mt-1 text-[10px] tabular-nums text-white/80">{coordinateLabel(startPoint, locale)}</p>}
        </div>
        <div className="grid place-items-center self-start pt-7">
          <MapPin size={13} className="text-accent" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[.08em] text-white/80">{t("worldRoute.destination")}</label>
          <MapSelectDropdown options={destinationOptions} value={selectionId(destination)} onSelect={id => choose("destination", id)}
            placeholder={t("worldRoute.selectDestination")} ariaLabel={t("worldRoute.destination")}
            searchPlaceholder={t("worldRoute.searchOptions")} noResultsLabel={t("worldRoute.noOptions")}
            icon={MapPin} placement="top" triggerClassName={cn("h-9 w-full bg-black/20 text-[11px]",
              picking === "destination" && "border-danger ring-2 ring-danger bg-danger/15")} />
          {destinationPoint && destination.kind !== "map" && <p className="mt-1 text-[10px] tabular-nums text-white/80">{coordinateLabel(destinationPoint, locale)}</p>}
        </div>
      </div>

      {(working || route || error) && (
        <div className={cn("flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-2",
          error ? "border-danger/50 bg-danger/10" : route ? "border-accent/40 bg-accent-soft" : "border-border bg-black/15")} role={error ? "alert" : "status"}>
          {working && <LoaderCircle size={14} className="shrink-0 animate-spin text-accent" aria-hidden="true" />}
          <span className="min-w-0 flex-1">
            {routeDistance && <strong className="block text-[12px] font-semibold text-white">{routeDistance}</strong>}
            {status && <span className="block text-[10px] leading-4 text-white/80">{status}</span>}
          </span>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onCalculate} disabled={!canCalculate}
          className="flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] bg-accent px-3 text-[11px] font-semibold text-background hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-65">
          {working ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Route size={14} aria-hidden="true" />}
          {t(route ? "worldRoute.recalculate" : "worldRoute.calculate")}
        </button>
        {route && <>
          <button type="button" onClick={onFocus} className="grid size-9 cursor-pointer place-items-center rounded-[var(--radius-md)] border border-border text-white/80 hover:bg-white/10 hover:text-white"
            aria-label={t("worldRoute.focus")} title={t("worldRoute.focus")}><Focus size={15} aria-hidden="true" /></button>
          <button type="button" onClick={onClear} className="grid size-9 cursor-pointer place-items-center rounded-[var(--radius-md)] border border-border text-white/80 hover:bg-danger/10 hover:text-danger-text"
            aria-label={t("worldRoute.clear")} title={t("worldRoute.clear")}><Trash2 size={15} aria-hidden="true" /></button>
        </>}
      </div>
    </div>
  </section>;
};

export default WorldRoutePanel;
