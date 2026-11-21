import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { getItemDisplayName } from "../../lib/item-display-name";
import type { DatabaseItem } from "./item-database-types";
import ItemGrade from "./item-grade";
import ItemIcon from "./item-icon";

const ItemTooltipContent = ({ item }: { item: DatabaseItem }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const stats = item.sections.find((section) => section.key === "base")?.stats.slice(0, 4) ?? [];

  return <span className="block max-w-[14rem] text-left">
    <span className="flex items-center gap-2">
      <ItemIcon icon={item.icon} name={item.name} size={30} />
      <span className="min-w-0 font-semibold text-accent">{getItemDisplayName(gameText(item.name))}</span>
    </span>
    <span className="mt-1 block font-normal text-subtle">
      <ItemGrade grade={item.grade} /> · {gameText(item.category)}
    </span>
    {item.itemLevel !== undefined && item.itemLevel > 0 && <span className="mt-0.5 block font-normal text-zinc-200">{t("database.itemLevel", { level: item.itemLevel })}</span>}
    {item.usageLevel !== undefined && item.usageLevel > 0 && <span className="mt-0.5 block font-normal text-zinc-200">{t("database.usageLevel", { level: item.usageLevel })}</span>}
    {item.clientDetails?.requiredProfession && <span className="mt-0.5 block font-normal text-zinc-200">{t("database.requiredProfessionSkill", { profession: t(`professions.names.${item.clientDetails.requiredProfession.id}`), skill: item.clientDetails.requiredProfession.skill })}</span>}
    {item.clientDetails?.stackSize && <span className="mt-0.5 block font-normal text-zinc-200">{t("database.clientItem.stackSize")}: {item.clientDetails.stackSize}</span>}
    {stats.map((stat) => <span key={stat.key} className="mt-0.5 block font-normal text-zinc-200">
      {stat.value} {t(stat.label, { defaultValue: gameText(stat.label) })}
    </span>)}
    {item.description && <span className="mt-1 block line-clamp-3 border-t border-border pt-1 font-normal text-zinc-300">{gameText(item.description)}</span>}
  </span>;
};

export default ItemTooltipContent;
