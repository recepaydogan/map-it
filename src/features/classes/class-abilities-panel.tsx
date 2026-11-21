import { Search } from "lucide-react";
import { useGameNames } from "../../i18n/use-game-names";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import ItemIcon from "../database/item-icon";
import SpellCard from "../spells/spell-card";
import { SPELL_CLASS_IDS, useSpellIndex } from "../spells/spell-data";
import SpellIcon from "../spells/spell-icon";
import SpellLink from "../spells/spell-link";
import ClassSpellbookPanel from "./class-spellbook-panel";
import type { GameClass } from "./class-types";

type AbilityView = "spellbook" | "new" | "reworked" | "trained";

// These reworked abilities have class-neutral spell records in the local index.
const REWORKED_SPELL_FALLBACKS: Record<string, Record<string, { id: number; iconId: number }>> = {
  warrior: { "Victory Rush": { id: 402927, iconId: 132342 } },
  shaman: { "Water Shield": { id: 408510, iconId: 132315 } },
  warlock: { "Soul Harvesting": { id: 437032, iconId: 132851 } },
  druid: {
    Berserk: { id: 417141, iconId: 236149 },
    Mangle: { id: 409828, iconId: 132135 },
  },
};

const ClassAbilitiesPanel = ({ entry }: { entry: GameClass }) => {
  const { t, i18n } = useTranslation();
  const { specializationName } = useGameNames();
  const [view, setView] = useState<AbilityView>("spellbook");
  const [query, setQuery] = useState("");
  const { rows } = useSpellIndex();
  const spells = useMemo(() => rows?.filter((row) => row[4] === SPELL_CLASS_IDS[entry.id]) ?? [], [rows, entry.id]);
  const spellByName = new Map(spells.map((spell) => [spell[1], spell]));
  const tabs: { key: AbilityView; count: number; label: string }[] = [
    { key: "spellbook", count: spellByName.size, label: t("classGuide.spellbook") },
    { key: "new", count: entry.abilities.new.length, label: t("classes.newAbilities") },
    { key: "reworked", count: entry.abilities.reworked.length, label: t("classes.reworkedAbilities") },
    ...(entry.trainedAbilities.length ? [{ key: "trained" as const, count: entry.trainedAbilities.length, label: t("classes.trainedAbilities") }] : []),
  ];
  const trained = useMemo(() => entry.trainedAbilities.filter((ability) => ability.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [entry.trainedAbilities, query]);
  const formatCopper = (amount: number) => {
    const gold = Math.floor(amount / 10000);
    const silver = Math.floor(amount % 10000 / 100);
    const copper = amount % 100;
    return [gold > 0 ? t("database.clientItem.gold", { count: gold.toLocaleString(i18n.language) }) : "",
      silver > 0 ? t("database.clientItem.silver", { count: silver }) : "",
      copper > 0 || gold === 0 && silver === 0 ? t("database.clientItem.copper", { count: copper }) : ""]
      .filter(Boolean).join(" ");
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("classes.abilityTypes")}>
      {tabs.map((tab) => <button key={tab.key} type="button" role="tab" aria-selected={view === tab.key} onClick={() => { setView(tab.key); setQuery(""); }}
        className={cn("cursor-pointer rounded-[var(--radius-sm)] border px-3 py-2 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent",
          view === tab.key ? "border-accent bg-accent-soft text-white" : "border-border bg-surface text-zinc-300 hover:text-white")}>
        {tab.label}<span className="ml-2 tabular-nums text-subtle">{tab.count}</span>
      </button>)}
    </div>

    {view === "spellbook" && <ClassSpellbookPanel entry={entry} />}

    {view === "new" && <div className="grid gap-2 @min-[760px]:grid-cols-2">{entry.abilities.new.map((ability) => <article key={ability.name} className="flex gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-3">
      <ItemIcon icon={ability.icon} name={ability.name} size={36} />
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-x-2"><h4 className="text-[13px] font-semibold text-white">{ability.name}</h4>{ability.level !== undefined && <span className="text-[11px] text-subtle">{t("classes.level", { level: ability.level })}</span>}{ability.passive && <span className="text-[11px] text-subtle">{t("classes.passive")}</span>}{spellByName.get(ability.name) && <SpellLink id={spellByName.get(ability.name)![0]} name={ability.name} className="cursor-pointer text-[11px] font-semibold text-accent hover:underline">{t("spells.openDetail")}</SpellLink>}</div>
        {ability.specialization && <p className="mt-0.5 text-[11px] font-medium text-accent">{specializationName(entry.id, ability.specialization)}</p>}
        {ability.description && <p className="mt-1 whitespace-pre-line text-[12px] leading-5 text-zinc-300">{ability.description}</p>}</div>
    </article>)}</div>}

    {view === "reworked" && <ul className="grid gap-2 sm:grid-cols-2 @min-[760px]:grid-cols-3">{entry.abilities.reworked.map((name) => {
      const spell = spellByName.get(name);
      const fallback = REWORKED_SPELL_FALLBACKS[entry.id]?.[name];
      const id = spell?.[0] ?? fallback?.id;
      return <li key={name} className="min-w-0">
        {id ? <SpellCard id={id} name={name} iconId={spell?.[3] ?? fallback?.iconId} />
          : <div className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-[12px] text-zinc-200"><SpellIcon name={name} size={30} />{name}</div>}
      </li>;
    })}</ul>}

    {view === "trained" && <div className="space-y-3">
      <label className="flex max-w-sm items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 focus-within:border-accent">
        <Search size={14} className="text-subtle" aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("classes.searchAbilities")} aria-label={t("classes.searchAbilities")} className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-muted" />
      </label>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
        {trained.map((ability) => <div key={ability.name} className="grid grid-cols-1 gap-x-4 gap-y-1.5 border-b border-border/60 px-3 py-2.5 last:border-b-0 @min-[520px]:grid-cols-[minmax(0,1fr)_170px] @min-[760px]:grid-cols-[minmax(0,1fr)_260px_170px] @min-[760px]:items-center">
          <div className="flex min-w-0 items-center gap-2"><ItemIcon icon={ability.icon} name={ability.name} size={26} />{spellByName.get(ability.name) ? <SpellLink id={spellByName.get(ability.name)![0]} name={ability.name} /> : <span className="text-[12px] font-medium text-white">{ability.name}</span>}</div>
          <div className="flex min-w-0 flex-wrap items-center gap-1 @min-[520px]:col-start-1 @min-[520px]:row-start-2 @min-[760px]:col-start-2 @min-[760px]:row-start-1">{ability.levels.map((level) => <span key={level} className="inline-flex h-5 w-7 items-center justify-center rounded-[var(--radius-sm)] border border-border text-[10px] tabular-nums text-zinc-300">{level}</span>)}</div>
          <p className="text-[11px] tabular-nums text-subtle @min-[520px]:col-start-2 @min-[520px]:row-span-2 @min-[520px]:row-start-1 @min-[520px]:self-center @min-[520px]:text-right @min-[760px]:col-start-3 @min-[760px]:row-span-1">{t("classes.allRanksCost", { cost: formatCopper(ability.allRanksCopper) })}</p>
        </div>)}
        {!trained.length && <p className="p-4 text-[12px] text-muted">{t("database.noMatches")}</p>}
      </div>
    </div>}
  </div>;
};

export default ClassAbilitiesPanel;
