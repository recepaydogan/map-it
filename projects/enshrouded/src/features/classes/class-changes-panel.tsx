import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import SpellLink from "../spells/spell-link";
import type { ClientEntry, EraEntry } from "./use-class-changes";
import { useClassChanges } from "./use-class-changes";

const Entry = ({ children }: { children: ReactNode }) => <div className="min-w-0 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2.5 text-[12px] leading-5 text-zinc-300">{children}</div>;

const Section = ({ id, title, count, note, children }: { id: string; title: string; count: number; note?: string; children: ReactNode }) => count > 0 ? <section id={id} className="scroll-mt-5 space-y-2">
  <div className="flex items-baseline gap-2 border-b border-border pb-2"><h3 className="font-display text-lg font-semibold text-white">{title}</h3><span className="text-[11px] tabular-nums text-subtle">{count}</span></div>
  {note && <p className="max-w-[80ch] text-[11px] leading-5 text-subtle">{note}</p>}
  <div className="grid gap-2">{children}</div>
</section> : null;

const Label = ({ children }: { children: ReactNode }) => <span className="text-[10px] font-semibold uppercase tracking-wider text-subtle">{children}</span>;

const Current = ({ id, name }: { id?: number; name: string }) => id ? <SpellLink id={id} name={name} /> : <span className="font-medium text-white">{name}</span>;

const Old = ({ value }: { value: EraEntry }) => <span className="font-medium text-zinc-100">{value.n}</span>;

const Shift = ({ old, current }: { old: ReactNode; current: ReactNode }) => <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"><span>{old}</span><ArrowRight size={13} className="shrink-0 text-accent" aria-hidden="true" /><span>{current}</span></div>;

const TalentContext = ({ value, current = false }: { value: ClientEntry; current?: boolean }) => {
  const { t } = useTranslation();
  const tree = current ? value.ftree : value.tree;
  const tier = current ? value.ftier : value.tier;
  return tree ? <span className="ml-1 text-[11px] text-subtle">{t("classGuide.changes.treeTier", { tree, tier })}</span> : null;
};

const ClassChangesPanel = ({ classId }: { classId: string }) => {
  const { t } = useTranslation();
  const { data, error } = useClassChanges(classId);
  const [query, setQuery] = useState("");
  const filteredTooltips = useMemo(() => data?.tooltipChanges.filter((row) => `${row.n} ${row.r}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [], [data, query]);
  if (!data) return <p role={error ? "alert" : "status"} className="rounded-[var(--radius-md)] border border-border bg-surface p-5 text-[12px] text-subtle">{t(error ? "classGuide.changes.loadError" : "classes.loading")}</p>;

  const renamed = data.abilitiesChanged.filter((row) => row.n !== row.fn);
  const changedLevels = data.abilitiesChanged.filter((row) => row.levels?.length || row.ranksAdded?.length || row.ranksRemoved?.length);
  const talentCount = data.talentsReplaced.length + data.talentsBaseline.length + data.talentsMoved.length + data.talentRanksChanged.length + data.abilitiesNowTalent.length;
  const sections = [
    ["removed", data.abilitiesRemoved.length + data.talentsRemoved.length],
    ["notTaught", data.abilitiesInClientNotTaught.length + data.abilitiesNotTrained.length],
    ["merged", data.abilitiesMerged.length + renamed.length],
    ["levels", changedLevels.length], ["talents", talentCount], ["hidden", data.talentsHidden.length],
    ["proficiency", data.proficiency.length], ["coefficients", data.coefficientChanges.length], ["tooltips", data.tooltipChanges.length],
  ] as const;
  const target = (key: string) => `${classId}-changes-${key}`;

  return <div className="space-y-7">
    <header className="rounded-[var(--radius-lg)] border border-accent/25 bg-elevated p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">{t("classGuide.changes.eyebrow")}</p>
      <h3 className="mt-1 font-display text-xl font-semibold text-white">{t("classGuide.changes.title")}</h3>
      <p className="mt-2 max-w-[80ch] text-[12px] leading-6 text-zinc-300">{t("classGuide.changes.context")}</p>
      <nav aria-label={t("classGuide.changes.jumpTo")} className="mt-4 flex flex-wrap gap-1.5">{sections.filter(([, count]) => count > 0).map(([key, count]) => <button key={key} type="button" onClick={() => document.getElementById(target(key))?.scrollIntoView({ behavior: "smooth", block: "start" })} className="cursor-pointer rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-1.5 text-[11px] text-zinc-200 hover:border-accent/50 hover:text-white focus-visible:outline-2 focus-visible:outline-accent"><b className="mr-1 tabular-nums text-accent">{count}</b>{t(`classGuide.changes.${key}`)}</button>)}</nav>
    </header>

    <Section id={target("removed")} title={t("classGuide.changes.removed")} count={data.abilitiesRemoved.length + data.talentsRemoved.length} note={t("classGuide.changes.removedNote")}>
      {[...data.abilitiesRemoved.map((value) => ({ value, kind: "ability" as const })), ...data.talentsRemoved.map((value) => ({ value, kind: "talent" as const }))].map(({ value, kind }, index) => <Entry key={`${kind}-${value.id}-${index}`}><div className="flex flex-wrap items-center gap-x-2"><Old value={value} /><span className="text-[11px] text-subtle">{t(`classGuide.changes.${kind}`)}{value.lv ? ` · ${t("classes.level", { level: value.lv })}` : ""}{value.tree ? ` · ${t("classGuide.changes.treeTier", { tree: value.tree, tier: value.tier })}` : ""}</span></div>{value.era && <p className="mt-1 text-zinc-300">{value.era}</p>}</Entry>)}
    </Section>

    <Section id={target("notTaught")} title={t("classGuide.changes.notTaught")} count={data.abilitiesInClientNotTaught.length + data.abilitiesNotTrained.length} note={t("classGuide.changes.notTaughtNote")}>
      {data.abilitiesInClientNotTaught.map((value, index) => <Entry key={`client-${value.id}-${index}`}><Current id={value.id} name={value.n} /><p className="mt-1 text-subtle">{t("classGuide.changes.inClientOnly")}{value.lv ? ` · ${t("classes.level", { level: value.lv })}` : ""}</p></Entry>)}
      {data.abilitiesNotTrained.map((value, index) => <Entry key={`not-trained-${value.fid}-${index}`}><Current id={value.fid} name={value.fn ?? value.n} /><p className="mt-1 text-subtle">{t(value.now === "sod" ? "classGuide.changes.runeOnly" : "classGuide.changes.notTrainer")}</p></Entry>)}
    </Section>

    <Section id={target("merged")} title={t("classGuide.changes.merged")} count={data.abilitiesMerged.length + renamed.length}>
      {data.abilitiesMerged.map((value) => <Entry key={`merged-${value.fid}`}><Shift old={value.from.join(", ")} current={<Current id={value.fid} name={value.fn} />} /><p className="mt-1 text-subtle">{t("classGuide.changes.mergedRanks", { count: value.franks })}</p></Entry>)}
      {renamed.map((value, index) => <Entry key={`renamed-${value.fid}-${index}`}><Shift old={value.n} current={<Current id={value.fid} name={value.fn ?? value.n} />} /><p className="mt-1 text-subtle">{t("classGuide.changes.renamedNote")}</p></Entry>)}
    </Section>

    <Section id={target("levels")} title={t("classGuide.changes.levels")} count={changedLevels.length} note={t("classGuide.changes.levelsNote")}>
      {changedLevels.map((value, index) => <Entry key={`level-${value.fid}-${index}`}><Current id={value.fid} name={value.fn ?? value.n} /><ul className="mt-1 space-y-0.5 text-zinc-300">{value.levels?.map(([rank, before, after], rankIndex) => <li key={rankIndex}>{t("classGuide.changes.learnLevel", { rank: rank || t("classGuide.changes.learned"), before, after })}</li>)}{value.ranksAdded?.map((rank) => <li key={`add-${rank}`}>{t("classGuide.changes.rankAdded", { rank })}</li>)}{value.ranksRemoved?.map((rank) => <li key={`remove-${rank}`}>{t("classGuide.changes.rankRemoved", { rank })}</li>)}</ul></Entry>)}
    </Section>

    <Section id={target("talents")} title={t("classGuide.changes.talents")} count={talentCount} note={t("classGuide.changes.talentsNote")}>
      {data.talentsReplaced.map((value, index) => <Entry key={`replace-${value.id}-${index}`}><Shift old={<><Old value={value} /><TalentContext value={value} /></>} current={<><Current id={value.fid} name={value.fn ?? value.n} /><TalentContext value={value} current /></>} /><p className="mt-1 text-subtle">{t(value.sameSpell ? "classGuide.changes.reworkedTalent" : "classGuide.changes.replacedTalent")}</p>{value.baseline && <p className="mt-1">{t("classGuide.changes.baseline", { name: value.n })} <Current id={value.baseline.fid} name={value.n} />{value.baseline.flv ? ` · ${t("classes.level", { level: value.baseline.flv })}` : ""}</p>}</Entry>)}
      {data.talentsBaseline.map((value, index) => <Entry key={`baseline-${value.id}-${index}`}><Shift old={<Old value={value} />} current={<Current id={value.fid} name={value.fn ?? value.n} />} /><p className="mt-1 text-subtle">{t("classGuide.changes.nowBaseline")}{value.flv ? ` · ${t("classes.level", { level: value.flv })}` : ""}</p></Entry>)}
      {data.talentsMoved.map((value, index) => <Entry key={`moved-${value.id}-${index}`}><Shift old={<><Old value={value} /><TalentContext value={value} /></>} current={<><Current id={value.fid} name={value.fn ?? value.n} /><TalentContext value={value} current /></>} /></Entry>)}
      {data.talentRanksChanged.map((value, index) => <Entry key={`rank-${value.id}-${index}`}><Current id={value.fid} name={value.fn ?? value.n} /><p className="mt-1 text-subtle">{t("classGuide.changes.rankCount", { before: value.ranks, after: value.franks })}</p></Entry>)}
      {data.abilitiesNowTalent.map((value, index) => <Entry key={`talent-${value.id}-${index}`}><Shift old={<Old value={value} />} current={<Current id={value.fid} name={value.fn ?? value.n} />} /><p className="mt-1 text-subtle">{t("classGuide.changes.nowTalent", { level: value.talentLv })}<TalentContext value={value} current /></p></Entry>)}
    </Section>

    <Section id={target("hidden")} title={t("classGuide.changes.hidden")} count={data.talentsHidden.length} note={t("classGuide.changes.hiddenNote")}>
      {data.talentsHidden.map((value, index) => <Entry key={`hidden-${value.id}-${index}`}><Old value={value} /><span className="ml-2 text-subtle">{t("classGuide.changes.treeTier", { tree: value.tree, tier: value.tier })}</span>{value.era && <p className="mt-1">{value.era}</p>}</Entry>)}
    </Section>

    <Section id={target("proficiency")} title={t("classGuide.changes.proficiency")} count={data.proficiency.length}>
      {data.proficiency.map((value, index) => <Entry key={`${value.skill}-${index}`}><span className="font-medium text-white">{value.skill}</span><p className="mt-1 text-subtle">{t(`classGuide.changes.proficiency_${value.change}`, { before: value.old, after: value.lv, level: value.lv })}</p></Entry>)}
    </Section>

    <Section id={target("coefficients")} title={t("classGuide.changes.coefficients")} count={data.coefficientChanges.length} note={t("classGuide.changes.coefficientsNote")}>
      {data.coefficientChanges.map((value, index) => <Entry key={`${value.id}-${index}`}><Current id={value.id} name={value.n} /><span className="ml-2 text-subtle">{value.r}</span><p className="mt-1 tabular-nums">{t("classGuide.changes.valueShift", { before: value.old, after: value.new })}</p></Entry>)}
    </Section>

    <Section id={target("tooltips")} title={t("classGuide.changes.tooltips")} count={data.tooltipChanges.length} note={t("classGuide.changes.tooltipsNote")}>
      <label className="flex max-w-sm items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 focus-within:border-accent"><Search size={14} className="text-subtle" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("classGuide.changes.search")} aria-label={t("classGuide.changes.search")} className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-muted" /></label>
      <p className="text-[11px] tabular-nums text-subtle">{t("classGuide.changes.showing", { shown: filteredTooltips.length, total: data.tooltipChanges.length })}</p>
      {filteredTooltips.map((value, index) => <details key={`${value.id}-${value.r}-${index}`} className="group rounded-[var(--radius-sm)] border border-border bg-surface open:border-accent/35"><summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[12px] marker:hidden focus-visible:outline-2 focus-visible:outline-accent"><span className="min-w-0 flex-1 font-medium text-white">{value.n} <span className="font-normal text-subtle">{value.r}</span></span><span className="text-[11px] text-accent group-open:hidden">{t("classGuide.changes.compare")}</span></summary><div className="grid gap-2 border-t border-border p-3 @min-[600px]:grid-cols-2"><div className="rounded-[var(--radius-sm)] bg-background p-3"><Label>{t("classGuide.changes.classicEra")}</Label><p className="mt-1 text-[12px] leading-5 text-zinc-300">{value.old}</p></div><div className="rounded-[var(--radius-sm)] bg-accent-soft p-3"><div className="flex items-center justify-between gap-2"><Label>{t("classGuide.changes.current")}</Label><Current id={value.id} name={t("classGuide.changes.openSpell")} /></div><p className="mt-1 text-[12px] leading-5 text-zinc-100">{value.new}</p></div></div></details>)}
      {!filteredTooltips.length && <p className="text-[12px] text-subtle">{t("database.noMatches")}</p>}
    </Section>
  </div>;
};

export default ClassChangesPanel;
