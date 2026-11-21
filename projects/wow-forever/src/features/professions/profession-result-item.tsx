import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import DatabaseSectionTitle from "../database/database-section-title";
import ItemSiteEffects from "../database/item-site-effects";
import type { DatabaseItem } from "../database/item-database-types";

const ProfessionResultItem = ({ item }: { item: DatabaseItem }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const visibleSpellLinks = item.spellLinks?.filter((spell) => spell.name.trim().toLocaleLowerCase() !== item.name.trim().toLocaleLowerCase());
  const formatCopper = (amount: number) => {
    const gold = Math.floor(amount / 10000);
    const silver = Math.floor(amount % 10000 / 100);
    const copper = amount % 100;
    return [gold > 0 ? t("database.clientItem.gold", { count: gold.toLocaleString(i18n.language) }) : "",
      silver > 0 ? t("database.clientItem.silver", { count: silver }) : "",
      copper > 0 || gold === 0 && silver === 0 ? t("database.clientItem.copper", { count: copper }) : ""]
      .filter(Boolean).join(" ");
  };
  const facts = [
    ...(item.itemLevel !== undefined ? [{ key: "item-level", label: t("database.clientItem.itemLevel"), value: String(item.itemLevel) }] : []),
    ...(item.usageLevel !== undefined ? [{ key: "required-level", label: t("professions.resultItemRequiredLevel"), value: String(item.usageLevel) }] : []),
    ...(item.clientDetails?.stackSize ? [{ key: "stack", label: t("database.clientItem.stackSize"), value: String(item.clientDetails.stackSize) }] : []),
    ...(item.clientDetails?.sellPriceCopper ? [{ key: "sell", label: t("database.clientItem.sellPrice"), value: formatCopper(item.clientDetails.sellPriceCopper) }] : []),
    ...item.sections.flatMap((section) => section.stats.map((stat) => ({ key: `${section.key}-${stat.key}`,
      label: t(stat.label, { defaultValue: gameText(stat.label) }), value: stat.value }))),
  ];

  return <section className="rounded-[var(--radius-md)] border border-border p-4">
    {facts.length > 0 && <div>
      <DatabaseSectionTitle>{t("database.statistics")}</DatabaseSectionTitle>
      <dl className="mt-2 grid gap-2 @min-[520px]:grid-cols-2">{facts.map((fact) => <div key={fact.key}
        className="flex min-w-0 justify-between gap-3 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-[12px]">
        <dt className="text-subtle">{fact.label}</dt><dd className="text-right font-medium tabular-nums text-zinc-100">{fact.value}</dd>
      </div>)}</dl>
    </div>}
    {Boolean(item.siteEffects?.length || visibleSpellLinks?.length) && <div className={facts.length ? "mt-4 border-t border-border pt-3" : ""}>
      <ItemSiteEffects effects={item.siteEffects} links={visibleSpellLinks} transparentCards />
    </div>}
    {item.description && !item.siteEffects?.length && <p className="mt-4 border-t border-border pt-3 text-[12px] leading-relaxed text-zinc-300">{gameText(item.description)}</p>}
  </section>;
};

export default ProfessionResultItem;
