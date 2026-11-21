import { ArrowRight, ChevronDown, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { cn } from "../../lib/cn.ts";
import GuideItemLink from "./guide-item-link.tsx";
import { useGuideNavigation } from "./guide-navigation-context.ts";
import type { RecipeSubjectDisplay } from "./recipe-subject-display.ts";
import type { KnowledgeMechanicRecord, KnowledgeSubjectRef } from "./mechanics-types.ts";
import { tradeOfferDirection, type TradeGuideEntry, type TradeOfferDirection } from "./trade-guide-data.ts";

const OfferItem = ({ item, display, t }: { item: KnowledgeSubjectRef; display: RecipeSubjectDisplay; t: TFunction }) => {
  const count = item.count;
  return <div className="flex min-w-0 items-center gap-2">
    <GuideItemLink id={item.id} display={display} quantity={count && count.min === count.max ? count.min : undefined} />
    {count && count.min !== count.max && <span className="shrink-0 text-[11px] text-subtle">
      {t("inspector.quantityRange", count)}
    </span>}
  </div>;
};

const TradeOfferRow = ({ offer, display, t, showDetails = false }: { offer: KnowledgeMechanicRecord;
  display: RecipeSubjectDisplay; t: TFunction; showDetails?: boolean }) => {
  const navigate = useGuideNavigation();
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] items-center gap-3 border-b border-border/70 py-3 last:border-b-0">
  <div className="min-w-0 space-y-1">{offer.inputs.map((item, index) =>
    <OfferItem key={`${offer.id}:input:${index}`} item={item} display={display} t={t} />)}</div>
  <ArrowRight size={16} className="text-accent" aria-hidden="true" />
  <div className="min-w-0">
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">{offer.outputs.map((item, index) =>
        <OfferItem key={`${offer.id}:output:${index}`} item={item} display={display} t={t} />)}</div>
      {showDetails && <button type="button" onClick={() => navigate({ kind: "mechanic", id: offer.id })}
        className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-medium text-accent hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {t("inspector.details")} <ChevronRight size={13} aria-hidden="true" />
      </button>}
    </div>
    {(offer.trade?.maxUses || offer.trade?.experience) && <p className="text-[10px] leading-4 text-subtle">
      {[offer.trade.maxUses ? t("inspector.tradeGuide.stock", { count: offer.trade.maxUses }) : null,
        offer.trade.experience ? t("inspector.tradeExperience", { count: offer.trade.experience }) : null]
        .filter(Boolean).join(" · ")}
    </p>}
  </div>
</div>;
};

const levelKey = (level: number | null) => level === null ? "offers" : String(level);

export const TradeOfferList = ({ entry, display, t }: { entry: TradeGuideEntry;
  display: RecipeSubjectDisplay; t: TFunction }) => {
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<TradeOfferDirection>("all");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set([entry.wandering ? "offers" : "1"]));
  const [limits, setLimits] = useState<Readonly<Record<string, number>>>({});
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return entry.offers.filter(offer => (direction === "all" || tradeOfferDirection(offer) === direction)
      && (!needle || [...offer.inputs, ...offer.outputs].some(item =>
        display(item.kind, item.id).name.toLocaleLowerCase().includes(needle))));
  }, [entry, direction, query, display]);
  const groups = useMemo(() => {
    const values = new Map<number | null, KnowledgeMechanicRecord[]>();
    for (const offer of filtered) {
      const level = entry.wandering ? null : offer.trade?.level ?? null;
      const group = values.get(level) ?? [];
      group.push(offer);
      values.set(level, group);
    }
    return [...values].sort(([left], [right]) => (left ?? 0) - (right ?? 0));
  }, [filtered, entry.wandering]);
  return <div className="max-w-[760px]">
    <div className="flex items-center gap-2 border-y border-border/70 py-3">
      <div className="relative min-w-0 flex-1">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <input type="search" aria-label={t("inspector.tradeGuide.search")} placeholder={t("inspector.tradeGuide.search")}
          value={query} onChange={event => setQuery(event.target.value)}
          className="w-full rounded-[var(--radius-sm)] border border-border bg-surface py-2 pl-8 pr-2 text-[12px] text-zinc-100 outline-none placeholder:text-subtle focus:border-accent" />
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-subtle">
        {t("inspector.tradeGuide.showing", { shown: filtered.length, total: entry.offers.length })}
      </span>
    </div>
    <div className="flex flex-wrap gap-1 border-b border-border/70 py-2" role="group" aria-label={t("inspector.tradeGuide.filter")}>
      {(["all", "spend", "earn"] as const).map(option => <button key={option} type="button"
        aria-pressed={direction === option} onClick={() => {
          setDirection(option);
          const first = entry.offers.find(offer => option === "all" || tradeOfferDirection(offer) === option);
          setExpanded(new Set(first ? [entry.wandering ? "offers" : levelKey(first.trade?.level ?? null)] : []));
        }}
        className={cn("cursor-pointer rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[11px] font-medium transition-colors",
          direction === option ? "bg-accent-soft text-accent" : "text-subtle hover:bg-surface-hover hover:text-zinc-100")}>
        {t(`inspector.tradeGuide.directions.${option}`)}
      </button>)}
    </div>
    {!groups.length && <p className="py-5 text-[12px] text-subtle">{t("inspector.tradeGuide.noMatches")}</p>}
    {groups.map(([level, offers]) => {
      const key = levelKey(level), open = Boolean(query.trim()) || expanded.has(key);
      const visible = offers.slice(0, limits[key] ?? 8);
      return <section key={key} className="border-b border-border/70">
        <button type="button" aria-expanded={open} onClick={() => setExpanded(current => {
          const next = new Set(current);
          if (next.has(key)) next.delete(key); else next.add(key);
          return next;
        })} className="flex w-full cursor-pointer items-center justify-between gap-3 py-3 text-left">
          <span className="text-[12px] font-semibold text-zinc-100">
            {level && level <= 5 ? t(`inspector.tradeLevels.${level}`) : t("inspector.tradeOffers")}
            <span className="ml-2 text-[11px] font-normal tabular-nums text-subtle">{offers.length}</span>
          </span>
          <ChevronDown size={15} className={cn("text-subtle transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
        {open && <div className="border-t border-border/70">
          {visible.map(offer => <TradeOfferRow key={offer.id} offer={offer} display={display} t={t} showDetails />)}
          {offers.length > visible.length && <button type="button"
            onClick={() => setLimits(current => ({ ...current, [key]: (current[key] ?? 8) + 12 }))}
            className="my-2 w-full cursor-pointer rounded-[var(--radius-sm)] border border-border py-2 text-[11px] font-semibold text-zinc-200 hover:border-accent/40 hover:text-white">
            {t("inspector.tradeGuide.more", { count: offers.length - visible.length })}
          </button>}
        </div>}
      </section>;
    })}
  </div>;
};

export const TradeOfferPreview = ({ offer, display, t }: { offer: KnowledgeMechanicRecord;
  display: RecipeSubjectDisplay; t: TFunction }) => <div className="max-w-[760px] border-y border-border/70">
  <TradeOfferRow offer={offer} display={display} t={t} />
</div>;
