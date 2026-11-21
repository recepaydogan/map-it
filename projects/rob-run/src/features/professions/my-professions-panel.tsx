import { useRelativeTime } from "../../lib/use-relative-time";
import { Check, ChevronDown, Hammer, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { contentUrl } from "../../lib/content-url";
import { cn } from "../../lib/cn";
import CategoryDropdown from "../../components/category-dropdown";
import { useGameNames } from "../../i18n/use-game-names";
import { useGameText } from "../../i18n/game-text";
import { useMapCharacterProfiles } from "../map/map-character-profiles";
import { CharacterConnection } from "../character-sync/character-connection";
import { AddonInstallAction } from "../character-sync/addon-install-action";
import { useCharacterSync } from "../character-sync/character-sync-store";
import { recipeAvailability } from "../character-sync/recipe-availability";
import ItemIcon from "../database/item-icon";
import type { ProfessionEntry } from "./profession-types";
import { useProfessionDetails } from "./use-profession-details";

type Filter = "learned" | "unlearned" | "craftable" | "all";
const FILTERS: Filter[] = ["learned", "unlearned", "craftable", "all"];
export default function MyProfessionsPanel({ entries }: { entries: ProfessionEntry[] }) {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const { professionName } = useGameNames();
  const sync = useCharacterSync();
  const profiles = useMapCharacterProfiles();
  const characters = Object.values(sync.characters).sort((a, b) => b.updatedAt - a.updatedAt);
  const namedCharacters = characters.filter(item => item.name);
  const choices = namedCharacters.length ? namedCharacters : characters;
  const character = choices.find(item => item.id === profiles.selectedId) ?? choices.find(item => item.id === sync.currentId) ?? choices[0];
  const [professionId, setProfessionId] = useState<string | null>(null);
  const profession = character?.professions.find(item => item.id === professionId) ?? character?.professions[0];
  const entry = entries.find(item => item.id === profession?.id);
  const details = useProfessionDetails(profession?.id ?? "camping");
  const [filter, setFilter] = useState<Filter>("learned");
  const [query, setQuery] = useState("");
  const [includeBank, setIncludeBank] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [limit, setLimit] = useState(40);
  const rows = character && profession ? (details.data?.recipes ?? []).map(recipe => ({
    recipe, ...recipeAvailability(recipe, profession, character, includeBank && Boolean(character.bank)),
    name: gameText(recipe.n, `SpellName:${recipe.s}:0`),
  })) : [];
  const counts = { learned: rows.filter(row => row.knowledge === "learned").length,
    unlearned: rows.filter(row => row.knowledge === "unlearned").length,
    craftable: rows.filter(row => row.craftable).length, all: rows.length };
  const visible = rows.filter(row => (filter === "all" || (filter === "craftable" ? row.craftable : row.knowledge === filter)) && row.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const relativeTime = useRelativeTime(i18n.language);
  if (!character) return <div className="max-w-[760px]"><CharacterConnection /></div>;
  return <div className="space-y-5">
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        {character.classId && <img src={contentUrl(`data/classes/icons/class_${character.classId}.jpg`)} alt="" className="size-12 rounded-[var(--radius-sm)] border border-border" />}
        <div className="min-w-0 flex-1"><label htmlFor="my-profession-character" className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">{t("myProfessions.character")}</label>
          <CategoryDropdown id="my-profession-character" value={character.id} ariaLabel={t("myProfessions.character")}
            options={choices.map(item => ({ key: item.id, label: [item.name || t("gepSync.currentCharacter"), item.realm].filter(Boolean).join(" · ") }))}
            onChange={id => { profiles.select(id); setExpanded(null); setLimit(40); }} /></div>
        <div className="text-right text-[11px] text-subtle"><p className="font-medium text-success-text">{t(character.savedAt ? "myProfessions.fromAddon" : "gepSync.source")}</p><p className="mt-1">{t("characterSync.savedAt", { date: relativeTime(character.updatedAt) })}</p></div>
      </div>
    </section>
    <AddonInstallAction />
    {!profession ? <p className="text-sm leading-6 text-zinc-200">{t("myProfessions.noProfessions")}</p> : <>
      <div className="flex flex-wrap gap-2" aria-label={t("myProfessions.profession")}>
        {character.professions.map(item => {
          const catalog = entries.find(entry => entry.id === item.id);
          return <button type="button" key={item.id} aria-pressed={profession.id === item.id} onClick={() => { setProfessionId(item.id); setExpanded(null); setLimit(40); }}
            className={cn("flex min-h-14 cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-accent", profession.id === item.id ? "border-accent bg-surface" : "border-border hover:bg-surface")}>
            {catalog?.icon && <ItemIcon icon={catalog.icon} name={professionName(item.id, catalog.name)} size={32} />}
            <span><span className="block text-[12px] font-semibold text-white">{professionName(item.id, catalog?.name ?? item.name)}</span><span className="block text-[11px] tabular-nums text-subtle">{item.skill === null ? t("myProfessions.skillUnknown") : t("myProfessions.skill", { skill: item.skill, max: item.maxSkill ?? "—" })}</span></span>
          </button>;
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <h3 className="font-display text-lg font-semibold text-white">{professionName(profession.id, entry?.name ?? profession.name)}</h3>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-200"><input type="checkbox" disabled={!character.bank} checked={includeBank && Boolean(character.bank)} onChange={event => setIncludeBank(event.target.checked)} />{t("myProfessions.includeBank")}</label>
      </div>
      <div className="space-y-1 text-[11px] leading-5 text-subtle">
        <p>{t("myProfessions.snapshotHint")}</p>
        <p>{t(profession.recipesAt ? "myProfessions.partialHint" : "myProfessions.openProfession")}</p>
        {!character.bags && <p>{t("myProfessions.noBags")}</p>}
        {includeBank && character.bank && <p>{t("myProfessions.bankSaved", { date: relativeTime(character.bank.capturedAt) })}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("myProfessions.recipeFilter")}>{FILTERS.map(key => <button key={key} type="button" role="tab" aria-selected={filter === key} aria-controls="my-profession-recipes" id={`my-profession-${key}`} onClick={() => { setFilter(key); setLimit(40); setExpanded(null); }}
        className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-3 text-[12px] font-medium focus-visible:outline-2 focus-visible:outline-accent", filter === key ? "border-accent bg-surface text-white" : "border-border text-zinc-200 hover:bg-surface")}>
        {t(`myProfessions.filters.${key}`)}<span className="tabular-nums text-subtle">{counts[key]}</span>
      </button>)}</div>
      <label className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border px-3 py-2.5 text-subtle"><Search size={15} aria-hidden="true" /><span className="sr-only">{t("myProfessions.search")}</span><input value={query} onChange={event => { setQuery(event.target.value); setLimit(40); }} placeholder={t("myProfessions.search")} className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-subtle" /></label>
      <div id="my-profession-recipes" role="tabpanel" aria-labelledby={`my-profession-${filter}`} className="space-y-2">
        {!details.data && <p role={details.error ? "alert" : "status"} className="py-6 text-sm text-zinc-200">{t(profession.id === "camping" ? "myProfessions.unavailable" : details.error ? "professions.error" : "professions.loading")}</p>}
        {visible.slice(0, limit).map(row => <article key={row.recipe.s} className="overflow-hidden rounded-[var(--radius-md)] border border-border">
          <button type="button" aria-expanded={expanded === row.recipe.s} onClick={() => setExpanded(expanded === row.recipe.s ? null : row.recipe.s)} className="flex min-h-16 w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent">
            {row.recipe.ic ? <ItemIcon icon={`data/spells/icons/${row.recipe.ic}.webp`} name={row.name} size={36} /> : <Hammer size={24} className="text-subtle" aria-hidden="true" />}
            <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-white">{row.name}</span><span className="mt-0.5 block text-[11px] text-subtle">{t(`myProfessions.knowledge.${row.knowledge}`)}{row.recipe.req !== undefined && ` · ${t("professions.skill", { value: row.recipe.req })}`}</span></span>
            {row.craftable && <Check size={17} className="text-success-text" aria-label={t("myProfessions.filters.craftable")} />}
            <ChevronDown size={15} className={cn("shrink-0 text-subtle", expanded === row.recipe.s && "rotate-180")} aria-hidden="true" />
          </button>
          {expanded === row.recipe.s && <div className="border-t border-border bg-surface px-4 py-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-subtle">{t("professions.materials")}</p>
            {row.materials.map(material => <div key={material.id} className="flex flex-wrap justify-between gap-2 border-t border-border py-2 text-[12px]">
              <span className="text-zinc-100">{gameText(details.data?.items[String(material.id)]?.[0] ?? t("myProfessions.item", { id: material.id }), `ItemSparse:${material.id}:4`)}</span>
              <span className={material.missing === 0 ? "tabular-nums text-success-text" : "tabular-nums text-zinc-200"}>{material.have === null ? t("myProfessions.need", { count: material.need }) : t("myProfessions.material", { have: material.have, need: material.need, missing: material.missing })}</span>
            </div>)}
            {!row.materials.length && <p className="text-[12px] text-subtle">{t("professions.noneListed")}</p>}
          </div>}
        </article>)}
        {details.data && !visible.length && <div className="rounded-[var(--radius-md)] border border-dashed border-border px-5 py-8 text-center text-[13px] leading-6 text-zinc-200">{t(filter === "unlearned" ? "myProfessions.noUnlearned" : "myProfessions.noMatches")}</div>}
        {visible.length > limit && <button type="button" onClick={() => setLimit(value => value + 40)} className="min-h-10 w-full cursor-pointer rounded-[var(--radius-sm)] border border-border text-[12px] text-white hover:bg-surface">{t("professions.showMore", { count: visible.length - limit })}</button>}
      </div>
    </>}
  </div>;
}
