import type { TFunction } from "i18next";
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { humanize } from "../../lib/humanize";
import ItemAcquisitionSection from "./item-acquisition-section";
import ItemCraftingSection from "./item-crafting-section";
import ItemEffectCard from "./item-effect-card";
import type { MapLocationNavigationTarget } from "../map/map-location-navigation";
import type { ItemDatabaseEntry } from "./types";

const formatCollection = (value: string) => value
  .split(";")
  .map(humanize)
  .join(" · ");

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h2 className="mb-2.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">
    <span className="h-px w-3 bg-accent/60" aria-hidden="true" />
    {children}
  </h2>
);

const describeDice = (value: string | undefined, t: TFunction) => {
  const match = value?.match(/^(\d+)d(\d+)$/i);
  if (!match) return null;
  const count = Number(match[1]);
  const sides = Number(match[2]);
  return {
    range: t("items.dice.range", {
      minimum: count,
      maximum: count * sides,
    }),
    notation: t("items.dice.notation", {
      count,
      sides,
      notation: value,
    }),
  };
};

interface ItemDatabaseFactsProps {
  item: ItemDatabaseEntry;
  onNavigateMapLocation: (target: MapLocationNavigationTarget) => void;
  layout: "page" | "panel";
  /** Off where the surrounding panel already prints the flavour text. */
  showDescription?: boolean;
  /** Off when acquisition links are rendered later in the surrounding panel. */
  showAcquisition?: boolean;
  onSelectRelatedItem?: (itemId: string) => void;
}

/**
 * Everything the item database knows about one item below its identity header:
 * flavour text, headline stats, granted abilities and acquisition sources.
 * Shared by the database page and the map's item marker panel so both always
 * show the same facts.
 */
const ItemDatabaseFacts = ({
  item,
  onNavigateMapLocation,
  layout,
  showDescription = true,
  showAcquisition = true,
  onSelectRelatedItem,
}: ItemDatabaseFactsProps) => {
  const { t, i18n } = useTranslation();
  const panel = layout === "panel";
  const description = item.localizedDescriptions[i18n.language]
    ?? item.localizedDescriptions.en
    ?? item.description;
  const damageDice = describeDice(item.gameplay.damage, t);
  const metrics = useMemo(() => [
    {
      label: t("items.stats.damage"),
      value: damageDice?.range ?? item.gameplay.damage,
      description: damageDice?.notation,
    },
    { label: t("items.stats.damageType"), value: item.gameplay.damageType },
    { label: t("items.stats.armorClass"), value: item.gameplay.armorClass },
    // "None" is a source sentinel, not an armor category to show as a fact.
    { label: t("items.stats.armorType"), value: item.gameplay.armorType === "None" ? undefined : item.gameplay.armorType },
    { label: t("items.stats.weaponType"), value: item.gameplay.weaponType },
    { label: t("items.stats.proficiency"), value: item.gameplay.proficiency },
    { label: t("items.stats.slot"), value: item.gameplay.slot },
    { label: t("items.stats.value"), value: item.gameplay.value },
    (item.gameplay.enchantment ?? 0) > 0 && {
      label: t("items.stats.enchantment"),
      value: `+${item.gameplay.enchantment}`,
      description: t("items.stats.enchantmentDescription", { value: item.gameplay.enchantment }),
    },
  ].filter((metric): metric is { label: string; value: string; description?: string } => (
    metric !== false && metric.value !== undefined && metric.value !== ""
  )), [damageDice, item, t]);
  const effects = item.gameplay.effects ?? [];

  return (
    <>
      {showDescription && description && (
        <p className={cn(
          "max-w-3xl whitespace-pre-line text-zinc-300",
          panel ? "text-[13px] leading-relaxed" : "border-l-2 border-accent/40 pl-3.5 text-[13px] leading-6",
        )}>
          {description}
        </p>
      )}

      {metrics.length > 0 && (
        <section>
          <SectionTitle>{t("items.sections.overview")}</SectionTitle>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))" }}
          >
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-[var(--radius-md)] border border-border bg-surface px-3.5 py-3">
                <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-muted">{metric.label}</p>
                <p className="mt-1 break-words text-[13px] font-semibold text-white">{formatCollection(metric.value)}</p>
                {metric.description && (
                  <p className="mt-1 text-[11px] leading-4 text-muted">{metric.description}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {effects.length > 0 && (
        <section>
          <SectionTitle>{t("items.sections.grantedAbilities")}</SectionTitle>
          <div className={cn("grid gap-2", !panel && "md:grid-cols-2")}>
            {effects.map((effect) => <ItemEffectCard key={effect.id} effect={effect} />)}
          </div>
        </section>
      )}

      <ItemCraftingSection
        key={`crafting:${item.id}`}
        item={item}
        onSelectItem={onSelectRelatedItem}
      />

      {showAcquisition && (
        <ItemAcquisitionSection
          key={item.id}
          acquisitions={item.acquisitions ?? []}
          initialLimit={panel ? 3 : undefined}
          onNavigateMapLocation={onNavigateMapLocation}
        />
      )}
    </>
  );
};

export default ItemDatabaseFacts;
