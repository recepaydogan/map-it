import {
  Backpack,
  BookOpen,
  BookOpenText,
  CalendarDays,
  ChevronRight,
  ExternalLink,
  Flame,
  Luggage,
  Mountain,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  Skull,
  Sparkles,
  Timer,
  TrendingUp,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { twMerge } from "tailwind-merge";
import { trailBreakSeconds, useExpeditions, type ExpeditionRecord } from "../map/expedition-store";
import { reachedCountOf, type ExpeditionReachCategory } from "../map/expedition-insights";
import { projectToMap } from "../map/live-state";
import { usePeakMapData, type PeakDailyLevel } from "../map/map-data";
import { unitsToMeters } from "../../utils/game-units";

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
};

const playSecondsOf = (record: ExpeditionRecord): number => {
  const breakAfter = trailBreakSeconds(record);
  return record.samples.reduce((total, sample, index) => {
    const previous = record.samples[index - 1];
    if (!previous) return total;
    const gap = sample[0] - previous[0];
    return gap <= breakAfter ? total + gap : total;
  }, 0);
};

const StatCard = ({ icon: Icon, label, value }: { icon: typeof Timer; label: string; value: string | number }) => (
  <div className="flex h-[72px] flex-col items-start rounded-[var(--radius-md)] border border-border bg-surface/45 p-3">
    <div className="flex min-w-0 items-center gap-1.5 text-accent"><Icon size={13} className="shrink-0" aria-hidden="true" /><span className="truncate whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.12em] text-subtle">{label}</span></div>
    <p className="mt-auto text-left text-base font-semibold tabular-nums text-primary">{value}</p>
  </div>
);

interface ElevationSample {
  seconds: number;
  elevation: number;
  x: number;
  y: number;
}

interface ElevationDeath {
  seconds: number;
  elevation: number;
  x: number;
  y: number;
}

interface ElevationChartData {
  samples: ElevationSample[];
  deaths: ElevationDeath[];
  segments: string[];
  areaSegments: string[];
  min: number;
  max: number;
  middle: number;
  last: number;
  gain: number;
  peakIndex: number;
}

const nearestSampleIndex = (samples: ElevationSample[], targetSeconds: number): number => {
  let low = 0;
  let high = samples.length - 1;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].seconds < targetSeconds) low = middle + 1;
    else high = middle;
  }

  if (low === 0) return 0;
  const previous = samples[low - 1];
  const current = samples[low];
  return targetSeconds - previous.seconds <= current.seconds - targetSeconds ? low - 1 : low;
};

const ElevationChart = ({ chart }: { chart: ElevationChartData }) => {
  const { t } = useTranslation();
  const gradientId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeDeathIndex, setActiveDeathIndex] = useState<number | null>(null);
  const activeSample = activeIndex === null ? null : chart.samples[activeIndex];
  const activeDeath = activeDeathIndex === null ? null : chart.deaths[activeDeathIndex];
  const activePoint = activeDeath ?? activeSample;
  const highlightedSample = activePoint ?? chart.samples[chart.peakIndex];
  const activeDescription = activeDeath
    ? t("journal.deathPoint", {
        time: formatDuration(activeDeath.seconds),
        value: unitsToMeters(activeDeath.elevation),
      })
    : activeSample
      ? t("journal.elevationPoint", {
          time: formatDuration(activeSample.seconds),
          value: unitsToMeters(activeSample.elevation),
        })
      : "";

  const selectAtClientX = (clientX: number, element: HTMLDivElement) => {
    const bounds = element.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    setActiveDeathIndex(null);
    setActiveIndex(nearestSampleIndex(chart.samples, ratio * chart.last));
  };

  return (
    <div className="relative mt-2 h-44 overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface/40">
      <div className="absolute bottom-7 left-11 right-3 top-4">
        <div
          className="relative h-full w-full cursor-crosshair outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          role="group"
          tabIndex={0}
          aria-label={t("journal.elevationLabel")}
          onPointerMove={(event) => selectAtClientX(event.clientX, event.currentTarget)}
          onPointerLeave={() => {
            setActiveIndex(null);
            setActiveDeathIndex(null);
          }}
          onFocus={() => setActiveIndex(chart.peakIndex)}
          onBlur={() => setActiveIndex(null)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            if (event.key === "Home") setActiveIndex(0);
            else if (event.key === "End") setActiveIndex(chart.samples.length - 1);
            else {
              const direction = event.key === "ArrowLeft" ? -1 : 1;
              setActiveIndex((current) =>
                Math.min(chart.samples.length - 1, Math.max(0, (current ?? chart.peakIndex) + direction)),
              );
            }
          }}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-primary"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {[0, 50, 100].map((position) => (
              <line
                key={`horizontal-${position}`}
                x1="0"
                y1={position}
                x2="100"
                y2={position}
                stroke="currentColor"
                strokeOpacity={position === 50 ? 0.12 : 0.08}
                strokeDasharray={position === 50 ? "2 3" : undefined}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {[25, 50, 75].map((position) => (
              <line
                key={`vertical-${position}`}
                x1={position}
                y1="0"
                x2={position}
                y2="100"
                stroke="currentColor"
                strokeOpacity="0.06"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {chart.areaSegments.map((points, index) => (
              <polygon key={`area-${index}`} points={points} fill={`url(#${gradientId})`} />
            ))}
            {chart.segments.map((points, index) => (
              <polyline
                key={`line-${index}`}
                points={points}
                fill="none"
                stroke="var(--color-accent-bright)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {activePoint && (
              <line
                x1={activePoint.x}
                y1="0"
                x2={activePoint.x}
                y2="100"
                stroke={activeDeath ? "var(--color-danger)" : "var(--color-accent)"}
                strokeOpacity="0.7"
                strokeDasharray="2 2"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          <span
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-full)] border-2 border-background transition-[width,height] duration-100"
            style={{
              left: `${highlightedSample.x}%`,
              top: `${highlightedSample.y}%`,
              width: activePoint ? 11 : 9,
              height: activePoint ? 11 : 9,
              backgroundColor: activeDeath ? "var(--color-danger)" : "var(--color-accent-bright)",
            }}
            aria-hidden="true"
          />

          {chart.deaths.map((death, index) => (
            <button
              key={`${death.seconds}-${index}`}
              type="button"
              className="absolute z-20 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-[var(--radius-full)] border border-danger/70 bg-background/90 text-danger shadow-[0_4px_14px_rgba(0,0,0,0.5)] transition-[color,background-color,transform] duration-200 hover:scale-110 hover:bg-danger hover:text-background focus-visible:scale-110 focus-visible:bg-danger focus-visible:text-background"
              style={{ left: `${death.x}%`, top: `${death.y}%` }}
              aria-label={t("journal.deathPoint", {
                time: formatDuration(death.seconds),
                value: unitsToMeters(death.elevation),
              })}
              onPointerMove={(event) => event.stopPropagation()}
              onPointerEnter={() => {
                setActiveIndex(null);
                setActiveDeathIndex(index);
              }}
              onPointerLeave={() => setActiveDeathIndex(null)}
              onFocus={() => {
                setActiveIndex(null);
                setActiveDeathIndex(index);
              }}
              onBlur={() => setActiveDeathIndex(null)}
            >
              <Skull size={10} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ))}

          {activePoint && (
            <div
              className={twMerge(
                "pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-[var(--radius-sm)] border bg-surface-elevated px-2.5 py-1.5 text-[10px] font-semibold tabular-nums shadow-[0_8px_24px_rgba(0,0,0,0.38)]",
                activeDeath ? "border-danger/60 text-danger" : "border-border-strong text-primary",
              )}
              style={{
                left: `${Math.min(88, Math.max(12, activePoint.x))}%`,
                top: `${Math.max(14, activePoint.y)}%`,
              }}
            >
              {activeDescription}
            </div>
          )}
        </div>
      </div>

      <span className="absolute left-2 top-2.5 text-[9px] font-semibold tabular-nums text-primary">{unitsToMeters(chart.max)} m</span>
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] tabular-nums text-subtle">{unitsToMeters(chart.middle)} m</span>
      <span className="absolute bottom-7 left-2 text-[9px] tabular-nums text-subtle">{unitsToMeters(chart.min)} m</span>
      <span className="absolute bottom-2 left-11 text-[9px] tabular-nums text-subtle">0:00</span>
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] tabular-nums text-subtle">{formatDuration(chart.last / 2)}</span>
      <span className="absolute bottom-2 right-3 text-[9px] tabular-nums text-subtle">{formatDuration(chart.last)}</span>
      <span className="sr-only" aria-live="polite">
        {activeDescription}
      </span>
    </div>
  );
};

interface JournalScreenProps {
  onViewInAtlas?: (record: ExpeditionRecord) => void;
}

const JournalScreen = ({ onViewInAtlas }: JournalScreenProps) => {
  const { t, i18n } = useTranslation();
  const records = useExpeditions();
  const dailyMap = usePeakMapData();
  const finalMap = usePeakMapData("final");
  const sortedRecords = useMemo(() => [...records].sort((a, b) => b.updatedAt - a.updatedAt), [records]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const recordKey = (record: ExpeditionRecord) => `${record.scene}:${record.startedAt}`;
  const selected = sortedRecords.find((record) => recordKey(record) === selectedKey) ?? sortedRecords[0] ?? null;

  const levelsByScene = useMemo(() => {
    const levels = [dailyMap.level, finalMap.level, ...dailyMap.forecast.map((entry) => entry.level)];
    return new Map(levels.filter((level): level is PeakDailyLevel => level !== null).map((level) => [level.scene, level]));
  }, [dailyMap.forecast, dailyMap.level, finalMap.level]);
  const level = selected ? levelsByScene.get(selected.scene) ?? null : null;

  const playSeconds = selected ? playSecondsOf(selected) : 0;
  const peakElevation = selected?.samples.length ? Math.max(...selected.samples.map((sample) => sample[2])) : 0;
  const campfires = selected
    ? new Set((selected.campfires ?? []).map((event) => `${Math.round(event.x)},${Math.round(event.z)}`)).size
    : 0;
  const reached = selected ? {
    campfire: reachedCountOf(level, selected, "campfire"),
    luggage: reachedCountOf(level, selected, "luggage"),
    secret: reachedCountOf(level, selected, "secret"),
    guidebook: reachedCountOf(level, selected, "guidebook"),
  } : null;

  const itemByDisplayId = useMemo(() => new Map(dailyMap.items.map((item) => [item.displayId, item])), [dailyMap.items]);
  const collectedItems = (() => {
    const totals = new Map<number, number>();
    (selected?.inventory ?? []).filter((event) => event.delta > 0).forEach((event) =>
      totals.set(event.itemId, (totals.get(event.itemId) ?? 0) + event.delta));
    return [...totals.entries()].map(([itemId, count]) => ({ itemId, count, item: itemByDisplayId.get(itemId) ?? null }));
  })();

  const trailPoints = selected && level
    ? selected.samples.map((sample) => {
        const point = projectToMap(level.projection, sample[1], sample[3]);
        return `${point.x},${point.y}`;
      }).join(" ")
    : "";
  const elevationChart: ElevationChartData | null = selected?.samples.length ? (() => {
    const elevations = selected.samples.map((sample) => sample[2]);
    const min = Math.min(...elevations);
    const max = Math.max(...elevations);
    const span = Math.max(1, max - min);
    const last = Math.max(1, selected.samples.at(-1)?.[0] ?? 1);
    const samples = selected.samples.map((sample) => ({
      seconds: sample[0],
      elevation: sample[2],
      x: (sample[0] / last) * 100,
      y: 100 - ((sample[2] - min) / span) * 100,
    }));
    const breakAfter = trailBreakSeconds(selected);
    const gain = selected.samples.reduce((total, sample, index) => {
      const previous = selected.samples[index - 1];
      if (!previous || sample[0] - previous[0] > breakAfter) return total;
      return total + Math.max(0, sample[2] - previous[2]);
    }, 0);
    // The recorder's break tolerance (a few seconds) is right for the map
    // trail, but at chart scale it turns every respawn and bridge hiccup into
    // a one-pixel slit. Drawing bridges over short holes keeps the chart
    // readable while real absences — deaths waited out, trips to the airport —
    // still break the line.
    const drawBreakAfter = Math.max(30, breakAfter);
    const sampleSegments = samples.reduce<ElevationSample[][]>((segments, sample, index) => {
      const previous = selected.samples[index - 1];
      if (!previous || sample.seconds - previous[0] > drawBreakAfter) segments.push([]);
      segments.at(-1)?.push(sample);
      return segments;
    }, []);
    const segments = sampleSegments.map((segment) =>
      segment.map((sample) => `${sample.x},${sample.y}`).join(" "));
    const areaSegments = sampleSegments.map((segment, index) =>
      `${segment[0].x},100 ${segments[index]} ${segment.at(-1)?.x ?? segment[0].x},100`);
    const deaths = selected.deaths.map((death) => {
      const seconds = Math.min(last, Math.max(0, (death.at - selected.startedAt) / 1_000));
      const nearestSample = samples[nearestSampleIndex(samples, seconds)];
      return {
        seconds,
        elevation: nearestSample.elevation,
        x: (seconds / last) * 100,
        y: nearestSample.y,
      };
    });
    return {
      samples,
      deaths,
      segments,
      areaSegments,
      min,
      max,
      middle: min + span / 2,
      last,
      gain,
      peakIndex: elevations.indexOf(max),
    };
  })() : null;

  const totalDeaths = records.reduce((total, record) => total + record.deaths.length, 0);
  const totalSeconds = records.reduce((total, record) => total + playSecondsOf(record), 0);
  const allTimePeak = records.reduce((peak, record) => Math.max(peak, ...record.samples.map((sample) => sample[2]), 0), 0);

  const relativeDate = (record: ExpeditionRecord): string => {
    const day = new Date(record.startedAt);
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    const difference = Math.round((startOfToday - startOfDay) / 86_400_000);
    if (difference === 0) return t("journal.today");
    if (difference === 1) return t("journal.yesterday");
    if (difference === 2) return t("journal.twoDaysAgo");
    return new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }).format(day);
  };

  const itemName = (item: NonNullable<(typeof collectedItems)[number]["item"]>) =>
    t(`items.names.${item.name}`, { defaultValue: item.name });

  if (!selected) {
    return <section className="grid h-full place-items-center bg-background px-8 text-center" aria-label={t("journal.ariaLabel")}>
      <div className="max-w-sm"><BookOpen size={34} className="mx-auto text-accent" aria-hidden="true" /><h1 className="mt-4 font-display text-xl font-semibold text-primary">{t("journal.emptyTitle")}</h1><p className="mt-2 text-[13px] leading-relaxed text-muted">{t("journal.emptyDescription")}</p></div>
    </section>;
  }

  return (
    <section className="flex h-full bg-background" aria-label={t("journal.ariaLabel")}>
      <aside
        className={twMerge(
          "relative flex shrink-0 flex-col border-r border-border bg-surface/25 transition-[width,background-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          historyCollapsed ? "w-14 bg-surface/15" : "w-[252px]",
        )}
      >
        <button
          type="button"
          onClick={() => setHistoryCollapsed((collapsed) => !collapsed)}
          className="absolute -right-3 bottom-4 z-20 grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-full)] border border-border-strong bg-surface-elevated text-muted shadow-[0_8px_24px_rgba(0,0,0,0.32)] transition-[color,background-color,transform] duration-300 hover:scale-105 hover:bg-surface-hover hover:text-primary"
          aria-label={t(historyCollapsed ? "journal.expandPanel" : "journal.collapsePanel")}
          aria-expanded={!historyCollapsed}
        >
          {historyCollapsed
            ? <PanelLeftOpen size={14} aria-hidden="true" />
            : <PanelLeftClose size={14} aria-hidden="true" />}
        </button>

        <div className="relative shrink-0 overflow-hidden border-b border-border p-4">
          <BookOpen
            size={17}
            className={twMerge(
              "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-accent transition-[opacity,transform] duration-300",
              historyCollapsed ? "scale-100 opacity-100 delay-200" : "scale-75 opacity-0",
            )}
            aria-hidden="true"
          />
          <div
            aria-hidden={historyCollapsed}
            className={twMerge(
              "grid transition-[grid-template-rows,opacity,transform] duration-300",
              historyCollapsed
                ? "grid-rows-[0fr] -translate-x-2 opacity-0"
                : "grid-rows-[1fr] translate-x-0 opacity-100 delay-150",
            )}
          >
            <div className="min-h-0 w-[220px] overflow-hidden">
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-subtle">{t("journal.eyebrow")}</p>
              <h1 className="mt-1 font-display text-lg font-semibold text-primary">{t("journal.title")}</h1>
              <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-subtle">{t("journal.allTime")}</p>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[10px]">
                <span className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-primary/[0.05] px-2 py-1.5 text-muted"><Route size={11} className="shrink-0 text-accent" aria-hidden="true" />{t("journal.totalExpeditions", { count: records.length })}</span>
                <span className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-primary/[0.05] px-2 py-1.5 text-muted"><Skull size={11} className="shrink-0 text-accent" aria-hidden="true" />{t("journal.totalDeaths", { count: totalDeaths })}</span>
                <span title={t("journal.allTimePlaytime")} className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-primary/[0.05] px-2 py-1.5 tabular-nums text-muted"><Timer size={11} className="shrink-0 text-accent" aria-hidden="true" />{formatDuration(totalSeconds)}</span>
                <span title={t("journal.allTimePeak")} className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-primary/[0.05] px-2 py-1.5 tabular-nums text-muted"><Mountain size={11} className="shrink-0 text-accent" aria-hidden="true" />{unitsToMeters(allTimePeak)} m</span>
              </div>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {sortedRecords.map((record) => {
            const active = record === selected;
            return <button key={recordKey(record)} type="button" onClick={() => setSelectedKey(recordKey(record))} aria-label={relativeDate(record)} title={historyCollapsed ? relativeDate(record) : undefined} className={twMerge("flex w-full cursor-pointer items-center rounded-[var(--radius-md)] py-3 text-left transition-[padding,gap,background-color,box-shadow] duration-300", historyCollapsed ? "justify-center gap-0 px-0" : "gap-3 px-3", active ? "bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-primary/[0.05]")}>
              <CalendarDays size={15} className="shrink-0 text-accent" aria-hidden="true" />
              <span className={twMerge("min-w-0 flex-1 truncate text-[12px] font-semibold text-primary transition-[max-width,opacity] duration-300", historyCollapsed ? "max-w-0 opacity-0" : "max-w-[160px] opacity-100 delay-150")}>{relativeDate(record)}</span>
              <ChevronRight size={13} className={twMerge("shrink-0 text-subtle transition-[width,opacity] duration-300", historyCollapsed ? "w-0 opacity-0" : "w-[13px] opacity-100 delay-150")} aria-hidden="true" />
            </button>;
          })}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <article className="mx-auto flex w-full max-w-[900px] flex-col gap-5 px-7 py-6">
          <header className="flex items-end gap-4 border-b border-border pb-5">
            <div className="min-w-0 flex-1"><p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-accent">{relativeDate(selected)}</p><h2 className="mt-1 font-display text-2xl font-semibold text-primary">{level?.title ?? selected.scene}</h2><p className="mt-1 text-[11px] text-subtle">{new Intl.DateTimeFormat(i18n.language, { dateStyle: "long", timeStyle: "short" }).format(new Date(selected.startedAt))}</p></div>
          </header>

          <div className="grid grid-cols-4 gap-2">
            <StatCard icon={Timer} label={t("journal.stats.playtime")} value={formatDuration(playSeconds)} />
            <StatCard icon={Mountain} label={t("journal.stats.peak")} value={`${unitsToMeters(peakElevation)} m`} />
            <StatCard icon={Skull} label={t("journal.stats.deaths")} value={selected.deaths.length} />
            <StatCard icon={Flame} label={t("journal.stats.campfires")} value={campfires || reached?.campfire.reached || 0} />
          </div>

          <section>
            <div className="flex items-center gap-1.5">
              <Mountain size={13} className="text-accent" aria-hidden="true" />
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">{t("journal.elevation")}</h3>
            </div>
            {elevationChart && <ElevationChart chart={elevationChart} />}
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">{t("journal.reached")}</h3>
            <div className="mt-2 grid grid-cols-4 gap-2">
              <div className="rounded-[var(--radius-md)] border border-border bg-surface/45 p-3"><TrendingUp size={14} className="text-accent" aria-hidden="true" /><p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-subtle">{t("journal.climbed")}</p><p className="mt-1 text-sm font-semibold tabular-nums text-primary">+{unitsToMeters(elevationChart?.gain ?? 0)}<span className="font-normal text-subtle"> m</span></p></div>
              {([
                ["luggage", Luggage], ["secret", Sparkles], ["guidebook", BookOpenText],
              ] as Array<[Exclude<ExpeditionReachCategory, "campfire" | "scout">, typeof Flame]>).map(([category, Icon]) => <div key={category} className="rounded-[var(--radius-md)] border border-border bg-surface/45 p-3"><Icon size={14} className="text-accent" aria-hidden="true" /><p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-subtle">{t(`map.categories.${category}`)}</p><p className="mt-1 text-sm font-semibold tabular-nums text-primary">{reached?.[category].reached ?? 0}<span className="font-normal text-subtle"> / {reached?.[category].total ?? 0}</span></p></div>)}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-3">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle"><Route size={13} className="text-accent" aria-hidden="true" />{t("journal.route")}</h3>
              <button
                type="button"
                onClick={() => onViewInAtlas?.(selected)}
                disabled={!level || !onViewInAtlas}
                className="ml-auto flex h-8 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-accent/45 bg-accent-soft px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary transition-[border-color,background-color,color,transform] duration-200 hover:-translate-y-px hover:border-accent hover:bg-accent/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
              >
                {t("journal.viewInAtlas")}
                <ExternalLink size={13} aria-hidden="true" />
              </button>
            </div>
            <div className="relative mt-2 h-[320px] overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface/40">
              {level && <img src={level.mapImage} alt="" className="absolute inset-0 h-full w-full object-contain opacity-60" />}
              {trailPoints && <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-label={t("journal.routeLabel")}><polyline points={trailPoints} fill="none" stroke="var(--color-accent-bright)" strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </div>
          </section>

          <section><div className="flex items-center gap-2"><h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle"><Backpack size={13} className="text-accent" aria-hidden="true" />{t("journal.collected")}</h3><span className="text-[10px] tabular-nums text-subtle">{collectedItems.reduce((total, entry) => total + entry.count, 0)}</span></div>
            {collectedItems.length ? <ul className="mt-2 grid grid-cols-2 gap-2">{collectedItems.map(({ itemId, item, count }) => <li key={itemId} className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-surface/45 px-3 py-2"><div className="grid h-8 w-8 shrink-0 place-items-center">{item?.icon ? <img src={item.icon} alt="" className="h-8 w-8 object-contain" /> : <Package size={17} className="text-subtle" aria-hidden="true" />}</div><span className="min-w-0 flex-1 truncate text-[12px] font-medium text-primary">{item ? itemName(item) : t("journal.unknownItem", { id: itemId })}</span><span className="text-[11px] font-semibold tabular-nums text-accent">×{count}</span></li>)}</ul> : <p className="mt-2 rounded-[var(--radius-md)] border border-border bg-surface/30 px-4 py-3 text-[11px] text-muted">{t("journal.noInventoryHistory")}</p>}
          </section>
        </article>
      </main>
    </section>
  );
};

export default JournalScreen;
