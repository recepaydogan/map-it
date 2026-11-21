import { useRelativeTime } from "../../lib/use-relative-time";
import { Check, Hammer, Package } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { useGameText } from "../../i18n/game-text";
import { useGameNames } from "../../i18n/use-game-names";
import { CatalogCategory, CatalogRow, CatalogSearch, CatalogTable, CatalogWorkspace } from "../../components/catalog-workspace";
import ItemIcon from "../database/item-icon";
import { useItemCatalog } from "../database/use-item-catalog";
import { useCharacterSync } from "../character-sync/character-sync-store";
import { AddonInstallAction } from "../character-sync/addon-install-action";
import { useMapCharacterProfiles } from "../map/map-character-profiles";
import { useProfessionCatalog } from "../professions/use-profession-catalog";
import { useProfessionDetails } from "../professions/use-profession-details";
import CraftingIcon from "./crafting-icon";
import { openReference } from "../reference/reference-navigation";
import { craftingPlan } from "./crafting-plan";

type Filter = "all" | "learned" | "ready";
export default function CraftingPage() {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const { professionName } = useGameNames();
  const catalog = useProfessionCatalog();
  const itemCatalog = useItemCatalog();
  const sync = useCharacterSync();
  const profiles = useMapCharacterProfiles();
  const characters = Object.values(sync.characters).sort((a, b) => b.updatedAt - a.updatedAt);
  const namedChoices = [...characters.filter(c => c.name), ...profiles.characters.filter(p => !characters.some(c => c.id === p.id))];
  const choices = namedChoices.length ? namedChoices : characters;
  const selectedCharacter = choices.find(c => c.id === profiles.selectedId)
    ?? choices.find(c => c.id === sync.currentId) ?? choices[0];
  const character = characters.find(c => c.id === selectedCharacter?.id);
  const entries = catalog.status === "ready" ? catalog.catalog.professions.filter(p => p.id !== "camping") : [];
  const [professionId, setProfessionId] = useState<string | null>(null);
  const entry = entries.find(p => p.id === professionId) ?? entries.find(p => p.id === character?.professions[0]?.id) ?? entries[0];
  const profession = character?.professions.find(p => p.id === entry?.id);
  const details = useProfessionDetails(entry?.id ?? "camping");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [includeBank, setIncludeBank] = useState(false);
  const [limit, setLimit] = useState(50);
  const [showDetail, setShowDetail] = useState(false);
  const bank = includeBank && Boolean(character?.bank);
  const catalogItems = new Map(itemCatalog.status === "ready" ? itemCatalog.catalog.items.map(item => [item.id, item]) : []);
  const rows = (details.data?.recipes ?? []).map(recipe => ({ recipe,
    icon: catalogItems.get(String(recipe.make?.[0]))?.icon ?? (recipe.ic ? `data/spells/icons/${recipe.ic}.webp` : undefined),
    name: gameText(recipe.n, `SpellName:${recipe.s}:0`), plan: craftingPlan(recipe, character, profession, 1, bank) }));
  const visible = rows.filter(row => (filter === "all" || (filter === "learned" ? row.plan.knowledge === "learned" : row.plan.craftable)) &&
    (!query.trim() || row.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) || row.plan.materials.some(m =>
      gameText(details.data?.items[String(m.id)]?.[0] ?? "", `ItemSparse:${m.id}:4`).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))));
  const selected = visible.find(r => r.recipe.s === selectedId) ?? visible[0];
  const plan = selected ? craftingPlan(selected.recipe, character, profession, quantity, bank) : null;
  const relativeTime = useRelativeTime(i18n.language);
  const reset = () => { setSelectedId(null); setQuantity(1); setLimit(50); setShowDetail(false); };
  if (catalog.status !== "ready") return <div className="p-6 text-sm text-muted" role={catalog.status === "error" ? "alert" : "status"}>{t(catalog.status === "error" ? "professions.error" : "professions.loading")}</div>;
  const recipeDetail = showDetail && selected && plan && <section aria-label={t("crafting.recipeDetails")} className="catalog-scroll">
            <div className="space-y-5 p-5">
              <div className="flex items-center gap-3"><CraftingIcon icon={selected.icon} name={selected.name} size={52} /><div><h3 className="font-display text-lg font-semibold leading-6 text-white">{selected.name}</h3>
                {plan.knowledge !== "unknown" && <p className="mt-1 text-xs text-subtle">{t(`myProfessions.knowledge.${plan.knowledge}`)}</p>}
              </div></div>
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-3"><div><label htmlFor="crafting-quantity" className="text-xs font-medium text-white">{t("crafting.quantity")}</label><p className="mt-1 text-[11px] text-subtle">{plan.output === null ? t("crafting.outputUnknown") : t("crafting.output", { count: plan.output })}</p></div><input id="crafting-quantity" type="number" min="1" max="999" step="1" value={quantity} onChange={e => setQuantity(Math.max(1, Math.min(999, Math.floor(Number(e.target.value) || 1))))} className="h-10 w-20 rounded-[var(--radius-sm)] border border-border bg-background px-2 text-center text-sm tabular-nums text-white focus-visible:outline-2 focus-visible:outline-accent" /></div>
              <div><div className="mb-3 flex items-center justify-between"><h4 className="flex items-center gap-2 text-xs font-semibold text-white"><Package size={15} aria-hidden="true" />{t("professions.materials")}</h4><label className="flex items-center gap-1.5 text-[11px] text-subtle"><input type="checkbox" disabled={!character?.bank} checked={bank} onChange={e => setIncludeBank(e.target.checked)} />{t("myProfessions.includeBank")}</label></div>
                <div className="mb-1 grid grid-cols-[1fr_54px_54px_54px] gap-2 border-b border-border pb-2 text-right text-[10px] font-medium text-subtle"><span className="text-left">{t("crafting.material")}</span><span>{t("crafting.have")}</span><span>{t("crafting.need")}</span><span>{t("crafting.missing")}</span></div>
                {plan.materials.map(m => { const item = details.data?.items[String(m.id)]; const itemIcon = catalogItems.get(String(m.id))?.icon; const name = gameText(item?.[0] ?? t("myProfessions.item", { id: m.id }), `ItemSparse:${m.id}:4`); return <div key={m.id} className="grid grid-cols-[minmax(0,1fr)_54px_54px_54px] items-center gap-2 border-b border-border py-3 text-right text-xs tabular-nums"><span className="flex min-w-0 items-center gap-2 text-left text-white">{itemIcon ? <ItemIcon icon={itemIcon} name={name} size={28} /> : <Package size={18} className="shrink-0 text-subtle" aria-hidden="true" />}<span className="min-w-0 break-words leading-5"><span className="block">{name}</span>{catalogItems.has(String(m.id)) && <button type="button" aria-label={t("crafting.obtainMaterial", { name })} onClick={() => openReference({ category: "items", id: String(m.id), name, initialItemTab: "acquisition" })} className="mt-1 block cursor-pointer text-left text-[12px] leading-5 text-subtle underline decoration-current underline-offset-3 hover:text-white focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent">{t("crafting.howToObtain")}</button>}</span></span><span className="text-subtle">{m.have ?? "—"}</span><span className="text-white">{m.need}</span><span className={m.missing === 0 ? "text-success-text" : "text-danger-text"}>{m.missing === null ? "—" : m.missing === 0 ? <Check size={14} className="ml-auto" aria-label={t("crafting.enough")} /> : m.missing}</span></div>; })}
                {!plan.materials.length && <p className="py-4 text-xs text-subtle">{t("professions.noneListed")}</p>}
              </div>
              {character?.bags && <p className="text-[11px] leading-5 text-subtle">{t("crafting.inventoryAt", { date: relativeTime(character.bags.capturedAt) })}{bank && character.bank && <span className="mt-1 block">{t("myProfessions.bankSaved", { date: relativeTime(character.bank.capturedAt) })}</span>}</p>}
            </div>
  </section>;
  return <div data-crafting-page className="flex h-full min-h-0 min-w-0">
    <CatalogWorkspace label={t("crafting.title")} categoryLabel={t("myProfessions.profession")} detail={recipeDetail}
      backLabel={t("crafting.back")} onCloseDetail={() => setShowDetail(false)}
      categories={<>
        <h2 className="catalog-category-heading">{t("myProfessions.profession")}</h2>
        {entries.map(p => <CatalogCategory key={p.id} active={entry?.id === p.id}
          onClick={() => { setProfessionId(p.id); setFilter("all"); setQuery(""); reset(); }}>
          <ItemIcon icon={p.icon} name={p.name} size={24} />
          <span className="min-w-0 flex-1">{professionName(p.id, p.name)}
            {selectedCharacter?.professions.some(owned => owned.id === p.id) && <span className="block text-[10px] text-success-text">
              {p.id === profession?.id && profession.skill != null ? profession.skill + " / " + (profession.maxSkill ?? "—") : t("crafting.yourProfession")}
            </span>}
          </span>
        </CatalogCategory>)}
        <div className="mt-3 border-t border-border pt-3"><AddonInstallAction compact /></div>
      </>}
      search={<CatalogSearch label={t("crafting.search")} value={query} onChange={value => { setQuery(value); reset(); }} />}
      filters={<>
        <CategoryDropdown neutral id="crafting-filter" triggerClassName="w-auto min-h-[38px] max-w-full" value={filter} ariaLabel={t("myProfessions.recipeFilter")}
          options={(["all", "learned", "ready"] as Filter[]).map(key => ({ key, label: t("crafting.filters." + key) }))}
          onChange={value => { setFilter(value as Filter); reset(); }} />
        <CategoryDropdown neutral id="crafting-character" triggerClassName="w-auto min-h-[38px] max-w-full" value={selectedCharacter?.id ?? ""} ariaLabel={t("myProfessions.character")}
          options={choices.length ? choices.map(c => ({ key: c.id, image: "data/classes/icons/class_" + c.classId + ".jpg", label: [c.name || t("gepSync.currentCharacter"), c.level !== null ? t("map.characters.levelShort", { level: c.level }) : null].filter(Boolean).join(" · ") })) : [{ key: "", label: t("crafting.noCharacter") }]}
          onChange={id => { profiles.select(id); reset(); }} />
      </>}>
      {!details.data ? <p className="catalog-empty" role={details.error ? "alert" : "status"}>{t(details.error ? "professions.error" : "professions.loading")}</p> : <>
        <CatalogTable label={t("professions.recipes")} columns={[
          { label: t("catalog.recipe") }, { label: t("catalog.requiredSkill"), width: "20%", align: "end" },
          { label: t("catalog.missingMaterials"), width: "24%", align: "end" },
        ]}>
          {visible.slice(0, limit).map(row => {
            const missingTypes = row.plan.inventoryKnown && Array.isArray(row.recipe.r) ? row.plan.materials.filter(material => (material.missing ?? 0) > 0).length : null;
            return <CatalogRow key={row.recipe.s} title={row.name} icon={<CraftingIcon icon={row.icon} name={row.name} size={30} />}
              description={row.plan.knowledge === "unknown" ? undefined : t(`myProfessions.knowledge.${row.plan.knowledge}`)} selected={row.recipe.s === selectedId}
              onOpen={() => { setSelectedId(row.recipe.s); setQuantity(1); setShowDetail(true); }}>
              <td className="catalog-number">{row.recipe.req ?? "—"}</td>
              <td className="catalog-number">{row.plan.craftable ? <Check size={14} className="mr-1 inline text-success-text" aria-label={t("crafting.ready")} /> : null}{missingTypes ?? "—"}</td>
            </CatalogRow>;
          })}
        </CatalogTable>
        {!visible.length && <div className="catalog-empty"><Hammer size={24} className="mx-auto mb-2" aria-hidden="true" />
          <p className="text-zinc-100">{t("crafting.empty")}</p><p className="mt-1">{t(filter === "all" ? "crafting.emptySearch" : "crafting.emptyFiltered")}</p></div>}
        {visible.length > limit && <button type="button" onClick={() => setLimit(n => n + 50)} className="catalog-more">{t("professions.showMore", { count: visible.length - limit })}</button>}
      </>}
    </CatalogWorkspace>
  </div>;
}
