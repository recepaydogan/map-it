import { getItemDisplayName } from "../../lib/item-display-name";
import type { ReferenceTarget } from "../reference/reference-types";
import { getItemRewardQuantity } from "./item-reward-quantity";
import ItemEffects from "./item-effects";
import CompactItemSources from "./compact-item-sources";
import { CompactItemHeader, CompactItemQuantity } from "./compact-item-header";
import ItemMetadata from "./item-metadata";
import { useItemLocationSources } from "./use-item-location-sources";
import { splitItemEffects } from "./item-effect-description";
import ItemDescriptionLinks from "./item-description-links";
import ReferenceBackLink from "../reference/reference-back-link";
import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import { getItemCategoryGroup, ITEM_CATEGORY_LABEL_KEYS, ITEM_PET_EFFECT, ITEM_POSSIBLE_ACQUISITION_KEYS, COLLECTIBLE_PROGRESSION, EVENT_CANDY_FRAGMENT_ITEM_ID, EVENT_CANDY_FRAGMENT_KEY_SHORTHAND, EVENT_CANDY_KEY_ITEM_IDS } from "../../game-config";
import CollectibleProgressionPanel from "../reference/collectible-progression-panel";
import ItemDetailTabs, { ITEM_DETAIL_TABS, type ItemDetailTab } from "./item-detail-tabs";
import { getItemSectionTab, isAcquisitionSection } from "./item-detail-sections";
import { getItemSourceSections } from "./item-source-sections";
import DatabaseSectionTitle from "./database-section-title";
import ItemAcquisitionSection from "./item-acquisition";
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
import ReferenceSections, { ReferenceFacts, ReferenceLinks } from "../reference/reference-sections";
import { useItemReference, useItemReferences, useIntelligenceData } from "../reference/use-reference-data";
import type { CollectionData, SpecialItemDetailsData } from "../intelligence/intelligence-types";
import CompanionSources from "../intelligence/companion-sources";
import EventCandyKeyAcquisition from "../events/event-candy-key-acquisition";

const rememberedItemTabs = new Map<string, ItemDetailTab>();

const StatRows = ({ stats, bonuses = [], columns = false }: { stats: ItemStat[]; bonuses?: ItemStat[]; columns?: boolean }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const bonusesByKey = new Map(bonuses.map((bonus) => [bonus.key, bonus.value]));
  return <dl className={cn(columns ? "grid grid-cols-1 gap-x-8 gap-y-2 @min-[760px]:grid-cols-2" : "space-y-1")}>
    {stats.map((stat) => (
      <div key={stat.key} className="flex min-w-0 justify-between gap-4 text-[13px]">
        <dt className="min-w-0 text-zinc-300">{gameText(stat.label)}
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
  item, recipes, itemsById, onSelect, onOpenMap, onClose, backLabel, onBack, compact = false, embedded = false, initialRecipeId, initialEnhancementLevel, reward,
}: {
  item: DatabaseItem;
  reward?: Pick<ReferenceTarget, "quantity" | "quantityMax" | "rewardRates">;
  recipes: DatabaseRecipe[];
  itemsById: Map<string, DatabaseItem>;
  onSelect: (item: DatabaseItem) => void;
  onOpenMap?: (mapId: string, markerId: string) => void;
  onClose?: () => void;
  compact?: boolean;
  embedded?: boolean;
  initialRecipeId?: string;
  initialEnhancementLevel?: number;
  backLabel?: string;
  onBack?: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const specialItems = useIntelligenceData<SpecialItemDetailsData>("special-item-details");
  const specialDetails = specialItems.status === "ready" ? specialItems.data : null;
  const extendable = specialDetails?.extendableWeapons.includes(item.id) ?? false;
  const kisk = specialDetails?.kisks[item.id];
  const isEventCandyKey = EVENT_CANDY_KEY_ITEM_IDS.some((id) => id === item.id);
  const isEventCandyFragment = item.id === EVENT_CANDY_FRAGMENT_ITEM_ID;
  const hasCollectionProgression = COLLECTIBLE_PROGRESSION.itemIds.includes(item.id);
  const referenceState = useItemReference(item.id);
  const rawReferenceSections = referenceState.status === "ready" ? referenceState.data : [];
  const useEffectSection = rawReferenceSections.find((section) => section.title === "reference.labels.use-effect");
  const useEffectLinks = useEffectSection?.links ?? [];
  const unlockLinks = useEffectLinks.map((link) => ({
    ...link,
    icon: link.icon ?? ((link.category === "mounts" || link.category === "wings") ? item.icon : undefined),
  }));
  const visibleDescription = referenceState.status === "loading" ? "" : useEffectSection?.text || item.description || "";
  const describedEffects = splitItemEffects(visibleDescription);
  const hasStatistics = item.sections.some((section) => section.key !== "imprint" && section.stats.length > 0)
    || item.enhancements.some((entry) => entry.stats.length > 0)
    || Boolean(item.equipment && Object.values(item.equipment).some((value) => value !== undefined))
    || Boolean(kisk || describedEffects.owned || describedEffects.equipped);
  const [selectedLevel, setSelectedLevel] = useState(() =>
    initialEnhancementLevel !== undefined && item.enhancements.some((entry) => entry.level === initialEnhancementLevel)
      ? initialEnhancementLevel : 0);
  const tabMemoryKey = `${compact ? "map" : "database"}:${item.id}`;
  const [activeTab, setActiveTab] = useState<ItemDetailTab>(() => isEventCandyKey ? "statistics" : (isEventCandyFragment || initialRecipeId) ? "acquisition"
    : rememberedItemTabs.get(tabMemoryKey) ?? (hasCollectionProgression ? "collection"
      : hasStatistics || item.description || ITEM_CATEGORY_LABEL_KEYS[item.category] === "intel.skins.voucherLabel" ? "statistics" : "acquisition"));
  useEffect(() => { rememberedItemTabs.set(tabMemoryKey, activeTab); }, [tabMemoryKey, activeTab]);
  const tabId = useId();
  const acquisitionState = useItemAcquisition(item.id);
  const visibleRecipe = (id: string) => !id.startsWith("ConversionRecipe:")
    || specialDetails !== null && !specialDetails.hiddenRecipes.includes(id);
  const collectionState = useIntelligenceData<CollectionData>("collections");
  const collectionUses = collectionState.status === "ready" ? collectionState.data.objectives.filter(o => o.items.includes(item.id)) : [];
  // Older published content can still include this removed section.
  const legacyUsageSection = rawReferenceSections.find((section) => section.title === "reference.labels.usage-and-restrictions");
  const referenceSections = rawReferenceSections.filter((section) => section !== legacyUsageSection && section !== useEffectSection);
  const legacyFact = (label: string) => legacyUsageSection?.facts?.find((fact) => fact.label === label)?.value;
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
  const isEquipmentItem = ["weapons", "armor", "accessories"].includes(getItemCategoryGroup(item.category));
  const binding = item.binding ?? legacyFact("reference.labels.trade-and-binding");
  const bindingLabel = typeof binding === "string"
    ? binding === "Non Exchangeable" ? t("database.compact.untradable") : binding
    : undefined;
  const itemMetadata = <ItemMetadata
    category={t(ITEM_CATEGORY_LABEL_KEYS[item.category] ?? item.category, { defaultValue: gameText(item.category) })}
    grade={item.grade} binding={bindingLabel} variant={item.variant} extendable={extendable} />;
  const enhancement = item.enhancements.find((entry) => entry.level === selectedLevel);
  const baseStatKeys = new Set(item.sections.flatMap((section) => section.key === "base" ? section.stats.map((stat) => stat.key) : []));
  const extraEnhancementStats = enhancement?.stats.filter((stat) => !baseStatKeys.has(stat.key)) ?? [];
  const craftedFrom = recipes.filter((recipe) => recipe.ingredients.length > 0 && (
    recipe.outputItemId === item.id || recipe.comboOutputItemId === item.id
  ));
  const usedIn = recipes.filter((recipe) => recipe.ingredients.some((ingredient) => ingredient.itemId === item.id));
  const upgradeLinks = referenceSections.filter((section) => section.title === "reference.labels.upgrades-and-sets")
    .flatMap((section) => section.links ?? []);
  const hasInlineUpgrades = upgradeLinks.some((link) => Boolean(getUpgradeOperation(link)));
  const transferLinks = referenceSections.filter((section) => section.title === "reference.labels.transfer-chances")
    .flatMap((section) => section.links ?? []);
  const stoneImprintResults = referenceSections.flatMap((section) => section.imprintResults ?? []);
  const hasTransferOperation = upgradeLinks.some((link) => getUpgradeOperation(link) === "transfer");
  const hasEquipmentTabs = isEquipmentItem || Boolean(item.equipment) || item.enhancements.length > 0 || hasInlineUpgrades
    || transferLinks.length > 0 || stoneImprintResults.length > 0;
  const dismantlingSections = referenceSections.filter((section) => section.title === "reference.labels.dismantling");
  const canDismantle = item.canDismantle ?? legacyFact("reference.labels.can-be-dismantled");
  const hasDetails = Boolean(visibleDescription.trim())
    || ITEM_CATEGORY_LABEL_KEYS[item.category] === "intel.skins.voucherLabel"
    || nonRecipeSections.some((section) => getItemSectionTab(section) === "statistics");
  const hasPrimaryTab = hasStatistics || hasDetails;
  const tabs: readonly ItemDetailTab[] = isEventCandyKey ? ["statistics"] : isEventCandyFragment ? ["acquisition"] : ITEM_DETAIL_TABS.filter((tab) => tab === "collection" ? hasCollectionProgression || collectionUses.length > 0
    : tab === "statistics" ? hasPrimaryTab : hasEquipmentTabs || tab === "acquisition"
    || (tab === "upgrades" && (usedIn.length > 0 || usedInRecipeLinks.length > 0
      || item.sections.some((section) => section.key === "imprint")
      || nonRecipeSections.some((section) => getItemSectionTab(section) === "upgrades")))
    || (tab === "dismantling" && (canDismantle === true || dismantlingSections.length > 0)));
  const currentTab = tabs.includes(activeTab) ? activeTab : tabs[0] ?? "acquisition";
  const show = (tab: ItemDetailTab) => currentTab === tab;
  const showStandardAcquisition = show("acquisition") && !isEventCandyKey && !isEventCandyFragment;
  const visibleReferenceSections = nonRecipeSections.filter((section) => !isAcquisitionSection(section)
    && !["reference.labels.transfer-chances", "reference.labels.imprint-chances"].includes(section.title)
    && (show(getItemSectionTab(section))
      && section.title !== "reference.labels.dismantling"
      && !(section.title === "reference.labels.crafted-from" && craftedFrom.length > 0)
      && !(section.title === "reference.labels.used-in-recipes" && usedIn.length > 0)))
    .map((section) => section.title === "reference.labels.upgrades-and-sets"
      ? { ...section, title: "database.upgradePanel.related", links: section.links?.filter((link) => !getUpgradeOperation(link)) }
      : section)
    .filter((section) => section.title !== "database.upgradePanel.related" || section.links?.length);
  const possibleAcquisitionKey = ITEM_POSSIBLE_ACQUISITION_KEYS[item.id];
  const acquisitionNotes = getItemAcquisitionNotes(item.description);
  if (possibleAcquisitionKey && referenceState.status === "ready" && acquisitionState.status === "ready"
    && !acquisitionState.acquisition && sourceSections.length === 0 && craftedFrom.length === 0
    && recipeLinks.length === 0 && visibleReferenceSections.length === 0) {
    acquisitionNotes.push(t(possibleAcquisitionKey));
  }
  const petUnlockId = useEffectSection?.facts?.some((fact) => fact.label === "reference.labels.effect" && fact.value === ITEM_PET_EFFECT)
    ? useEffectSection.links?.find((link) => link.category === "mounts")?.id
    : undefined;
  const visibleStatSections = item.sections.filter((section) => section.key !== "imprint");
  const imprintSections = item.sections.filter((section) => section.key === "imprint");
  const equipmentStats: ItemStat[] = [];
  if (item.equipment?.horizontalRangeMeters !== undefined) equipmentStats.push({ key: "horizontalRange", label: t("database.horizontalRange"), value: t("database.meters", { value: item.equipment.horizontalRangeMeters.toLocaleString(i18n.language) }) });
  if (item.equipment?.verticalRangeMeters !== undefined) equipmentStats.push({ key: "verticalRange", label: t("database.verticalRange"), value: t("database.meters", { value: item.equipment.verticalRangeMeters.toLocaleString(i18n.language) }) });
  if (item.equipment?.soulImprintSlots !== undefined) equipmentStats.push({ key: "soulImprintSlots", label: t("database.soulImprintSlots"), value: String(item.equipment.soulImprintSlots) });
  if (item.equipment?.soulstoneSlots !== undefined) equipmentStats.push({ key: "soulstoneSlots", label: t("database.soulstoneSlots"), value: String(item.equipment.soulstoneSlots) });
  if (item.equipment?.theostoneSlots !== undefined) equipmentStats.push({ key: "theostoneSlots", label: t("database.theostoneSlots"), value: String(item.equipment.theostoneSlots) });
  const primaryStats = [...visibleStatSections.flatMap((section) => section.key === "base" ? section.stats : []), ...equipmentStats];

  const showTabs = isEventCandyKey || (!isEventCandyFragment && (!compact || tabs.length > 1));
  const effectText = visibleDescription;
  const effects = splitItemEffects(effectText);
  const hasStructuredEffects = Boolean(effects.owned || effects.equipped);
  const compactSourceSections = sourceSections.map((section) => ({ ...section,
    links: section.links?.filter((link) => !locationSources.sources.some((source) => source.id === link.id)
      && !(link.category === "exploration" && locationSources.sources.some((source) =>
        source.locations.some((location) => location.name.startsWith(`${link.name} · `))))),
  })).filter((section) => section.text || section.facts?.length || section.rows?.length || section.links?.length);
  const quantity = getItemRewardQuantity(reward) ?? locationSources.quantity;
  const renderDescription = (text: string) => {
    const localized = gameText(text);
    if (item.id === EVENT_CANDY_FRAGMENT_ITEM_ID && localized === text
      && text.includes(EVENT_CANDY_FRAGMENT_KEY_SHORTHAND)) {
      const [red, yellow, blue] = EVENT_CANDY_KEY_ITEM_IDS.map((id) => itemsById.get(id));
      if (red && yellow && blue) {
        const description = t("database.candyKeyFragmentDescription", {
          red: red.name, yellow: yellow.name, blue: blue.name,
        });
        return <ItemDescriptionLinks text={description} itemsById={itemsById} onSelect={onSelect} />;
      }
    }
    return localized === text ? <ItemDescriptionLinks text={text} itemsById={itemsById} onSelect={onSelect} /> : localized;
  };

  const itemLink = (id: string, quantity?: number) => {
    const linked = itemsById.get(id);
    if (!linked) return null;
    return (
      <button key={id} type="button" onClick={() => onSelect(linked)} className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2 py-1.5 text-left text-[12px] text-zinc-200 transition-colors hover:border-accent/50 hover:bg-accent-soft">
        <ItemIcon icon={linked.icon} name={getItemDisplayName(linked.name, gameText(linked.name, linked.id))} size={24} />
        <span className="min-w-0 flex-1 truncate">{getItemDisplayName(linked.name, gameText(linked.name, linked.id))}</span>
        {quantity !== undefined && <span className="text-muted">×{quantity}</span>}
      </button>
    );
  };

  return (
    <div className={cn("text-left", embedded ? "block" : "flex min-h-0 flex-1 flex-col")} key={item.id}>
      {embedded ? null : compact ? <CompactItemHeader item={item} metadata={itemMetadata} sourceName={!isEquipmentItem && locationSources.sources.length === 1 ? locationSources.sources[0].name : undefined} onClose={onClose} /> : <header className={cn("relative shrink-0 overflow-hidden border-b border-border", compact ? "px-4 py-4" : "px-6 py-5")}>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent" aria-hidden="true" />
        <ReferenceBackLink label={backLabel} onBack={onBack} />
        <div className={cn("relative flex items-center", compact ? "gap-3" : "gap-4")}>
          <ItemIcon icon={item.icon} name={getItemDisplayName(item.name, gameText(item.name, item.id))} size={compact ? 52 : 76} />
          <div className="min-w-0">
            <h2 className={cn("font-display font-semibold leading-tight text-white", compact ? "text-[16px]" : "text-[22px]")}>{getItemDisplayName(item.name, gameText(item.name, item.id))}</h2>
            {itemMetadata}
            {item.usageLevel !== undefined && <p className="mt-1 text-[12px] text-zinc-400">{t("database.usageLevel", { level: item.usageLevel })}</p>}
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
        {show("collection") && hasCollectionProgression && <CollectibleProgressionPanel itemId={item.id} onOpenMap={onOpenMap} summaryOnly={embedded} />}
        {show("collection") && collectionUses.length > 0 && <ItemCollectionUses key={item.id} matches={collectionUses} itemsById={itemsById} />}
        {compact && (show("statistics") || !hasPrimaryTab) && quantity !== undefined && <CompactItemQuantity quantity={quantity} />}
        {show("statistics") && !isEventCandyKey && hasStructuredEffects && effectText && <ItemEffects text={effectText} itemName={item.name} renderDescription={renderDescription} />}
        {compact && show("statistics") && !isEventCandyKey && !hasStructuredEffects && effectText && <p className="border-l-2 border-accent/40 pl-3 text-[13px] leading-relaxed whitespace-pre-line text-zinc-300">{renderDescription(effectText)}</p>}
        {!compact && !isEventCandyKey && !hasStructuredEffects && show("statistics") && visibleDescription && (
          <section className="max-w-[760px] whitespace-pre-line border-l-2 border-accent/30 pl-4 text-[13px] leading-relaxed text-zinc-300">
            {renderDescription(visibleDescription)}
            {visibleDescription.includes("…") && <p className="mt-2 text-[11px] text-muted">{t("reference.dynamicValues")}</p>}
          </section>
        )}
        {show("statistics") && unlockLinks.length > 0 && <section className="max-w-[760px] space-y-3">
          <DatabaseSectionTitle>{t("reference.labels.unlocks")}</DatabaseSectionTitle>
          <ReferenceLinks links={unlockLinks} />
        </section>}
        {show("statistics") && hasStatistics && (
          <section>
            <DatabaseSectionTitle>{t("database.statistics")}</DatabaseSectionTitle>
            {item.enhancements.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1" aria-label={t("database.enhancementLevel")}>
                {[0, ...item.enhancements.map((entry) => entry.level)].map((level) => (
                  <button key={level} type="button" onClick={() => setSelectedLevel(level)} aria-pressed={selectedLevel === level} className={cn("min-w-8 cursor-pointer rounded-[var(--radius-sm)] px-2 py-1 text-[12px] tabular-nums", selectedLevel === level ? "bg-accent text-on-accent" : "bg-white/5 text-zinc-300 hover:bg-white/10")}>+{level}</button>
                ))}
              </div>
            )}
            {item.itemLevel !== undefined && <p className="mb-3 text-[12px] text-zinc-400">{t("database.itemLevel", { level: item.itemLevel + (enhancement?.itemLevelBonus ?? 0) })}</p>}
            <div className="max-w-[720px] space-y-5">
              {primaryStats.length > 0 && <StatRows stats={primaryStats} bonuses={enhancement?.stats} />}
              {visibleStatSections.filter((section) => section.key !== "base").map((section) => (
                <div key={section.key}>
                  <h4 className="mb-1.5 border-b border-border pb-1.5 text-[12px] font-semibold text-accent">{t(`database.section.${section.key}`)}</h4>
                  <StatRows stats={section.stats} />
                </div>
              ))}
              {enhancement && (
                <div>
                  {extraEnhancementStats.length > 0 && <h4 className="mb-1.5 border-b border-border pb-1.5 text-[12px] font-semibold text-accent">{t("database.enhancementBonus")}</h4>}
                  {extraEnhancementStats.length > 0 && <StatRows stats={extraEnhancementStats} />}
                </div>
              )}
            </div>
          </section>
        )}
        {isEventCandyFragment && acquisitionState.status === "loading" && <p role="status" className="text-xs text-subtle">{t("database.acquisition.loading")}</p>}
        {isEventCandyFragment && acquisitionState.status === "error" && <p role="alert" className="text-xs text-danger-text">{t("database.acquisition.error")}</p>}
        {isEventCandyFragment && acquisitionState.status === "ready" && <ItemAcquisitionSection itemId={item.id} acquisition={acquisitionState.acquisition} onOpenMap={onOpenMap} />}
        {showStandardAcquisition && acquisitionState.status === "loading" && <p className="text-[12px] text-zinc-400">{t("database.acquisition.loading")}</p>}
        {showStandardAcquisition && petUnlockId && <div className="max-w-[760px]"><CompanionSources id={petUnlockId} /></div>}
        {showStandardAcquisition && acquisitionState.status === "error" && <p className="text-[12px] text-danger-text" role="alert">{t("database.acquisition.error")}</p>}
        {showStandardAcquisition && acquisitionState.status === "ready" && (acquisitionNotes.length > 0 || acquisitionState.acquisition || (referenceState.status === "ready" && sourceSections.length === 0 && craftedFrom.length === 0 && recipeLinks.length === 0 && visibleReferenceSections.length === 0)) && <ItemAcquisitionSection key={item.id} itemId={item.id} acquisition={acquisitionState.acquisition} notes={acquisitionNotes} onOpenMap={onOpenMap} />}
        {compact && showStandardAcquisition && locationSources.sources.length > 0 && <CompactItemSources sources={locationSources.sources} onOpenMap={onOpenMap} />}
        {showStandardAcquisition && locationSources.error && <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>}
        {showStandardAcquisition && containerReferences.status === "loading" && <p role="status" className="text-xs text-subtle">{t("database.acquisition.loading")}</p>}
        {showStandardAcquisition && containerReferences.status !== "loading" && (compact ? compactSourceSections : sourceSections).length > 0 && <div className="max-w-[760px]"><ReferenceSections initialCount={4} compactLinks sections={compact ? compactSourceSections : sourceSections} /></div>}
        {showStandardAcquisition && containerReferences.status === "error" && <p role="alert" className="text-xs text-subtle">{t("reference.error")}</p>}
        {showStandardAcquisition && recipeLinks.length > 0 && <ItemRecipes key={`${item.id}-recipes`} links={recipeLinks} itemId={item.id} initialRecipeId={initialRecipeId} />}
        {showStandardAcquisition && referenceState.status !== "loading" && recipeLinks.length === 0 && craftedFrom.length > 0 && (
          <section>
            <DatabaseSectionTitle>{t("database.craftedFrom")}</DatabaseSectionTitle>
            <div className="space-y-3">{craftedFrom.map((recipe) => (
              <div key={recipe.id} className="max-w-[720px] rounded-[var(--radius-md)] border border-border bg-white/[0.03] p-3">
                <p className="mb-2 text-[12px] text-zinc-400">
                  {recipe.profession && <span>{gameText(recipe.profession)} · </span>}
                  {recipe.masteryLevel !== undefined && <span>{t("database.masteryLevel", { level: recipe.masteryLevel })} · </span>}
                  {t("database.recipeYield", { count: recipe.outputQuantity })}
                </p>
                {recipe.comboOutputItemId === item.id && <p className="mb-2 text-[12px] text-amber-300">{t("database.comboChance", { chance: (recipe.comboProbability ?? 0) / 100 })}</p>}
                {recipe.visibleInGame === false && <p className="mb-2 text-[11px] text-zinc-500">{t("database.unlistedRecipe")}</p>}
                <div className="grid gap-1.5 sm:grid-cols-2">{recipe.ingredients.map((ingredient) => itemLink(ingredient.itemId, ingredient.quantity))}</div>
              </div>
            ))}</div>
          </section>
        )}
        {show("upgrades") && usedInRecipeLinks.length > 0 && <ItemRecipes key={`${item.id}-used-in`} title="database.usedInRecipes" links={usedInRecipeLinks} itemId={item.id} outputsOnly />}
        {show("upgrades") && usedInRecipeLinks.length === 0 && usedIn.length > 0 && <section><DatabaseSectionTitle>{t("database.usedInRecipes")}</DatabaseSectionTitle><div className="grid max-w-[720px] gap-1.5 sm:grid-cols-2">{[...new Set(usedIn.flatMap((recipe) => [recipe.outputItemId, recipe.comboOutputItemId].filter((id): id is string => Boolean(id))))].map((id) => itemLink(id))}</div></section>}
        {show("dismantling") && referenceState.status === "ready" && <ItemDismantlingPanel
          item={item} sections={dismantlingSections} level={selectedLevel} onLevelChange={setSelectedLevel}
          allowed={typeof canDismantle === "boolean" ? canDismantle : undefined} />}
        {show("upgrades") && hasInlineUpgrades && <ItemUpgradePanel links={upgradeLinks} transferLinks={transferLinks} />}
        {show("upgrades") && stoneImprintResults.length > 0 && <ItemImprintChances results={stoneImprintResults} />}
        {show("upgrades") && transferLinks.length > 0 && !hasTransferOperation && <ItemTransferChances links={transferLinks} />}
        {show("upgrades") && imprintSections.map((section) => <section key={section.key}>
          <DatabaseSectionTitle>{t(`database.section.${section.key}`)}</DatabaseSectionTitle>
          <p className="mb-3 text-xs leading-relaxed text-subtle">{t("database.imprintChanceNotice")}</p>
          <div className="max-w-[900px]"><StatRows stats={section.stats} columns /></div>
        </section>)}
        {!isEventCandyFragment && referenceState.status === "ready" && visibleReferenceSections.length > 0 && <div className="max-w-[760px]"><ReferenceSections sections={visibleReferenceSections} /></div>}
        {referenceState.status === "ready" && visibleReferenceSections.length === 0
          && currentTab === "upgrades" && !hasInlineUpgrades && imprintSections.length === 0 && usedIn.length === 0 && usedInRecipeLinks.length === 0
          && stoneImprintResults.length === 0 && transferLinks.length === 0
          && <p className="text-[12px] text-muted">{t("database.noSectionData")}</p>}
        {!isEventCandyFragment && referenceState.status !== "ready" && <p className="text-xs text-muted" role={referenceState.status === "error" ? "alert" : "status"}>{t(referenceState.status === "error" ? "reference.error" : "reference.loading")}</p>}
        {isEventCandyKey && show("statistics") && <EventCandyKeyAcquisition itemId={item.id} />}
      </div>
    </div>
  );
};

export default ItemDetail;
