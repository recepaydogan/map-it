import { getItemDisplayName } from "../../lib/item-display-name";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import type { ReactNode } from "react";
import type { DatabaseItem } from "./item-database-types";
import ItemIcon from "./item-icon";

export const CompactItemHeader = ({ item, metadata, sourceName, onClose }: { item: DatabaseItem; metadata: ReactNode; sourceName?: string; onClose?: () => void }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  return <header className="flex shrink-0 items-start gap-3 border-b border-border bg-black/15 px-4 py-4">
    <ItemIcon icon={item.icon} name={getItemDisplayName(gameText(item.name))} size={56} />
    <div className="min-w-0 flex-1">
      <h2 className="text-[17px] font-bold leading-snug text-zinc-100">{getItemDisplayName(gameText(item.name))}</h2>
      {metadata}
      {sourceName && <p className="mt-1 flex items-center gap-1.5 text-[11px] text-accent">{gameText(sourceName)}</p>}
      {item.usageLevel !== undefined && item.usageLevel > 1 && <p className="mt-1 text-xs text-subtle">{t("database.usageLevel", { level: item.usageLevel })}</p>}
      {!item.nameVerified && item.nameOrigin !== "set" && <p className="mt-1 text-[11px] text-amber-300">{t("database.unlocalizedName")}</p>}
    </div>
    {onClose && <button type="button" onClick={onClose} aria-label={t("chrome.close")} title={t("chrome.close")}
      className="-mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-subtle hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-accent"><X size={16} aria-hidden="true" /></button>}
  </header>;
};

export const CompactItemQuantity = ({ quantity }: { quantity: number | string }) => {
  const { t } = useTranslation();
  const badge = "rounded-md border border-border bg-black/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-300";
  return <div className="flex flex-wrap gap-2"><span className={badge}>{t("database.compact.quantity", { quantity })}</span></div>;
};
