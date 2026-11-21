import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { getItemDisplayName } from "../../lib/item-display-name";
import Tooltip from "../../components/tooltip";
import type { DatabaseItem } from "./item-database-types";
import ItemGrade from "./item-grade";
import ItemTooltipContent from "./item-tooltip-content";
import { findItemDescriptionMentions } from "./item-description-mentions";

const ItemDescriptionLinks = ({ text, itemsById, onSelect }: {
  text: string;
  itemsById: Map<string, DatabaseItem>;
  onSelect: (item: DatabaseItem) => void;
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const [openMention, setOpenMention] = useState<number | null>(null);
  const mentions = useMemo(() => findItemDescriptionMentions(text, itemsById), [text, itemsById]);
  let offset = 0;
  const content: ReactNode[] = [];
  for (const mention of mentions) {
    content.push(text.slice(offset, mention.start));
    const label = getItemDisplayName(gameText(text.slice(mention.start, mention.end)));
    const item = mention.items.length === 1 ? mention.items[0] : undefined;
    const button = <button type="button"
      aria-expanded={mention.items.length > 1 ? openMention === mention.start : undefined}
      onClick={() => mention.items.length === 1 ? onSelect(mention.items[0]) : setOpenMention(openMention === mention.start ? null : mention.start)}
      className="cursor-pointer text-accent underline decoration-accent/70 underline-offset-2 hover:brightness-125 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
    >{label}</button>;
    content.push(item ? <Tooltip key={mention.start} wrap align="start" side="top" label={<ItemTooltipContent item={item} />}>{button}</Tooltip>
      : <span key={mention.start}>{button}</span>);
    offset = mention.end;
  }
  content.push(text.slice(offset));
  const choices = mentions.find((mention) => mention.start === openMention)?.items;

  return <>
    {content}
    {choices && <span className="mt-3 block space-y-1 rounded-[var(--radius-sm)] border border-border bg-surface p-2" role="group" aria-label={t("database.chooseItemVariant")}>
      {choices.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item)}
        className="flex w-full cursor-pointer flex-wrap items-center gap-x-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
        <span className="font-medium">{getItemDisplayName(gameText(item.name))}</span>
        <span className="text-subtle"><ItemGrade grade={item.grade} />{item.itemLevel ? ` · ${t("database.itemLevel", { level: item.itemLevel })}` : ""}</span>
      </button>)}
    </span>}
  </>;
};

export default ItemDescriptionLinks;
