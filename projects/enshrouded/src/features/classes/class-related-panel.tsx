import { ChevronRight } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import ItemIcon from "../database/item-icon";
import { useItemCatalog } from "../database/use-item-catalog";
import type { DatabaseItem } from "../database/item-database-types";
import { useProfessionCatalog } from "../professions/use-profession-catalog";
import type { GameClass } from "./class-types";

type RelatedView = "sets" | "items" | "trainers" | "recipes";

const ClassRelatedPanel = ({ entry }: { entry: GameClass }) => {
  const { t, i18n } = useTranslation();
  const openReference = useReferenceNavigation();
  const itemState = useItemCatalog();
  const professionState = useProfessionCatalog();
  const [view, setView] = useState<RelatedView>("sets");
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const panelId = useId();
  const setItems = useMemo(() => {
    const result = new Map<string, DatabaseItem[]>();
    if (itemState.status !== "ready") return result;
    const visible = new Set(entry.related.sets.preview.map((set) => set.id));
    for (const item of itemState.catalog.items) for (const set of item.itemSets ?? []) if (visible.has(set.id)) {
      const members = result.get(set.id) ?? [];
      members.push(item);
      result.set(set.id, members);
    }
    return result;
  }, [entry.related.sets.preview, itemState]);
  const professionLinks = useMemo(() => professionState.status === "ready"
    ? professionState.catalog.professions.map((profession) => ({ profession,
      count: profession.recipes.filter((recipe) => recipe.classes?.includes(entry.name)).length })).filter((link) => link.count)
    : [], [entry.name, professionState]);
  const trainers = entry.related.trainers.preview;
  const trainerGroups = useMemo(() => {
    const groups = new Map<string, typeof trainers>();
    for (const trainer of trainers) {
      const group = groups.get(trainer.location) ?? [];
      group.push(trainer);
      groups.set(trainer.location, group);
    }
    return [...groups.entries()];
  }, [trainers]);
  const views = ([
    { id: "sets", count: entry.related.sets.preview.length },
    { id: "items", count: entry.related.exclusiveItems.preview.length },
    { id: "trainers", count: entry.related.trainers.preview.length },
    ...(professionLinks.length ? [{ id: "recipes" as const, count: professionLinks.length }] : []),
  ] as const);
  const selectedSet = entry.related.sets.preview.find((set) => set.id === selectedSetId) ?? entry.related.sets.preview[0];
  const selectedSetItems = selectedSet ? setItems.get(selectedSet.id) ?? [] : [];

  return <div className="space-y-5">
    <div><h3 className="font-display text-lg font-semibold text-white">{t("classes.tabs.gear")}</h3>
      <p className="mt-1 max-w-[660px] text-[12px] leading-5 text-zinc-300">{t("classes.gearIntro")}</p></div>
    <div className="flex max-w-full gap-5 overflow-x-auto border-b border-border" role="tablist" aria-label={t("classes.tabs.gear")}
      onKeyDown={(event) => {
        const current = views.findIndex((candidate) => candidate.id === view);
        const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? (current + 1) % views.length
          : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (current - 1 + views.length) % views.length
            : event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        setView(views[next].id);
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }}>
      {views.map(({ id, count }) => <button key={id} id={`${panelId}-${id}`} type="button" role="tab" aria-selected={view === id}
        aria-controls={`${panelId}-panel`} tabIndex={view === id ? 0 : -1} onClick={() => setView(id)}
        className={cn("shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-0.5 pb-3 pt-1 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent",
          view === id ? "border-accent font-semibold text-white" : "border-transparent text-zinc-300 hover:text-white")}>
        {t(`classes.gearView.${id}`)} <span className="ml-1 text-[11px] tabular-nums text-subtle">{count.toLocaleString(i18n.language)}</span>
      </button>)}
    </div>
    <div id={`${panelId}-panel`} role="tabpanel" aria-labelledby={`${panelId}-${view}`} tabIndex={0} className="min-w-0 focus-visible:outline-2 focus-visible:outline-accent">
      {view === "sets" && <section aria-label={t("classes.equipmentSets")} className="@container">
        <SectionHeader title={t("classes.equipmentSets")} detail={t("classes.showingOf", { shown: entry.related.sets.preview.length, total: entry.related.sets.count })} />
        <div className="grid min-w-0 gap-3 @min-[700px]:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <div className="scroll-slim max-h-56 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface @min-[700px]:max-h-none @min-[700px]:overflow-visible" role="group" aria-label={t("classes.equipmentSets")}>
            {entry.related.sets.preview.map((set) => <button key={set.id} type="button" aria-pressed={selectedSet?.id === set.id}
              onClick={() => setSelectedSetId(set.id)}
              className={cn("flex w-full min-w-0 cursor-pointer items-center gap-2 border-b border-border px-3 py-2.5 text-left last:border-b-0 transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                selectedSet?.id === set.id ? "bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-surface-hover")}>
              <span className="min-w-0 flex-1"><span className={cn("block truncate text-[12px] font-medium", selectedSet?.id === set.id ? "text-white" : "text-zinc-200")}>{set.name}</span>
                <span className="mt-0.5 block text-[11px] text-subtle">{t("database.clientItem.itemLevel")} {set.level} · {t("classes.setPieces", { count: set.pieces })}</span></span>
              {set.new && <span className="shrink-0 text-[10px] font-semibold text-accent">{t("classes.newSet")}</span>}
            </button>)}
          </div>
          {selectedSet && <div className="min-w-0 self-start rounded-[var(--radius-md)] border border-border bg-surface p-3.5 @min-[700px]:p-4">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-border pb-3">
              <div className="min-w-0"><h5 className="text-[14px] font-semibold text-white" aria-live="polite">{selectedSet.name}</h5>
                <p className="mt-1 text-[11px] text-zinc-300">{t("database.clientItem.itemLevel")} {selectedSet.level} · {t("classes.setPieces", { count: selectedSet.pieces })}</p></div>
              {selectedSet.new && <span className="text-[10px] font-semibold text-accent">{t("classes.newSet")}</span>}
            </div>
            <p className="py-3 text-[11px] text-subtle">{t("classes.linkedSetItems", { shown: selectedSetItems.length, total: selectedSet.pieces })}</p>
            {selectedSetItems.length ? <div className="grid @min-[700px]:grid-cols-2 @min-[700px]:gap-x-4">{selectedSetItems.map((item) => <button key={item.id} type="button" onClick={() => openReference({ category: "items", id: item.id, name: item.name })}
              className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 border-b border-border py-2 text-left text-[12px] text-zinc-100 transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
              <ItemIcon icon={item.icon} name={item.name} size={30} /><span className="min-w-0 flex-1 truncate">{item.name}</span><ChevronRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />
            </button>)}</div> : <p className="text-[11px] text-zinc-300">{t("classes.noLinkedSetItems")}</p>}
          </div>}
        </div>
      </section>}
      {view === "items" && <section aria-label={t("classes.exclusiveItems")}>
        <SectionHeader title={t("classes.exclusiveItems")} detail={t("classes.showingOf", { shown: entry.related.exclusiveItems.preview.length, total: entry.related.exclusiveItems.count })} />
        <div className="grid gap-2 @min-[640px]:grid-cols-2">{entry.related.exclusiveItems.preview.map((item) => <button key={item.id} type="button" onClick={() => openReference({ category: "items", id: item.id, name: item.name })}
          className="flex min-w-0 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-3 text-left transition-colors hover:border-accent/50 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent">
          <ItemIcon icon={item.icon} name={item.name} size={38} /><span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold leading-5 text-white">{item.name}</span><span className="mt-0.5 block text-[11px] text-zinc-300">{item.slot} · {t("database.clientItem.itemLevel")} {item.level}</span></span><ChevronRight size={15} className="shrink-0 text-accent" aria-hidden="true" />
        </button>)}</div>
      </section>}
      {view === "trainers" && <section aria-label={t("classes.trainers")}>
        <SectionHeader title={t("classes.trainers")} detail={t("classes.showingOf", { shown: entry.related.trainers.preview.length, total: entry.related.trainers.count })} />
        <div className="grid items-start gap-3 @min-[640px]:grid-cols-2">{trainerGroups.map(([location, trainers]) => <div key={location} className="rounded-[var(--radius-md)] border border-border bg-surface p-3.5">
          <h5 className="flex items-center gap-2 border-b border-border pb-2.5 text-[12px] font-semibold text-accent">{location}</h5>
          <ul className="divide-y divide-border/70">{trainers.map((trainer) => <li key={trainer.id} className="py-2.5 text-[12px] text-zinc-100">{trainer.name}</li>)}</ul>
        </div>)}</div>
      </section>}
      {view === "recipes" && <section aria-label={t("classes.professionRecipes")}>
        <SectionHeader title={t("classes.professionRecipes")} detail={professionLinks.length.toLocaleString(i18n.language)} />
        <div className="grid gap-2 @min-[640px]:grid-cols-2">{professionLinks.map(({ profession, count }) => <button key={profession.id} type="button" onClick={() => openReference({ category: "professions", id: profession.id, name: profession.name, group: `class:${entry.id}` })}
          className="flex min-w-0 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-3 text-left transition-colors hover:border-accent/50 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent">
          {profession.icon && <ItemIcon icon={profession.icon} name={profession.name} size={38} />}<span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold text-white">{profession.name}</span><span className="mt-0.5 block text-[11px] text-zinc-300">{t("classes.professionRecipeCount", { count })}</span></span><ChevronRight size={15} className="shrink-0 text-accent" aria-hidden="true" />
        </button>)}</div>
      </section>}
    </div>
  </div>;
};

const SectionHeader = ({ title, detail }: { title: string; detail: string }) => <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-3">
  <h4 className="text-[13px] font-semibold text-white">{title}</h4><span className="text-[11px] text-subtle">{detail}</span>
</div>;

export default ClassRelatedPanel;
