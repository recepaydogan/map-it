import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import DetailBackLink from "../../components/detail-back-link";
import { cn } from "../../lib/cn";
import { getItemCategory } from "./item-category-config";
import ItemDatabaseFacts from "./item-database-facts";
import ItemIcon from "./item-icon";
import ItemRarityBadges from "./item-rarity-badges";
import type { MapLocationNavigationTarget } from "../map/map-location-navigation";
import { formatItemGroup } from "./item-group";
import type { ItemDatabaseEntry } from "./types";

interface ItemDatabaseDetailProps {
  item: ItemDatabaseEntry;
  onNavigateMapLocation: (target: MapLocationNavigationTarget) => void;
  layout?: "page" | "panel";
  backLabel?: string;
  onBack?: () => void;
  onClose?: () => void;
  onSelectRelatedItem?: (itemId: string) => void;
}

const ItemDatabaseDetail = ({
  item,
  onNavigateMapLocation,
  layout = "page",
  backLabel,
  onBack,
  onClose,
  onSelectRelatedItem,
}: ItemDatabaseDetailProps) => {
  const { t, i18n } = useTranslation();
  const category = getItemCategory(item.category);
  const name = item.localizedNames[i18n.language] ?? item.localizedNames.en ?? item.name;
  const panel = layout === "panel";
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [item.id]);

  return (
    <div className={cn(
      panel
        ? "flex min-h-0 flex-1 flex-col overflow-hidden"
        : "scroll-slim h-full overflow-x-hidden overflow-y-auto",
    )} ref={panel ? undefined : scrollContainerRef}>
      {onBack && <DetailBackLink label={backLabel ?? t("items.back")} onClick={onBack} />}
      <div className={cn("w-full", panel ? "contents" : "max-w-[860px] px-5 py-6 sm:px-8 sm:py-8")}>
        <div className={cn(
          "relative flex items-start overflow-hidden border-b border-border",
          panel ? cn("shrink-0 gap-3 px-4 pb-4", onBack ? "pt-2.5" : "pt-4") : "gap-4 pb-6",
        )} ref={panel ? scrollContainerRef : undefined}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_120%_at_0%_0%,var(--color-accent-soft),transparent_68%)]"
          />
          <ItemIcon
            item={item}
            size={panel ? 56 : 88}
            className="relative grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius-lg)] border border-accent/25 bg-black/25 text-accent shadow-[0_16px_40px_-24px_var(--color-accent)]"
          />
          <div className={cn("relative min-w-0 flex-1 pt-0.5", onClose && "pr-7")}>
            <ItemRarityBadges rarity={item.rarity} />
            <h1 className={cn(
              "mt-2 font-semibold leading-tight text-white",
              panel ? "text-base" : "text-2xl sm:text-[30px]",
            )}>{name}</h1>
            <p className="mt-1 text-[12px] text-muted">
              {formatItemGroup(item) ?? t(category.labelKey)}
            </p>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t("items.closeDetails")}
                title={t("items.closeDetails")}
                className="absolute -right-1 -top-1 grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className={cn(
          panel
            ? "scroll-slim min-h-0 flex-1 space-y-3.5 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-4 pt-3.5"
            : "space-y-7 py-6",
        )}>
          <ItemDatabaseFacts
            item={item}
            layout={layout}
            onSelectRelatedItem={onSelectRelatedItem}
            onNavigateMapLocation={onNavigateMapLocation}
          />
        </div>
      </div>
    </div>
  );
};

export default ItemDatabaseDetail;
