import { CalendarDays, Check, Clock3, Footprints, Globe2, Leaf, Route, Skull, Trash2, Waypoints } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MapDropdownTrigger from "../../components/map-dropdown-trigger";
import CollapsibleSidebarToggle from "../../components/layout/collapsible-sidebar-toggle";
import { GAME_MAP_DIMENSIONS } from "../../game-config";
import { cn } from "../../lib/cn";
import MapCubePicker from "../map/map-cube-picker";
import { useDismissable } from "../map/use-dismissable";
import { useWorldLibrary } from "../worlds/use-world-library";
import type { WorldRecord } from "../worlds/world-types";
import { isJourneyLongEnough, journeyDistance } from "./journey-distance";
import JourneyHistoryMap from "./journey-history-map";
import { getBrowserJourneyStorage, type JourneyRead } from "./journey-storage";
import type { WorldJourney } from "./journey-state";

type HistoryEntry = { world: WorldRecord; journey: WorldJourney };
const EMPTY_WORLDS: WorldRecord[] = [];
const entryKey = (entry: HistoryEntry) => `${entry.world.id}:${entry.journey.id}`;
const journeyEnd = (journey: WorldJourney) => journey.endedAt
  ?? journey.segments.at(-1)?.points.at(-1)?.at ?? journey.startedAt;

const biomeCount = (journey: WorldJourney) => new Set(journey.segments.flatMap(segment => segment.points)
  .map(point => point.biome).filter((biome): biome is string => !!biome)).size;
const formatDate = (value: number, locale: string) => new Intl.DateTimeFormat(locale, {
  dateStyle: "medium", timeStyle: "short",
}).format(new Date(value));
const formatListDate = (value: number, locale: string) => new Intl.DateTimeFormat(locale, {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
}).format(new Date(value));
const formatDuration = (start: number, end: number, t: ReturnType<typeof useTranslation>["t"]) => {
  const minutes = Math.max(1, Math.round((end - start) / 60_000));
  if (minutes < 60) return t("journeyHistory.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  return remainder ? t("journeyHistory.hoursMinutes", { hours, minutes: remainder }) : t("journeyHistory.hours", { count: hours });
};

const JourneyHistoryPage = () => {
  const { t, i18n } = useTranslation();
  const library = useWorldLibrary(), worlds = library.data?.worlds ?? EMPTY_WORLDS;
  const storage = getBrowserJourneyStorage(), worldPicker = useRef<HTMLDivElement>(null);
  const [reads, setReads] = useState<Record<string, JourneyRead>>({});
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const [deleteErrorKey, setDeleteErrorKey] = useState<string | null>(null);
  const [dimension, setDimension] = useState("overworld");
  const [focusTarget, setFocusTarget] = useState<{ dimension: string; x: number; z: number } | null>(null);
  const [worldOpen, setWorldOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const closeWorldPicker = useCallback(() => setWorldOpen(false), []);
  useDismissable(worldOpen, worldPicker, closeWorldPicker);
  useEffect(() => {
    const refresh = () => setReads(Object.fromEntries(worlds.map(world => [world.id, storage.read(world.id)])));
    refresh();
    const unsubscribers = worlds.map(world => storage.subscribe(world.id, refresh));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [storage, worlds]);
  const allEntries = useMemo<HistoryEntry[]>(() => worlds.flatMap(world => {
    const read = reads[world.id];
    if (!read || read.error) return [];
    return read.data.journeys.filter(journey => isJourneyLongEnough(journey))
      .map(journey => ({ world, journey }));
  }).sort((left, right) => journeyEnd(right.journey) - journeyEnd(left.journey)), [reads, worlds]);
  const fallbackWorldId = allEntries[0]?.world.id ?? worlds[0]?.id ?? null;
  const activeWorldId = worlds.some(world => world.id === selectedWorldId) ? selectedWorldId : fallbackWorldId;
  const activeWorld = worlds.find(world => world.id === activeWorldId) ?? null;
  const entries = allEntries.filter(entry => entry.world.id === activeWorldId);
  const selected = entries.find(entry => entryKey(entry) === selectedId) ?? entries[0] ?? null;
  const visitedDimensions = new Set(selected?.journey.segments.map(segment => segment.dimension) ?? []);
  const availableDimensions = GAME_MAP_DIMENSIONS.filter(item => visitedDimensions.has(item.id));
  const selectedDimension = availableDimensions.some(item => item.id === dimension)
    ? dimension : availableDimensions[0]?.id ?? "overworld";
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en", endAt = selected ? journeyEnd(selected.journey) : 0;
  const travelled = selected ? Math.round(journeyDistance(selected.journey)) : 0, biomes = selected ? biomeCount(selected.journey) : 0;

  return <div className="flex h-full min-h-0 bg-background text-white">
    <aside className={cn("flex min-w-0 shrink-0 flex-col border-r border-border bg-surface/95 transition-[width] duration-300 ease-in-out motion-reduce:transition-none",
      sidebarCollapsed ? "w-9 overflow-hidden" : "w-60")}>
      <div id="journey-history-sidebar-content" aria-hidden={sidebarCollapsed} inert={sidebarCollapsed}
        className={cn("flex min-h-0 w-60 shrink-0 flex-1 flex-col transition-opacity duration-150 motion-reduce:transition-none",
          sidebarCollapsed ? "pointer-events-none opacity-0" : "opacity-100 delay-150")}>
      <header className="border-b border-border px-3 py-3">
        <div className="mb-2 flex items-center gap-2 px-1"><Route size={16} className="text-accent" aria-hidden="true" />
          <h1 className="text-sm font-semibold">{t("journeyHistory.title")}</h1></div>
        <div ref={worldPicker} className="relative">
          <MapDropdownTrigger icon={Globe2} label={activeWorld?.name ?? t("worlds.title")} open={worldOpen}
            onClick={() => setWorldOpen(open => !open)} aria-label={t("journeyHistory.chooseWorld")} />
          {worldOpen && <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface py-1 shadow-[var(--panel-shadow)]">
            {worlds.map(world => {
              const count = allEntries.filter(entry => entry.world.id === world.id).length;
              return <button key={world.id} type="button" onClick={() => {
                setSelectedWorldId(world.id); setSelectedId(null); setFocusTarget(null); setWorldOpen(false);
                setPendingDeleteKey(null); setDeleteErrorKey(null);
              }}
                className={cn("flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/[.06]",
                  world.id === activeWorldId ? "bg-accent-soft text-white" : "text-zinc-200")}>
                <span className="min-w-0 flex-1 truncate">{world.name}</span><span className="tabular-nums text-zinc-400">{count}</span>
              </button>;
            })}
          </div>}
        </div>
      </header>
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-2">
        {!entries.length && <div className="px-3 py-10 text-center"><Waypoints size={24} className="mx-auto mb-3 text-zinc-500" aria-hidden="true" />
          <p className="text-xs font-medium text-zinc-100">{t("journeyHistory.emptyTitle")}</p>
          <p className="mt-1 text-[11px] leading-4 text-zinc-400">{t("journeyHistory.emptyBody")}</p></div>}
        <div className="space-y-1.5">{entries.map(entry => {
          const key = entryKey(entry), active = key === (selected ? entryKey(selected) : null), entryEnd = journeyEnd(entry.journey);
          return <div key={key} className={cn("rounded-[var(--radius-md)] border transition-colors",
            active ? "border-accent/60 bg-accent-soft" : "border-transparent bg-white/[.025] hover:border-border hover:bg-white/[.06]")}>
            <button type="button" onClick={() => {
              setSelectedId(key); setDimension(entry.journey.segments[0]?.dimension ?? "overworld"); setFocusTarget(null);
              setPendingDeleteKey(null); setDeleteErrorKey(null);
            }} aria-current={active ? "true" : undefined}
              className="w-full cursor-pointer px-2.5 py-2.5 text-left">
              <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white">{formatListDate(entry.journey.startedAt, locale)}</span>
                {entry.journey.endReason === "death" ? <Skull size={13} className="text-danger-text" aria-label={t("journeyHistory.died")} />
                  : <Check size={13} className="text-success-text" aria-label={t("journeyHistory.survived")} />}</div>
              <p className="mt-1 text-[10px] text-zinc-400">{formatDuration(entry.journey.startedAt, entryEnd, t)} · {t("journeyHistory.distance", { count: Math.round(journeyDistance(entry.journey)) })}</p>
            </button>
            {active && <div className="border-t border-white/10 px-2.5 py-1.5">
              {pendingDeleteKey === key ? <>
                <p className="mb-1.5 text-[11px] text-zinc-200">{t("journeyHistory.deleteConfirm")}</p>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setPendingDeleteKey(null)} className="cursor-pointer rounded px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10">{t("journeyHistory.cancelDelete")}</button>
                  <button type="button" onClick={() => {
                    try {
                      storage.deleteJourney(entry.world.id, entry.journey.id);
                      setPendingDeleteKey(null); setDeleteErrorKey(null); setSelectedId(null); setFocusTarget(null);
                    } catch (error) {
                      console.error("Failed to delete journey", error);
                      setDeleteErrorKey(key);
                    }
                  }} className="cursor-pointer rounded bg-danger/20 px-2 py-1 text-[11px] font-semibold text-danger-text hover:bg-danger/30">{t("journeyHistory.deleteJourney")}</button>
                </div>
              </> : <button type="button" onClick={() => { setPendingDeleteKey(key); setDeleteErrorKey(null); }}
                className="flex cursor-pointer items-center gap-1 text-[11px] text-zinc-400 hover:text-danger-text"><Trash2 size={12} aria-hidden="true" />{t("journeyHistory.deleteJourney")}</button>}
              {deleteErrorKey === key && <p role="alert" className="mt-1 text-[11px] text-danger-text">{t("journeyHistory.deleteFailed")}</p>}
            </div>}
          </div>;
        })}</div>
      </div>
      </div>
      <CollapsibleSidebarToggle collapsed={sidebarCollapsed} contentId="journey-history-sidebar-content"
        collapseLabel={t("journeyHistory.collapseSidebar")} expandLabel={t("journeyHistory.expandSidebar")}
        onToggle={() => { setWorldOpen(false); setSidebarCollapsed(value => !value); }} />
    </aside>
    <section className="relative min-w-0 flex-1 overflow-hidden">
      {selected ? <>
        <JourneyHistoryMap key={`${selected.world.id}:${selected.journey.id}:${selectedDimension}`}
          world={selected.world} journey={selected.journey} dimension={selectedDimension} focusTarget={focusTarget}
          onFollowTransition={target => {
            setFocusTarget({ dimension: target.dimension, x: target.point.x, z: target.point.z });
            setDimension(target.dimension);
          }} />
        <div className="absolute left-4 right-4 top-4 z-10 rounded-[var(--radius-md)] border border-border bg-surface/95 px-3 py-2.5 shadow-[var(--panel-shadow)] backdrop-blur-xl">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex min-w-0 items-center gap-2 text-[12px] font-semibold text-white"><CalendarDays size={14} className="shrink-0 text-accent" />
              <span className="truncate tabular-nums">{formatDate(selected.journey.startedAt, locale)}</span></div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1.5">
              <span className="flex items-center gap-1.5 text-[11px] text-zinc-200"><Clock3 size={13} className="text-accent" />{formatDuration(selected.journey.startedAt, endAt, t)}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-zinc-200"><Leaf size={13} className="text-accent" />
                {biomes ? t("journeyHistory.biomes", { count: biomes }) : t("journeyHistory.biomesUnknown")}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-zinc-200"><Footprints size={13} className="text-accent" />{t("journeyHistory.distance", { count: travelled })}</span>
              <span className={cn("flex items-center gap-1.5 text-[11px] font-semibold", selected.journey.endReason === "death" ? "text-danger-text" : "text-success-text")}>
                  {selected.journey.endReason === "death" ? <Skull size={13} /> : <Check size={13} />}
                  {t("journeyHistory.deaths", { count: selected.journey.endReason === "death" ? 1 : 0 })} · {t(selected.journey.endReason === "death" ? "journeyHistory.died" : "journeyHistory.survived")}</span>
            </div>
          </div>
        </div>
        <div className="pointer-events-auto absolute bottom-3 left-3 z-20">
          <MapCubePicker options={availableDimensions.map(item => ({ id: item.id, label: t(item.labelKey), artwork: item.artwork }))}
            value={selectedDimension} onSelect={next => { setFocusTarget(null); setDimension(next); }} ariaLabel={t("journeyHistory.dimension")} />
        </div>
      </> : <div className="grid h-full place-items-center text-sm text-zinc-400">{t("journeyHistory.emptyMap")}</div>}
    </section>
  </div>;
};

export default JourneyHistoryPage;
