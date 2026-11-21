import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../components/tooltip";
import { useGameText } from "../../i18n/game-text";
import { getItemDisplayName } from "../../lib/item-display-name";
import { cn } from "../../lib/cn";
import ItemGrade from "../database/item-grade";
import ItemIcon from "../database/item-icon";
import type { DatabaseItem, ItemStat } from "../database/item-database-types";
import { openReference } from "../reference/reference-navigation";
import type { CharacterItem } from "./character-profile-api";

const slotLabel = (value: string): string => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/(\D)(\d+)$/, "$1 $2");

const StatPreview = ({ stats }: { stats: ItemStat[] }) => {
  const gameText = useGameText();
  return <dl className="space-y-1">
    {stats.map((stat) => <div key={stat.key} className="flex justify-between gap-3 text-[11px]">
      <dt className="min-w-0 text-zinc-300">{gameText(stat.label)}</dt>
      <dd className="shrink-0 font-semibold tabular-nums text-white">{stat.value}</dd>
    </div>)}
  </dl>;
};

const CharacterEquipmentCard = ({ item, catalogItem, uniform = false }: { item: CharacterItem; catalogItem?: DatabaseItem; uniform?: boolean }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const sourceName = typeof item.name === "string" && item.name.trim() ? item.name : catalogItem?.name;
  const name = sourceName
    ? getItemDisplayName(sourceName, gameText(sourceName))
    : t("characterProfiles.unnamedItem", { id: item.id });
  const baseStats = catalogItem?.sections.find((section) => section.key === "base")?.stats.slice(0, 5) ?? [];
  const enhancementStats = catalogItem?.enhancements.find((entry) => entry.level === item.enchantLevel)?.stats.slice(0, 2) ?? [];
  const content = <>
    <ItemIcon icon={item.icon} name={name} size={42} />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[12px] font-semibold text-white" title={name}>
        {item.enchantLevel > 0 && <span className="mr-1 text-accent">+{item.enchantLevel}</span>}{name}
      </span>
      <span className="mt-0.5 block truncate text-[11px] text-subtle">{slotLabel(item.slotPosName)} <span aria-hidden="true">·</span> <ItemGrade grade={item.grade} />
        {item.exceedLevel > 0 && <span className="ml-1.5 text-accent">{t("characterProfiles.breakthrough", { level: item.exceedLevel })}</span>}
      </span>
    </span>
  </>;

  if (!catalogItem) return <Tooltip label={<span className="block w-48 text-left"><span className="block text-[12px] font-semibold text-white">{name}</span><span className="mt-1 block text-[11px] font-normal text-subtle">{slotLabel(item.slotPosName)} · <ItemGrade grade={item.grade} /></span>{item.enchantLevel > 0 && <span className="mt-1 block text-[11px] font-normal text-accent">{t("characterProfiles.itemEnhancementStats", { level: item.enchantLevel })}</span>}</span>} wrap className={cn("w-full", uniform && "h-full")}>
    <div className={cn("flex w-full min-w-0 items-center gap-3 rounded-[var(--radius-md)] border border-border bg-background/60 px-3 py-3", uniform && "min-h-[68px] h-full")}>{content}</div>
  </Tooltip>;

  const preview = <span className="block w-56 text-left">
    <span className="mb-2 block text-[12px] font-semibold text-white">{name}</span>
    {baseStats.length > 0 && <><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-accent">{t("characterProfiles.itemBaseStats")}</span>
      <StatPreview stats={baseStats} /></>}
    {enhancementStats.length > 0 && <><span className="mb-1 mt-2 block text-[10px] font-semibold uppercase tracking-wide text-accent">{t("characterProfiles.itemEnhancementStats", { level: item.enchantLevel })}</span>
      <StatPreview stats={enhancementStats} /></>}
  </span>;

  return <Tooltip label={preview} wrap className={cn("w-full", uniform && "h-full")}>
    <button type="button" onClick={() => openReference({ category: "items", id: catalogItem.id, name: catalogItem.name, enhancementLevel: item.enchantLevel })}
      aria-label={t("characterProfiles.openItem", { name })}
      className={cn("flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border bg-background/60 px-3 py-3 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent", uniform && "min-h-[68px] h-full")}>
      {content}
      <ArrowUpRight size={15} className="shrink-0 text-subtle" aria-hidden="true" />
    </button>
  </Tooltip>;
};

export default CharacterEquipmentCard;
