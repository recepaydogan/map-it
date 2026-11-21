import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { Box, Globe, ScrollText, Skull, Store, Swords } from "lucide-react";
import { useGameText } from "../../i18n/game-text";
import ProgressiveList from "../../components/progressive-list";
import Tooltip from "../../components/tooltip";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import { useProfessionCatalog } from "../professions/use-profession-catalog";
import type { ProfessionRecipe } from "../professions/profession-types";
import DatabaseSectionTitle from "./database-section-title";
import ItemIcon from "./item-icon";
import ItemTooltipContent from "./item-tooltip-content";
import type { DatabaseItem } from "./item-database-types";
import type { ItemCraftingRecord, ItemResearch, ItemSourceRecord } from "./use-item-research";
import ItemSourceRow from "./item-source-row";
import { getItemSourceMapLocations } from "./item-source-map-links";
import { useItemSourceMapLinks } from "./use-item-source-map-links";

const thresholdColors = ["text-orange-400", "text-yellow-300", "text-green-400", "text-zinc-400"];

const UsedInRecipes = ({ used, itemsById }: { used: NonNullable<ItemCraftingRecord["used"]>; itemsById: Map<string, DatabaseItem> }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const openReference = useReferenceNavigation();
  const professionCatalog = useProfessionCatalog();
  const professionName = (id: string) => t(`professions.names.${id.replace("-", "")}`, { defaultValue: id });
  const recipes = useMemo(() => {
    const index = new Map<string, ProfessionRecipe>();
    if (professionCatalog.status === "ready") for (const profession of professionCatalog.catalog.professions) {
      for (const recipe of profession.recipes) if (recipe.itemId) {
        index.set(`${profession.id}:${recipe.itemId}:${recipe.name}`, recipe);
      }
    }
    return index;
  }, [professionCatalog]);

  return <div>
    <h4 className="mb-2 text-[12px] font-semibold text-white">{t("database.itemResearch.usedIn", { count: used.length })}</h4>
    <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_145px] gap-3 border-b border-border px-3 pb-2 text-[10px] font-semibold uppercase tracking-wide text-subtle @min-[620px]:grid">
      <span>{t("database.itemResearch.result")}</span>
      <span>{t("database.itemResearch.reagents")}</span>
      <span>{t("database.itemResearch.skill")}</span>
    </div>
    <ProgressiveList initialCount={8} pageSize={24} className="space-y-1.5">{used.map(([profession, spellId, quantity, name, , , output], index) => {
      const resultItem = itemsById.get(String(output));
      const recipe = recipes.get(`${profession}:${output}:${name}`);
      const skill = recipe?.clientSkill ?? recipe?.skill;
      const resultName = resultItem
        ? gameText(resultItem.name, `ItemSparse:${resultItem.id}:4`)
        : gameText(name, `ItemSparse:${output}:4`);
      return <div key={`${spellId}-${index}`} className="grid min-w-0 gap-2 rounded-[var(--radius-sm)] border border-white/10 px-3 py-2.5 text-[12px] @min-[620px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_145px] @min-[620px]:items-center @min-[620px]:gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {resultItem ? <button type="button" onClick={() => openReference({ category: "items", id: resultItem.id, name: resultName })}
            className="inline-flex min-w-0 cursor-pointer items-center gap-2 text-left font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
            {resultItem.icon && <ItemIcon icon={resultItem.icon} name={resultName} size={32} />}
            <span className="min-w-0 truncate">{resultName}</span>
          </button> : <span className="font-medium text-zinc-200">{resultName}</span>}
          <span className="shrink-0 text-[11px] text-subtle">×{quantity}</span>
          {recipe?.new && <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">{t("professions.new")}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">{!recipe && <span className="text-[11px] text-subtle">{t("database.itemResearch.recipeDetailsUnavailable")}</span>}{recipe?.reagents.map((reagent) => {
          const item = itemsById.get(reagent.id);
          const itemName = gameText(item?.name ?? reagent.name, `ItemSparse:${reagent.id}:4`);
          const label = `${itemName} ×${reagent.quantity}`;
          return item?.icon ? <Tooltip key={reagent.id} wrap align="start" side="top" label={<ItemTooltipContent item={item} />}>
            <button type="button" aria-label={label}
              onClick={() => openReference({ category: "items", id: reagent.id, name: itemName })}
              className="relative cursor-pointer rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-accent">
              <ItemIcon icon={item.icon} name={itemName} size={32} />
              <span className="absolute right-0 bottom-0 rounded-tl bg-black/80 px-0.5 text-[10px] font-semibold leading-3 text-white">{reagent.quantity}</span>
            </button>
          </Tooltip> : <span key={reagent.id} title={label} className="rounded-[var(--radius-sm)] border border-border px-1.5 py-1 text-[11px] text-subtle">{itemName} ×{reagent.quantity}</span>;
        })}</div>
        <div className="min-w-0">
          <button type="button" onClick={() => openReference({ category: "professions", id: profession === "first-aid" ? "firstaid" : profession, name: professionName(profession) })}
            className="cursor-pointer text-left font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
            {professionName(profession)}{skill !== undefined ? ` (${skill}${recipe?.clientSkill === undefined && recipe?.estimatedSkill ? " ≈" : ""})` : ""}
          </button>
          {!!recipe?.skillThresholds?.length && <div className="mt-1 flex flex-wrap gap-x-1.5 text-[11px] font-semibold tabular-nums">
            {recipe.skillThresholds.map((value, threshold) => <span key={threshold} className={thresholdColors[threshold] ?? "text-subtle"}
              title={t(`professions.thresholds.${threshold}`)}>{value}</span>)}
          </div>}
        </div>
      </div>;
    })}</ProgressiveList>
  </div>;
};

const sourceGroups = [
  { type: "drop", title: "database.acquisition.drops", icon: Swords },
  { type: "world", title: "database.itemResearch.worldDrops", icon: Globe },
  { type: "quest", title: "database.questRewards.title", icon: ScrollText },
  { type: "vendor", title: "database.acquisition.merchants", icon: Store },
  { type: "object", title: "database.itemResearch.objects", icon: Box },
  { type: "container", title: "database.itemResearch.containers", icon: Box },
] as const;

const ItemResearchPanel = ({ research, itemsById, onOpenMap }: { research: ItemResearch; itemsById: Map<string, DatabaseItem>; onOpenMap?: (mapId: string, markerId: string) => void }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const openReference = useReferenceNavigation();
  const sources = research.sources.filter((source) => source.t !== "craft"
    && !(source.t === "vendor" && research.sold?.v.length));
  const maps = useItemSourceMapLinks(Boolean(sources.some((source) => ["drop", "quest", "vendor", "object"].includes(source.t)) || research.sold?.v.length));
  const factionName = (faction?: string) => faction === "a" || faction === "Alliance" ? t("database.itemResearch.alliance")
    : faction === "h" || faction === "Horde" ? t("database.itemResearch.horde") : faction;
  const sourceName = (source: ItemSourceRecord) => {
    if (source.t === "world") return Array.isArray(source.lv)
      ? t("database.itemResearch.worldDrop", { levels: `${source.lv[0]}–${source.lv[1]}` }) : t("database.itemResearch.worldDropUnknown");
    if (source.t === "vendor" && source.many) return t("database.itemResearch.vendorCount", { count: source.many });
    if (!source.n) return t("database.itemResearch.unknownCreature");
    if (source.npc) return gameText(source.n, `Creature:${source.npc}:0`);
    if (source.t === "container" && source.item) return gameText(source.n, `ItemSparse:${source.item}:4`);
    return gameText(source.n);
  };
  const formatChance = (pct?: number) => pct !== undefined && Number.isFinite(pct) && pct > 0
    ? (pct / 100).toLocaleString(i18n.language, { style: "percent", maximumSignificantDigits: 3 }) : undefined;
  const resolve = (source: ItemSourceRecord) => getItemSourceMapLocations(source, maps.index);
  const sorted = (records: ItemSourceRecord[]) => [...records].sort((a, b) =>
    Number(Boolean(resolve(b).length)) - Number(Boolean(resolve(a).length))
    || Number(Boolean(b.fv)) - Number(Boolean(a.fv))
    || Number(b.src === "forever") - Number(a.src === "forever"));
  const hasContent = sources.length || research.sold?.v.length || research.crafting?.used?.length;
  if (!hasContent) return null;

  return <section className="@container max-w-[760px] space-y-6">
    {maps.loading && <p role="status" className="text-[12px] text-zinc-300">{t("database.itemResearch.loadingLocations")}</p>}
    {maps.error && <p role="alert" className="text-[12px] text-danger-text">{t("database.itemResearch.locationError")}</p>}
    {sourceGroups.map(({ type, title, icon }) => {
      const records = sorted(sources.filter((source) => source.t === type));
      if (!records.length) return null;
      return <section key={type}>
        <DatabaseSectionTitle count={records.length}>{t(records.some((source) => source.provided) ? "reference.categories.quests" : title)}</DatabaseSectionTitle>
        <ProgressiveList initialCount={6} pageSize={20} className="border-y border-border">{records.map((source, index) => {
          const dungeonId = source.inst && research.index.localDungeons[String(source.inst)];
          const dungeonName = source.inst && research.index.dungeons[String(source.inst)];
          const localizedDungeonName = dungeonName ? gameText(dungeonName) : undefined;
          const container = source.t === "container" && source.item && itemsById.get(String(source.item));
          const locations = resolve(source);
          const details = [localizedDungeonName,
            source.boss ? t("database.acquisition.boss") : undefined,
            source.seen ? t("database.itemResearch.seenCount", { count: source.seen }) : undefined,
            source.t === "quest" && typeof source.lv === "number" ? t("database.itemResearch.level", { level: source.lv }) : undefined,
            source.t === "quest" && source.choice ? t("database.itemResearch.choice") : undefined,
            source.provided ? t("map.foreverQuest.providedOnAccept") : undefined,
            source.t === "quest" && source.side ? factionName(source.side) : undefined,
            maps.index && !locations.length && ["drop", "vendor", "quest", "object"].includes(source.t)
              ? t("database.itemResearch.noMappedLocation") : undefined,
          ].filter(Boolean).join(" · ");
          const reference = dungeonId ? { label: `${t("database.itemResearch.openDungeon")}${localizedDungeonName ? ` · ${localizedDungeonName}` : ""}`,
            open: () => openReference({ category: "dungeons", id: dungeonId, name: localizedDungeonName }) }
            : container ? { label: t("database.itemResearch.openContainer"),
              open: () => openReference({ category: "items", id: container.id, name: gameText(container.name, `ItemSparse:${container.id}:4`), initialItemTab: "acquisition" }) } : undefined;
          return <ItemSourceRow key={`${source.t}-${source.npc ?? source.item ?? source.q ?? source.n}-${index}`}
            name={sourceName(source)} icon={source.boss ? Skull : icon} details={details} locations={locations}
            chance={formatChance(source.pct)}
            reference={reference} onOpenMap={onOpenMap} />;
        })}</ProgressiveList>
      </section>;
    })}
    {!!research.sold?.v.length && <section>
      <DatabaseSectionTitle count={research.sold.total}>{t("database.acquisition.merchants")}</DatabaseSectionTitle>
      <ProgressiveList initialCount={6} pageSize={24} className="border-y border-border">
        {[...research.sold.v].sort((a, b) => Number(Boolean(resolve({ ...b, t: "vendor" }).length)) - Number(Boolean(resolve({ ...a, t: "vendor" }).length))).map((vendor) => {
          const locations = resolve({ ...vendor, t: "vendor" });
          const details = [!locations.length && vendor.zone ? gameText(vendor.zone) : undefined, factionName(vendor.side),
            maps.index && !locations.length ? t("database.itemResearch.noMappedLocation") : undefined].filter(Boolean).join(" · ");
          return <ItemSourceRow key={vendor.npc} name={gameText(vendor.n, `Creature:${vendor.npc}:0`)} icon={Store}
            details={details} locations={locations} onOpenMap={onOpenMap} />;
        })}
      </ProgressiveList>
    </section>}
    {!!research.crafting?.used?.length && <UsedInRecipes used={research.crafting.used} itemsById={itemsById} />}
  </section>;
};

export default ItemResearchPanel;
