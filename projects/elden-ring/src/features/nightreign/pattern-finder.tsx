import * as RD from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Crosshair, MapPin, Mountain, Sparkles, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { getPortalRoot } from "../../lib/portal";
import { nrShiftingEarths } from "../../data/nightreign-data";
import { parseNrEvent } from "../../data/nightreign-events";
import { useMapExperience } from "../map-experience/map-experience";
import { AMBER, EVENT_FALLBACK_ICON, EVENT_ICON } from "./event-chip";

const ANY = "__any__";

interface FilterOption {
  value: string;
  label: string;
  /** Optional leading icon for the menu item (events carry their own). */
  icon?: LucideIcon;
  iconColor?: string;
  /** Optional trailing pill, e.g. the event's "D1"/"D2" day. */
  badge?: string;
}

/** Small amber day pill, matching the seed-bar EventChip's "D1"/"D2" affordance. */
const DayBadge = ({ children }: { children: string }) => (
  <span
    className="shrink-0 rounded-[var(--radius-full)] px-1.5 py-px text-[9px] font-semibold tracking-wide"
    style={{ backgroundColor: `${AMBER}26`, color: "#f5d9a8" }}
  >
    {children}
  </span>
);

/**
 * One observation filter, as a compact dropdown rather than a wrapping chip wall.
 * Reuses the app's shared dropdown chrome (border + surface + accent focus) so the
 * Finder reads like every other picker; the calm input keeps the candidate list the
 * visible protagonist of the panel.
 */
const FilterSelect = ({
  label,
  triggerIcon: TriggerIcon,
  options,
  value,
  onChange,
}: {
  label: string;
  triggerIcon: LucideIcon;
  options: FilterOption[];
  value: string;
  onChange: (v: string) => void;
}) => {
  const sel = options.find((o) => o.value === value) ?? options[0];
  const SelIcon = sel?.icon ?? TriggerIcon;
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        <TriggerIcon size={12} aria-hidden="true" />
        {label}
      </p>
      <RD.Root>
        <RD.Trigger className="group flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-border bg-white/[0.03] px-2.5 py-1.5 text-[12.5px] text-zinc-100 outline-none transition-colors hover:bg-white/[0.06] focus-visible:border-accent cursor-pointer">
          <SelIcon
            size={14}
            aria-hidden="true"
            className={`shrink-0 ${sel?.iconColor ? "" : "text-zinc-400"}`}
            style={sel?.iconColor ? { color: sel.iconColor } : undefined}
          />
          <span className="min-w-0 flex-1 truncate text-left font-medium">{sel?.label}</span>
          {sel?.badge && <DayBadge>{sel.badge}</DayBadge>}
          <ChevronDown
            size={13}
            aria-hidden="true"
            className="shrink-0 text-zinc-500 transition-colors group-hover:text-zinc-300"
          />
        </RD.Trigger>
        <RD.Portal container={getPortalRoot()}>
          <RD.Content
            align="start"
            sideOffset={5}
            style={{ width: "var(--radix-dropdown-menu-trigger-width)" }}
            className="z-[1600] max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-xl shadow-black/50 animate-fade-in"
          >
            {options.map((o) => {
              const selected = o.value === value;
              const Icon = o.icon;
              return (
                <RD.Item
                  key={o.value}
                  onSelect={() => onChange(o.value)}
                  className={`flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12.5px] outline-none transition-colors data-[highlighted]:bg-surface-hover ${
                    selected ? "text-white" : "text-zinc-300"
                  }`}
                >
                  <span className="grid w-3.5 shrink-0 place-items-center">
                    {selected && <Check size={12} className="text-accent" aria-hidden="true" />}
                  </span>
                  {Icon && (
                    <Icon
                      size={13}
                      aria-hidden="true"
                      className="shrink-0"
                      style={o.iconColor ? { color: o.iconColor } : undefined}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.badge && <DayBadge>{o.badge}</DayBadge>}
                </RD.Item>
              );
            })}
          </RD.Content>
        </RD.Portal>
      </RD.Root>
    </div>
  );
};

/**
 * Pattern Finder — the practical way to use the map when you don't know your run's pattern.
 * You pick what you can already see at the start of an expedition (spawn point, the special
 * event) within the chosen Nightlord + Shifting Earth, and it narrows the matching patterns
 * live; spawn + event alone resolve most runs to a handful, and you pick yours from the
 * short candidate list (read off the night bosses) to reveal the whole map.
 */
const PatternFinder = () => {
  const { t } = useTranslation();
  const { matchingPatterns, nightlord, shiftingEarth, patternIndex, selectPattern, setSeed } = useMapExperience();
  const [spawn, setSpawn] = useState(ANY);
  const [event, setEvent] = useState(ANY);

  // Shifting Earth is a SEED choice (it reshapes the whole candidate set), so it leads the
  // panel rather than cluttering the resting bar.
  const earthOptions = useMemo<FilterOption[]>(
    () =>
      nrShiftingEarths.map((e) => ({ value: e, label: e === "Default" ? t("nightreign.noShiftingEarth") : e })),
    [t],
  );

  const spawns = useMemo(
    () => [...new Set(matchingPatterns.map((p) => p.spawn).filter((s) => s && s !== "empty"))].sort(),
    [matchingPatterns],
  );
  const events = useMemo(
    () => [...new Set(matchingPatterns.map((p) => p.specialEvent))].sort((a, b) => (a === "empty" ? -1 : a.localeCompare(b))),
    [matchingPatterns],
  );

  // Carry each candidate's index in matchingPatterns so a pick maps straight to selectPattern.
  const candidates = useMemo(
    () =>
      matchingPatterns
        .map((p, index) => ({ p, index }))
        .filter(({ p }) => (spawn === ANY || p.spawn === spawn) && (event === ANY || p.specialEvent === event)),
    [matchingPatterns, spawn, event],
  );

  const spawnOptions = useMemo<FilterOption[]>(
    () => [{ value: ANY, label: t("nightreign.anySpawnPoint"), icon: MapPin }, ...spawns.map((s) => ({ value: s, label: s }))],
    [spawns, t],
  );
  const eventOptions = useMemo<FilterOption[]>(
    () => [
      { value: ANY, label: t("nightreign.anyEvent"), icon: Sparkles },
      ...events.map((e) => {
        if (e === "empty") return { value: e, label: t("nightreign.noEvent") };
        const ev = parseNrEvent(e);
        return {
          value: e,
          label: ev?.name ?? e,
          icon: (ev && EVENT_ICON[ev.name]) || EVENT_FALLBACK_ICON,
          iconColor: AMBER,
          badge: ev?.day ? `D${ev.day}` : undefined,
        };
      }),
    ],
    [events, t],
  );

  const filtersActive = spawn !== ANY || event !== ANY;
  const resetFilters = () => {
    setSpawn(ANY);
    setEvent(ANY);
  };

  return (
    <RD.Root>
      <RD.Trigger asChild>
        {/* Compact on a phone: this shares the toolbar row with the game pills,
            the Nightlord picker and three action buttons, and as a full-size
            accent pill it took more of that row than any of them. Tighter
            padding, smaller type and a smaller glyph on touch; the desktop pill
            is unchanged from `sm` up. */}
        <button className="flex h-8 items-center gap-1.5 rounded-[var(--radius-full)] bg-accent px-3 text-[12px] font-semibold text-on-accent shadow-lg shadow-accent/30 outline-none transition-[background-color,transform] hover:bg-accent/90 active:scale-[0.98] cursor-pointer sm:h-9 sm:gap-2 sm:px-4 sm:text-[13px]">
          <Crosshair size={16} aria-hidden="true" className="max-sm:h-3.5 max-sm:w-3.5" />
          {t("nightreign.findPattern")}
        </button>
      </RD.Trigger>

      <RD.Portal container={getPortalRoot()}>
        <RD.Content
          align="start"
          sideOffset={6}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="z-[1400] w-[min(21.25rem,calc(100vw-1.5rem))] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl shadow-black/60 animate-fade-in"
        >
          <div className="border-b border-border px-3.5 pb-3 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">{t("nightreign.findYourPattern")}</p>
            <p className="mt-0.5 text-[12px] text-zinc-400">
              <Trans
                i18nKey="nightreign.nightlordLayouts"
                values={{ nightlord, n: matchingPatterns.length }}
                components={{
                  nl: <span className="text-zinc-200" />,
                  num: <span className="tabular-nums" />,
                }}
              />
            </p>
            <div className="mt-2.5">
              <FilterSelect
                label={t("nightreign.shiftingEarth")}
                triggerIcon={Mountain}
                options={earthOptions}
                value={shiftingEarth}
                onChange={(v) => setSeed({ shiftingEarth: v })}
              />
            </div>
          </div>

          <div className="space-y-3 px-3.5 py-3">
            <FilterSelect label={t("nightreign.spawnPoint")} triggerIcon={MapPin} options={spawnOptions} value={spawn} onChange={setSpawn} />
            <FilterSelect label={t("nightreign.specialEventLabel")} triggerIcon={Sparkles} options={eventOptions} value={event} onChange={setEvent} />
          </div>

          <div className="border-t border-border">
            <div className="flex items-center justify-between px-3.5 pb-1.5 pt-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {candidates.length === 1
                  ? t("nightreign.foundYourPattern")
                  : t("nightreign.candidatesCount", { n: candidates.length })}
              </p>
              {filtersActive && (
                <button
                  onClick={resetFilters}
                  className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 transition-colors hover:text-accent cursor-pointer"
                >
                  {t("nightreign.reset")}
                </button>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto px-1.5 pb-2">
              {candidates.map(({ p, index }) => {
                const ev = parseNrEvent(p.specialEvent);
                const active = index === patternIndex;
                return (
                  <button
                    key={p.layout}
                    onClick={() => selectPattern(index)}
                    className={`flex w-full items-start gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                      active ? "bg-accent-soft" : "hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className="grid w-4 shrink-0 place-items-center pt-0.5">
                      {active && <Check size={13} className="text-accent" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-100">
                        {t("nightreign.patternLabel", { layout: p.layout })}
                        {ev && <span className="text-[10px] text-amber-300/80">{ev.name}</span>}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500">
                        <span className="block truncate">
                          <span className="text-subtle">{t("nightreign.night1Short")}</span> {p.night1Boss}
                        </span>
                        <span className="block truncate">
                          <span className="text-subtle">{t("nightreign.night2Short")}</span> {p.night2Boss}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
              {candidates.length === 0 && (
                <p className="px-2.5 py-4 text-center text-[12px] text-zinc-500">
                  {t("nightreign.noLayoutMatches")}
                </p>
              )}
            </div>
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
};

export default PatternFinder;
