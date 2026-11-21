import { getItemDisplayName } from "../../lib/item-display-name";
import type { ReferenceTarget } from "../reference/reference-types";
import { getItemRewardQuantity } from "./item-reward-quantity";
import ItemEffects from "./item-effects";
import ItemSiteEffects from "./item-site-effects";
import CompactItemSources from "./compact-item-sources";
import { CompactItemHeader, CompactItemQuantity } from "./compact-item-header";
import ItemMetadata, { ItemMetadataPills } from "./item-metadata";
import { useItemLocationSources } from "./use-item-location-sources";
import { splitItemEffects } from "./item-effect-description";
import ItemDescriptionLinks from "./item-description-links";
import SpellLink from "../spells/spell-link";
import ItemClassicChanges from "./item-classic-changes";
import ItemResearchPanel from "./item-research-panel";
import { useItemResearch } from "./use-item-research";
import ForeverGatheringSources from "./forever-gathering-sources";
import { hasForeverGatheringSources, useForeverGatheringSources } from "./use-forever-gathering-sources";
import { useForeverQuestItemRewards } from "./use-forever-quest-item-rewards";
import { useProfessionCatalog } from "../professions/use-profession-catalog";
import ReferenceBackLink from "../reference/reference-back-link";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import { getItemCategoryGroup, ITEM_CATEGORY_LABEL_KEYS, ITEM_SOUL_EFFECT, COLLECTIBLE_PROGRESSION } from "../../game-config";
import CollectibleProgressionPanel from "../reference/collectible-progression-panel";
import ItemDetailTabs, { ITEM_DETAIL_TABS, type ItemDetailTab } from "./item-detail-tabs";
import { getItemSectionGroup, isAcquisitionSection } from "./item-detail-sections";
import { getItemSourceSections } from "./item-source-sections";
import DatabaseSectionTitle from "./database-section-title";
import ItemAcquisitionSection from "./item-acquisition";
import { hasItemAcquisitionSources } from "./item-acquisition-availability";
import { getItemAcquisitionNotes } from "./item-acquisition-notes";
import ItemIcon from "./item-icon";
import ItemUpgradePanel from "./item-upgrade-panel";
import SkinVoucherDescription from "../intelligence/skin-voucher-description";
import ItemCollectionUses from "../intelligence/item-collection-uses";
import ItemDismantlingPanel from "./item-dismantling-panel";
import ItemRecipes from "./item-recipes";
import ItemImprintChances from "./item-imprint-chances";
import ItemTransferChances from "./item-transfer-chances";
import { getUpgradeOperation } from "./item-upgrade-options";
import type { DatabaseItem, DatabaseRecipe, ItemStat } from "./item-database-types";
import { useItemAcquisition } from "./use-item-acquisition";
import ReferenceSections, { ReferenceFacts } from "../reference/reference-sections";
import { useItemReference, useItemReferences, useIntelligenceData } from "../reference/use-reference-data";
import type { CollectionData, SpecialItemDetailsData } from "../intelligence/intelligence-types";
import { formatItemUsageRules } from "./item-usage-rules";

const rememberedItemTabs = new Map<string, ItemDetailTab>();

const StatRows = ({ stats, bonuses = [], columns = false }: { stats: ItemStat[]; bonuses?: ItemStat[]; columns?: boolean }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const bonusesByKey = new Map(bonuses.map((bonus) => [bonus.key, bonus.value]));
  return <dl className={cn(columns ? "grid grid-cols-1 gap-x-8 gap-y-2 @min-[760px]:grid-cols-2" : "space-y-1")}>
    {stats.map((stat) => (
      <div key={stat.key} className="flex min-w-0 justify-between gap-4 text-[13px]">
        <dt className="min-w-0 text-zinc-300">{t(stat.label, { defaultValue: gameText(stat.label) })}
          {stat.chancePercent !== undefined && <span className="block text-[11px] text-subtle">{t("database.imprintSelectionChance", { chance: stat.chancePercent })}</span>}
        </dt>
        <dd className="shrink-0 text-right font-medium tabular-nums text-white">
          {stat.value}
          {bonusesByKey.has(stat.key) && <span className="ml-1 text-amber-300">({bonusesByKey.get(stat.key)})</span>}
        </dd>
      </div>
    ))}
  </dl>;
};

const ItemDetail = ({
  item, recipes, itemsById, onSelect, onOpenMap, onClose, backLabel, onBack, compact = false, embedded = false, initialRecipeId, initialTab, reward,
}: {
  item: DatabaseItem;
  reward?: Pick<ReferenceTarget, "quantity" | "rewardRates">;
  recipes: DatabaseRecipe[];
  itemsById: Map<string, DatabaseItem>;
  onSelect: (item: DatabaseItem) => void;
  onOpenMap?: (mapId: string, markerId: string) => void;
  onClose?: () => void;
  compact?: boolean;
  embedded?: boolean;
  initialRecipeId?: string;
  initialTab?: "acquisition";
  backLabel?: string;
  onBack?: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const specialItems = useIntelligenceData<SpecialItemDetailsData>("special-item-details");
  const specialDetails = specialItems.status === "ready" ? specialItems.data : null;
  const extendable = specialDetails?.extendableWeapons.includes(item.id) ?? false;
  const kisk = specialDetails?.kisks[item.id];
  const hasCollectionProgression = COLLECTIBLE_PROGRESSION.itemIds.includes(item.id);
  const describedEffects = splitItemEffects(item.description ?? "");
  const hasClientFacts = item.itemLevel !== undefined || Boolean(item.clientDetails?.stackSize
    || item.clientDetails?.containerSlots || item.clientDetails?.itemDelayMs || item.allowedClasses?.length
    || item.clientDetails?.buyPriceCopper || item.clientDetails?.sellPriceCopper);
  const hasStatistics = item.sections.some((section) => section.key !== "imprint" && section.stats.length > 0)
    || item.enhancements.some((entry) => entry.stats.length > 0)
    || Boolean(item.equipment && Object.values(item.equipment).some((value) => value !== undefined))
    || Boolean(kisk || describedEffects.owned || describedEffects.equipped || item.siteEffects?.length)
    || hasClientFacts;
  const [selectedLevel, setSelectedLevel] = useState(0);
  const tabMemoryKey = `${compact ? "map" : "database"}:${item.id}`;
  const startAtAcquisition = Boolean(initialRecipeId || initialTab === "acquisition");
  const [activeTab, setActiveTab] = useState<ItemDetailTab>(() => startAtAcquisition ? "statistics"
    : rememberedItemTabs.get(tabMemoryKey) ?? (hasCollectionProgression ? "collection" : "statistics"));
  useEffect(() => { rememberedItemTabs.set(tabMemoryKey, activeTab); }, [tabMemoryKey, activeTab]);
  const tabId = useId();
  const acquisitionSection = useRef<HTMLElement>(null);
  const jumpedToAcquisition = useRef(false);
  const acquisitionState = useItemAcquisition(item.id);
  const foreverGathering = useForeverGatheringSources(item.id);
  const itemResearch = useItemResearch(item.id, true);
  const questRewards = useForeverQuestItemRewards(item.id);
  const professionState = useProfessionCatalog();
  const acquisitionNotes = getItemAcquisitionNotes(item.description);
  const referenceState = useItemReference(item.id, item.hasReference !== false);
  const visibleRecipe = (id: string) => !id.startsWith("ConversionRecipe:")
    || specialDetails !== null && !specialDetails.hiddenRecipes.includes(id);
  const collectionState = useIntelligenceData<CollectionData>("collections");
  const collectionUses = collectionState.status === "ready" ? collectionState.data.objectives.filter(o => o.items.includes(item.id)) : [];
  const referenceSections = referenceState.status === "ready" ? referenceState.data.map((section) => formatItemUsageRules(section, i18n.language)) : [];
  const recipeLinks = referenceSections.filter((section) => section.title !== "reference.labels.used-in-recipes")
    .flatMap((section) => section.links ?? []).filter((link) => link.category === "recipes" && visibleRecipe(link.id));
  const usedInRecipeLinks = referenceSections.filter((section) => section.title === "reference.labels.used-in-recipes")
    .flatMap((section) => section.links ?? []).filter((link) => link.category === "recipes" && visibleRecipe(link.id));
  const nonRecipeSections = referenceSections.map((section) => ({
    ...section, links: section.links?.filter((link) => link.category !== "recipes"),
  })).filter((section) => section.title !== "reference.labels.gathering-requirements"
    && (section.text || section.facts?.length || section.links?.length || section.rows?.length));
  const rawSourceSections = nonRecipeSections.filter(isAcquisitionSection);
  const containerReferences = useItemReferences(rawSourceSections
    .filter((section) => section.title === "reference.labels.available-from-boxes")
    .flatMap((section) => section.links ?? []).filter((link) => link.category === "items").map((link) => link.id));
  const sourceSections = getItemSourceSections(rawSourceSections, containerReferences.status === "ready" ? containerReferences.data : {});
  const locationSources = useItemLocationSources(item.id, compact ? sourceSections : []);
  const binding = referenceSections.flatMap((section) => section.facts ?? [])
    .find((fact) => fact.label === "reference.labels.trade-and-binding")?.value;
  const isEquipmentItem = ["weapons", "armor", "accessories"].includes(getItemCategoryGroup(item.category));
  const bindingLabel = typeof binding === "string"
    ? binding === "Non Exchangeable" ? t("database.compact.untradable") : binding
    : item.clientDetails?.bonding ? t(`database.clientItem.binding.${item.clientDetails.bonding}`) : undefined;
  const itemMetadata = <ItemMetadata
    category={t(ITEM_CATEGORY_LABEL_KEYS[item.category] ?? item.category, { defaultValue: gameText(item.category) })}
    slot={item.slot ?? (item.clientDetails?.inventoryType ? t(`database.clientItem.slot.${item.clientDetails.inventoryType}`, { defaultValue: "" }) : undefined)} />;
  const enhancement = item.enhancements.find((entry) => entry.level === selectedLevel);
  const baseStatKeys = new Set(item.sections.flatMap((section) => section.key === "base" ? section.stats.map((stat) => stat.key) : []));
  const extraEnhancementStats = enhancement?.stats.filter((stat) => !baseStatKeys.has(stat.key)) ?? [];
  const craftedFrom = recipes.filter((recipe) => recipe.ingredients.length > 0 && (
    recipe.outputItemId === item.id || recipe.comboOutputItemId === item.id
  ));
  const professionRecipes = professionState.status === "ready"
    ? professionState.catalog.professions.flatMap((profession) => profession.recipes
      .filter((recipe) => recipe.itemId === item.id && recipe.reagents.length > 0)
      .map((recipe) => ({ profession, recipe })))
    : [];
  const usedIn = recipes.filter((recipe) => recipe.ingredients.some((ingredient) => ingredient.itemId === item.id));
  const upgradeLinks = referenceSections.filter((section) => section.title === "reference.labels.upgrades-and-sets")
    .flatMap((section) => section.links ?? []);
  const hasInlineUpgrades = upgradeLinks.some((link) => Boolean(getUpgradeOperation(link)));
  const transferLinks = referenceSections.filter((section) => section.title === "reference.labels.transfer-chances")
    .flatMap((section) => section.links ?? []);
  const stoneImprintResults = referenceSections.flatMap((section) => section.imprintResults ?? []);
  const hasTransferOperation = upgradeLinks.some((link) => getUpgradeOperation(link) === "transfer");
  const dismantlingSections = referenceSections.filter((section) => section.title === "reference.labels.dismantling");
  const dismantlingAllowed = referenceSections.flatMap((section) => section.facts ?? [])
    .find((fact) => fact.label === "reference.labels.can-be-dismantled")?.value;
  const hasDetails = Boolean(item.description) || ITEM_CATEGORY_LABEL_KEYS[item.category] === "intel.skins.voucherLabel"
    || nonRecipeSections.some((section) => getItemSectionGroup(section) === "statistics"
      && (section.title !== "reference.labels.usage-and-restrictions"
        || Boolean(section.text || section.links?.length || section.rows?.length
          || section.facts?.some((fact) => fact.label !== "reference.labels.trade-and-binding"))));
  const hasPrimaryTab = hasStatistics || hasDetails || item.classicChanges !== undefined || item.itemLevel !== undefined
    || Boolean(item.itemSets?.length || item.spellLinks?.length);
  const hasAcquisition = Boolean(hasForeverGatheringSources(item.id) || acquisitionNotes.length || acquisitionState.status === "ready" && hasItemAcquisitionSources(acquisitionState.acquisition)
    || acquisitionState.status === "error" || sourceSections.length || recipeLinks.length || craftedFrom.length || professionRecipes.length
    || questRewards.rewards.length || questRewards.error || itemResearch.error || foreverGathering.error || locationSources.error
    || nonRecipeSections.some((section) => !isAcquisitionSection(section) && getItemSectionGroup(section) === "acquisition")
    || itemResearch.data && (itemResearch.data.sources.some((source) => source.t !== "craft")
      || itemResearch.data.sold?.v.length || itemResearch.data.crafting?.used?.length));
  const tabs = ITEM_DETAIL_TABS.filter((tab) => tab === "collection" ? hasCollectionProgression || collectionUses.length > 0
    : tab === "statistics" ? hasPrimaryTab || hasAcquisition || startAtAcquisition
    : tab === "upgrades" ? (item.enhancements.length > 0 || hasInlineUpgrades || transferLinks.length > 0
      || stoneImprintResults.length > 0 || usedIn.length > 0 || usedInRecipeLinks.length > 0
      || item.sections.some((section) => section.key === "imprint")
      || nonRecipeSections.some((section) => getItemSectionGroup(section) === "upgrades"))
    : dismantlingAllowed === true || dismantlingSections.length > 0);
  const currentTab = tabs.includes(activeTab) ? activeTab : tabs[0] ?? "statistics";
  const show = (tab: ItemDetailTab) => currentTab === tab;
  const showAcquisition = show("statistics") && (hasAcquisition || startAtAcquisition);
  const canJumpToAcquisition = startAtAcquisition && showAcquisition && referenceState.status !== "loading"
    && acquisitionState.status !== "loading" && (!/^\d+$/.test(item.id) || Boolean(itemResearch.data || itemResearch.error));
  useEffect(() => {
    if (!canJumpToAcquisition || jumpedToAcquisition.current || !acquisitionSection.current) return;
    acquisitionSection.current.scrollIntoView({ block: "start" });
    jumpedToAcquisition.current = true;
  }, [canJumpToAcquisition]);
  const visibleReferenceSections = nonRecipeSections.filter((section) => !isAcquisitionSection(section)
    && !["reference.labels.transfer-chances", "reference.labels.imprint-chances"].includes(section.title)
    && (getItemSectionGroup(section) === currentTab
      && section.title !== "reference.labels.usage-and-restrictions"
      && section.title !== "reference.labels.dismantling"
      && !(section.title === "reference.labels.crafted-from" && craftedFrom.length > 0)
      && !(section.title === "reference.labels.used-in-recipes" && usedIn.length > 0)))
    .map((section) => section.title === "reference.labels.upgrades-and-sets"
      ? { ...section, title: "database.upgradePanel.related", links: section.links?.filter((link) => !getUpgradeOperation(link)) }
      : section)
    .filter((section) => section.title !== "database.upgradePanel.related" || section.links?.length)
    .map((section) => section.title === "reference.labels.usage-and-restrictions" ? { ...section, title: "database.usageRules" } : section);
  const acquisitionReferenceSections = nonRecipeSections.filter((section) => !isAcquisitionSection(section)
    && getItemSectionGroup(section) === "acquisition"
    && !(section.title === "reference.labels.crafted-from" && craftedFrom.length > 0));
  const craftingReferenceSections = acquisitionReferenceSections.filter((section) => section.title === "reference.labels.crafted-from");
  const otherAcquisitionReferenceSections = acquisitionReferenceSections.filter((section) => section.title !== "reference.labels.crafted-from");
  const usageSections = referenceSections.filter((section) => section.title === "reference.labels.usage-and-restrictions")
    .map((section) => ({
      ...section, facts: section.facts?.filter((fact) => fact.label !== "reference.labels.trade-and-binding"),
    }))
    .filter((section) => section.text || section.facts?.length || section.links?.length || section.rows?.length);
  const isSoulItem = referenceSections.some((section) => section.title === "reference.labels.use-effect"
    && section.facts?.some((fact) => fact.label === "reference.labels.effect" && fact.value === ITEM_SOUL_EFFECT));
  const useEffectSections = visibleReferenceSections.filter((section) => section.title === "reference.labels.use-effect" && !isSoulItem);
  const effectReferences = useEffectSections.map((section) => ({
    ...section,
    text: undefined,
    facts: section.facts?.filter((fact) => fact.label !== "reference.labels.effect"),
  })).filter((section) => section.links?.length || section.facts?.length || section.rows?.length);
  const remainingReferenceSections = visibleReferenceSections.filter((section) => section.title !== "reference.labels.use-effect");
  const visibleStatSections = item.sections.filter((section) => section.key !== "imprint");
  const imprintSections = item.sections.filter((section) => section.key === "imprint");
  const equipmentStats: ItemStat[] = [];
  if (item.equipment?.horizontalRangeMeters !== undefined) equipmentStats.push({ key: "horizontalRange", label: t("database.horizontalRange"), value: t("database.meters", { value: item.equipment.horizontalRangeMeters.toLocaleString(i18n.language) }) });
  if (item.equipment?.verticalRangeMeters !== undefined) equipmentStats.push({ key: "verticalRange", label: t("database.verticalRange"), value: t("database.meters", { value: item.equipment.verticalRangeMeters.toLocaleString(i18n.language) }) });
  if (item.equipment?.soulImprintSlots !== undefined) equipmentStats.push({ key: "soulImprintSlots", label: t("database.soulImprintSlots"), value: String(item.equipment.soulImprintSlots) });
  if (item.equipment?.soulstoneSlots !== undefined) equipmentStats.push({ key: "soulstoneSlots", label: t("database.soulstoneSlots"), value: String(item.equipment.soulstoneSlots) });
  if (item.equipment?.theostoneSlots !== undefined) equipmentStats.push({ key: "theostoneSlots", label: t("database.theostoneSlots"), value: String(item.equipment.theostoneSlots) });
  const formatCopper = (amount: number) => {
    const gold = Math.floor(amount / 10000);
    const silver = Math.floor(amount % 10000 / 100);
    const copper = amount % 100;
    return [gold > 0 ? t("database.clientItem.gold", { count: gold.toLocaleString(i18n.language) }) : "",
      silver > 0 ? t("database.clientItem.silver", { count: silver }) : "",
      copper > 0 || gold === 0 && silver === 0 ? t("database.clientItem.copper", { count: copper }) : ""]
      .filter(Boolean).join(" ");
  };
  const clientStats: ItemStat[] = [
    ...(item.itemLevel !== undefined ? [{ key: "client-item-level", label: "database.clientItem.itemLevel", value: String(item.itemLevel + (enhancement?.itemLevelBonus ?? 0)) }] : []),
    ...(item.clientDetails?.stackSize ? [{ key: "client-stack-size", label: "database.clientItem.stackSize", value: String(item.clientDetails.stackSize) }] : []),
    ...(item.clientDetails?.containerSlots ? [{ key: "client-bag-slots", label: "database.clientItem.bagSlots", value: String(item.clientDetails.containerSlots) }] : []),
    ...(item.clientDetails?.itemDelayMs ? [{ key: "client-weapon-speed", label: "database.clientItem.weaponSpeed", value: (item.clientDetails.itemDelayMs / 1000).toFixed(2) }] : []),
    ...(item.allowedClasses?.length ? [{ key: "client-classes", label: "database.clientItem.classes", value: item.allowedClasses.join(", ") }] : []),
    ...(item.clientDetails?.buyPriceCopper ? [{ key: "client-buy-price", label: "database.clientItem.buyPrice", value: formatCopper(item.clientDetails.buyPriceCopper) }] : []),
    ...(item.clientDetails?.sellPriceCopper ? [{ key: "client-sell-price", label: "database.clientItem.sellPrice", value: formatCopper(item.clientDetails.sellPriceCopper) }] : []),
  ];
  const primaryStats = [...visibleStatSections.flatMap((section) => section.key === "base" ? section.stats : []), ...equipmentStats];

  const showTabs = tabs.length > 1;
  const effectText = referenceState.status === "loading" || isSoulItem ? ""
    : useEffectSections.map((section) => section.text).filter(Boolean).join("\n\n") || item.description || "";
  const effects = splitItemEffects(effectText);
  const hasStructuredEffects = Boolean(effects.owned || effects.equipped);
  const hasEffectCards = compact && hasStructuredEffects;
  const compactSourceSections = sourceSections.map((section) => ({ ...section,
    links: section.links?.filter((link) => !locationSources.sources.some((source) => source.id === link.id)
      && !(link.category === "exploration" && locationSources.sources.some((source) =>
        source.locations.some((location) => location.name.startsWith(`${link.name} · `))))),
  })).filter((section) => section.text || section.facts?.length || section.rows?.length || section.links?.length);
  const quantity = getItemRewardQuantity(reward) ?? locationSources.quantity;
  const renderDescription = (text: string) => {
    const localized = gameText(text, text === item.description ? `ItemSparse:${item.id}:0` : undefined);
    return localized === text ? <ItemDescriptionLinks text={text} itemsById={itemsById} onSelect={onSelect} /> : localized;
  };

  const itemLink = (id: string, quantity?: number) => {
    const linked = itemsById.get(id);
    if (!linked) return null;
    return (
      <button key={id} type="button" onClick={() => onSelect(linked)} className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2 py-1.5 text-left text-[12px] text-zinc-200 transition-colors hover:border-accent/50 hover:bg-accent-soft">
        <ItemIcon icon={linked.icon} name={getItemDisplayName(gameText(linked.name, `ItemSparse:${linked.id}:4`))} size={24} />
        <span className={cn("min-w-0 flex-1", compact ? "break-words" : "truncate")}>{getItemDisplayName(gameText(linked.name, `ItemSparse:${linked.id}:4`))}</span>
        {quantity !== undefined && <span className="shrink-0 text-muted">×{quantity}</span>}
      </button>
    );
  };

  const renderCraftedFrom = () => {
    if (recipeLinks.length) return <ItemRecipes key={`${item.id}-recipes`} title="database.craftedFrom" links={recipeLinks}
      itemId={item.id} initialRecipeId={initialRecipeId} />;
    if (craftedFrom.length) return referenceState.status === "loading" ? null : <section>
      <DatabaseSectionTitle>{t("database.craftedFrom")}</DatabaseSectionTitle>
      <div className="space-y-3">{craftedFrom.map((recipe) => (
        <div key={recipe.id} className="max-w-[720px] rounded-[var(--radius-md)] border border-border bg-white/[0.03] p-3">
          <p className="mb-2 text-[12px] text-zinc-400">
            {recipe.profession && <span>{recipe.profession} · </span>}
            {recipe.masteryLevel !== undefined && <span>{t("database.masteryLevel", { level: recipe.masteryLevel })} · </span>}
            {t("database.recipeYield", { count: recipe.outputQuantity })}
          </p>
          {recipe.comboOutputItemId === item.id && <p className="mb-2 text-[12px] text-amber-300">{t("database.comboChance", { chance: (recipe.comboProbability ?? 0) / 100 })}</p>}
          {recipe.visibleInGame === false && <p className="mb-2 text-[11px] text-zinc-500">{t("database.unlistedRecipe")}</p>}
          <div className={cn("grid gap-1.5", !compact && "@min-[480px]:grid-cols-2")}>{recipe.ingredients.map((ingredient) => itemLink(ingredient.itemId, ingredient.quantity))}</div>
        </div>
      ))}</div>
    </section>;
    if (professionRecipes.length) return <section className="max-w-[760px]">
      <DatabaseSectionTitle>{t("database.craftedFrom")}</DatabaseSectionTitle>
      <div className="space-y-2">{professionRecipes.map(({ profession, recipe }) => <div key={`${profession.id}-${recipe.id}`}
        className="rounded-[var(--radius-md)] border border-border bg-white/[0.03] p-3">
        <p className="mb-2 text-[12px] text-zinc-400">{profession.name} · {t("professions.skill", { value: recipe.clientSkill ?? recipe.skill })}{recipe.clientSkill === undefined && recipe.estimatedSkill && " ≈"}</p>
        <div className={cn("grid gap-1.5", !compact && "@min-[480px]:grid-cols-2")}>{recipe.reagents.map((reagent) => itemsById.has(reagent.id)
          ? itemLink(reagent.id, reagent.quantity)
          : <span key={reagent.id} className="rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2 py-1.5 text-[12px] text-zinc-300">{reagent.name} ×{reagent.quantity}</span>)}</div>
      </div>)}</div>
    </section>;
    return null;
  };
  const craftingSection = showAcquisition ? renderCraftedFrom() : null;

  return (
    <div className={cn("text-left", embedded ? "block" : "flex min-h-0 flex-1 flex-col")} key={item.id}>
      {embedded ? null : compact ? <CompactItemHeader item={item} metadata={itemMetadata} sourceName={!isEquipmentItem && locationSources.sources.length === 1 ? locationSources.sources[0].name : undefined} onClose={onClose} /> : <header className={cn("relative shrink-0 overflow-hidden border-b border-border", compact ? "px-4 py-4" : "px-6 py-5")}>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent" aria-hidden="true" />
        <ReferenceBackLink label={backLabel} onBack={onBack} />
        <div className={cn("relative flex items-center", compact ? "gap-3" : "gap-4")}>
          <ItemIcon icon={item.icon} name={getItemDisplayName(gameText(item.name, `ItemSparse:${item.id}:4`))} size={compact ? 52 : 76} />
          <div className="min-w-0">
            <h2 className={cn("font-display font-semibold leading-tight text-white", compact ? "text-[16px]" : "text-[22px]")}>{getItemDisplayName(gameText(item.name, `ItemSparse:${item.id}:4`))}</h2>
            {itemMetadata}
            {item.usageLevel !== undefined && <p className="mt-1 text-[12px] text-zinc-400">{t("database.usageLevel", { level: item.usageLevel })}</p>}
            {item.clientDetails?.requiredProfession && <p className="mt-1 text-[12px] text-zinc-400">{t("database.requiredProfessionSkill", { profession: t(`professions.names.${item.clientDetails.requiredProfession.id}`), skill: item.clientDetails.requiredProfession.skill })}</p>}
            {!item.nameVerified && item.nameOrigin !== "set" && <p className="mt-1 text-[11px] text-amber-300">{t("database.unlocalizedName")}</p>}
          </div>
          {onClose && <button type="button" onClick={onClose} className="ml-auto grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-zinc-400 hover:bg-white/5 hover:text-white" aria-label={t("chrome.close")} title={t("chrome.close")}><X size={16} aria-hidden="true" /></button>}
        </div>
      </header>}
      {showTabs && <ItemDetailTabs id={tabId} value={currentTab} onChange={setActiveTab} tabs={tabs} hasStatistics={hasStatistics} compact={compact} />}
      <div key={currentTab} id={`${tabId}-panel`}
        role={showTabs ? "tabpanel" : undefined} aria-labelledby={showTabs ? `${tabId}-${currentTab}` : undefined}
        tabIndex={0}
        className={cn("@container space-y-6", compact ? "space-y-4 px-4 py-4" : "px-6 py-5", !embedded && "scroll-slim min-h-0 flex-1 overflow-y-auto")}>
        <ItemMetadataPills grade={item.grade} binding={bindingLabel} variant={item.variant} extendable={extendable} forever={item.forever} />
        {specialItems.status === "error" && <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>}
        {show("statistics") && ITEM_CATEGORY_LABEL_KEYS[item.category] === "intel.skins.voucherLabel" && <SkinVoucherDescription itemId={item.id} />}
        {show("statistics") && kisk && <section className="max-w-[760px]">
          <DatabaseSectionTitle>{t("database.specialItems.kiskLimits")}</DatabaseSectionTitle>
          <ReferenceFacts facts={[
            { label: "database.specialItems.maxMembers", value: kisk.maxMembers },
            { label: "database.specialItems.maxResurrections", value: kisk.maxResurrections },
            { label: "database.specialItems.duration", value: t("database.specialItems.durationMinutes", { count: kisk.durationSeconds / 60 }) },
          ]} />
        </section>}
        {show("statistics") && hasStatistics && (
          <section className="w-full max-w-[380px]">
            <DatabaseSectionTitle>{t("database.statistics")}</DatabaseSectionTitle>
            {item.enhancements.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1" aria-label={t("database.enhancementLevel")}>
                {[0, ...item.enhancements.map((entry) => entry.level)].map((level) => (
                  <button key={level} type="button" onClick={() => setSelectedLevel(level)} aria-pressed={selectedLevel === level} className={cn("min-w-8 cursor-pointer rounded-[var(--radius-sm)] px-2 py-1 text-[12px] tabular-nums", selectedLevel === level ? "bg-accent text-on-accent" : "bg-white/5 text-zinc-300 hover:bg-white/10")}>+{level}</button>
                ))}
              </div>
            )}
            <div className="max-w-[720px] space-y-5">
              {primaryStats.length > 0 && <StatRows stats={primaryStats} bonuses={enhancement?.stats} />}
              {visibleStatSections.filter((section) => section.key !== "base").map((section) => (
                <div key={section.key}>
                  <h4 className="mb-1.5 border-b border-border pb-1.5 text-[12px] font-semibold text-accent">{t(`database.section.${section.key}`)}</h4>
                  <StatRows stats={section.stats} />
                </div>
              ))}
              {enhancement && extraEnhancementStats.length > 0 && (
                <div>
                  <h4 className="mb-1.5 border-b border-border pb-1.5 text-[12px] font-semibold text-accent">{t("database.enhancementBonus")}</h4>
                  <StatRows stats={extraEnhancementStats} />
                </div>
              )}
              {clientStats.length > 0 && <StatRows stats={clientStats} />}
            </div>
          </section>
        )}
        {show("statistics") && Boolean(item.siteEffects?.length || item.spellLinks?.length) && <ItemSiteEffects effects={item.siteEffects} links={item.spellLinks} />}
        {show("statistics") && item.classicChanges && <ItemClassicChanges changes={item.classicChanges} />}
        {show("statistics") && item.itemSets?.map((set) => <section key={set.id} className="max-w-[760px]">
          <DatabaseSectionTitle>{t("database.clientItem.set", { name: set.name })}</DatabaseSectionTitle>
          <div className={cn("grid gap-1.5", !compact && "@min-[480px]:grid-cols-2")}>{(set.members ?? set.memberItemIds.map((id) => ({ id, name: "" })))
            .filter(({ id, name }) => itemsById.has(id) || name)
            .map(({ id, name }) => itemsById.has(id) ? itemLink(id)
              : <span key={id} className="rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2 py-1.5 text-[12px] text-zinc-300">
                {getItemDisplayName(gameText(name))}
              </span>)}</div>
          {set.bonuses && set.bonuses.length > 0 && <div className="mt-4">
            <h4 className="mb-2 text-[12px] font-semibold text-zinc-300">{t("database.clientItem.setBonuses")}</h4>
            <ul className="space-y-1.5">{set.bonuses.map((bonus) => <li key={bonus.id} className="flex gap-3 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-3 py-2 text-[12px]">
              <span className="w-16 shrink-0 font-semibold text-accent">{t("database.clientItem.pieces", { count: bonus.requiredPieces })}</span>
              <span className="text-zinc-200">{bonus.spellName}{bonus.spellId && <span className="ml-2 whitespace-nowrap"><SpellLink id={Number(bonus.spellId)} name={t("database.clientItem.setBonusSpell")} /></span>}</span>
            </li>)}</ul>
          </div>}
        </section>)}
        {show("collection") && hasCollectionProgression && <CollectibleProgressionPanel itemId={item.id} onOpenMap={onOpenMap} summaryOnly={embedded} />}
        {show("collection") && collectionUses.length > 0 && <ItemCollectionUses key={item.id} matches={collectionUses} itemsById={itemsById} />}
        {compact && (show("statistics") || !hasPrimaryTab) && quantity !== undefined && <CompactItemQuantity quantity={quantity} />}
        {show("statistics") && hasStructuredEffects && effectText && <ItemEffects text={effectText} itemName={item.name} renderDescription={renderDescription} />}
        {!compact && show("statistics") && hasStructuredEffects && effectReferences.length > 0 && <div className="max-w-[760px]"><ReferenceSections sections={effectReferences} /></div>}
        {compact && show("statistics") && !hasStructuredEffects && useEffectSections.length === 0 && effectText && <p className="border-l-2 border-accent/40 pl-3 text-[13px] leading-relaxed whitespace-pre-line text-zinc-300">{renderDescription(effectText)}</p>}
        {!compact && !hasStructuredEffects && referenceState.status !== "loading" && !isSoulItem && show("statistics") && item.description && !useEffectSections.some((section) => section.text === item.description) && (
          <section className="max-w-[760px] whitespace-pre-line border-l-2 border-accent/30 pl-4 text-[13px] leading-relaxed text-zinc-300">
            {renderDescription(item.description)}
            {item.description.includes("…") && <p className="mt-2 text-[11px] text-muted">{t("reference.dynamicValues")}</p>}
          </section>
        )}
        {!hasStructuredEffects && useEffectSections.length > 0 && <div className="max-w-[760px]"><ReferenceSections sections={useEffectSections} renderText={renderDescription} /></div>}
        {show("upgrades") && usedInRecipeLinks.length > 0 && <ItemRecipes key={`${item.id}-used-in`} title="database.usedInRecipes" links={usedInRecipeLinks} itemId={item.id} outputsOnly />}
        {show("upgrades") && usedInRecipeLinks.length === 0 && usedIn.length > 0 && <section><DatabaseSectionTitle>{t("database.usedInRecipes")}</DatabaseSectionTitle><div className={cn("grid max-w-[720px] gap-1.5", !compact && "@min-[480px]:grid-cols-2")}>{[...new Set(usedIn.flatMap((recipe) => [recipe.outputItemId, recipe.comboOutputItemId].filter((id): id is string => Boolean(id))))].map((id) => itemLink(id))}</div></section>}
        {show("dismantling") && referenceState.status === "ready" && <ItemDismantlingPanel
          item={item} sections={dismantlingSections} level={selectedLevel} onLevelChange={setSelectedLevel}
          allowed={typeof dismantlingAllowed === "boolean" ? dismantlingAllowed : undefined} />}
        {show("upgrades") && hasInlineUpgrades && <ItemUpgradePanel links={upgradeLinks} transferLinks={transferLinks} />}
        {show("upgrades") && stoneImprintResults.length > 0 && <ItemImprintChances results={stoneImprintResults} />}
        {show("upgrades") && transferLinks.length > 0 && !hasTransferOperation && <ItemTransferChances links={transferLinks} />}
        {show("upgrades") && imprintSections.map((section) => <section key={section.key}>
          <DatabaseSectionTitle>{t(`database.section.${section.key}`)}</DatabaseSectionTitle>
          <p className="mb-3 text-xs leading-relaxed text-subtle">{t("database.imprintChanceNotice")}</p>
          <div className="max-w-[900px]"><StatRows stats={section.stats} columns /></div>
        </section>)}
        {referenceState.status === "ready" && remainingReferenceSections.length > 0 && <div className="max-w-[760px]"><ReferenceSections sections={remainingReferenceSections} /></div>}
        {show("statistics") && !hasEffectCards && usageSections.length > 0 && <div className="max-w-[760px]">
          <ReferenceSections sections={usageSections} />
        </div>}
        {showAcquisition && <section ref={acquisitionSection} aria-label={t("database.acquisition.sources")} className="space-y-4 border-t border-border pt-5">
          {acquisitionState.status === "loading" && <p className="text-[12px] text-zinc-400">{t("database.acquisition.loading")}</p>}
          {acquisitionState.status === "error" && <p className="text-[12px] text-danger-text" role="alert">{t("database.acquisition.error")}</p>}
          {acquisitionState.status === "ready" && (acquisitionNotes.length > 0 || hasItemAcquisitionSources(acquisitionState.acquisition)) && <ItemAcquisitionSection key={item.id} acquisition={acquisitionState.acquisition} notes={acquisitionNotes} onOpenMap={onOpenMap} />}
          <ItemResearchPanel research={itemResearch.data} itemsById={itemsById} onOpenMap={onOpenMap}
            craftedFrom={craftingSection || craftingReferenceSections.length > 0 ? <>
              {craftingSection}
              {craftingReferenceSections.length > 0 && <ReferenceSections sections={craftingReferenceSections} />}
            </> : null}
            questRewards={questRewards.rewards} />
          {foreverGathering.data && <ForeverGatheringSources key={item.id} sources={foreverGathering.data} onOpenMap={onOpenMap} />}
          {foreverGathering.error && <p role="alert" className="text-[12px] text-danger-text">{t("database.foreverGathering.error")}</p>}
          {questRewards.error && <p role="alert" className="text-[11px] text-subtle">{t("database.questRewards.error")}</p>}
          {itemResearch.error && <p role="alert" className="text-[11px] text-subtle">{t("database.itemResearch.error")}</p>}
          {compact && locationSources.sources.length > 0 && <CompactItemSources sources={locationSources.sources} onOpenMap={onOpenMap} />}
          {locationSources.error && <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>}
          {containerReferences.status === "loading" && <p role="status" className="text-xs text-subtle">{t("database.acquisition.loading")}</p>}
          {containerReferences.status !== "loading" && (compact ? compactSourceSections : sourceSections).length > 0 && <div className="max-w-[760px]"><ReferenceSections initialCount={3} sections={compact ? compactSourceSections : sourceSections} /></div>}
          {containerReferences.status === "error" && <p role="alert" className="text-xs text-subtle">{t("reference.error")}</p>}
          {referenceState.status === "ready" && otherAcquisitionReferenceSections.length > 0 && <div className="max-w-[760px]"><ReferenceSections sections={otherAcquisitionReferenceSections} /></div>}
          {!hasAcquisition && acquisitionState.status === "ready" && itemResearch.data && <p className="text-xs text-muted">{t("database.acquisition.none")}</p>}
        </section>}
        {referenceState.status === "ready" && visibleReferenceSections.length === 0
          && currentTab === "upgrades" && !hasInlineUpgrades && imprintSections.length === 0 && usedIn.length === 0 && usedInRecipeLinks.length === 0
          && stoneImprintResults.length === 0 && transferLinks.length === 0
          && <p className="text-[12px] text-muted">{t("database.noSectionData")}</p>}
        {referenceState.status !== "ready" && <p className="text-xs text-muted" role={referenceState.status === "error" ? "alert" : "status"}>{t(referenceState.status === "error" ? "reference.error" : "reference.loading")}</p>}
      </div>
    </div>
  );
};

export default ItemDetail;
