import type { ReferenceTarget } from "../reference/reference-types";
import { X } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import ItemDetail from "../database/item-detail";
import { useItemCatalog } from "../database/use-item-catalog";
import { useReferenceNavigation } from "../reference/reference-navigation-context";

const MapItemPanel = ({ itemId, initialRecipeId, initialTab, onOpenMap, onClose, reward, embedded = false }: {
  itemId: string;
  reward?: Pick<ReferenceTarget, "quantity" | "rewardRates">;
  initialRecipeId?: string;
  initialTab?: "acquisition";
  onClose?: () => void;
  embedded?: boolean;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const catalogState = useItemCatalog();
  const catalog = catalogState.status === "ready" ? catalogState.catalog : null;
  const itemsById = useMemo(() => new Map(catalog?.items.map((item) => [item.id, item]) ?? []), [catalog]);
  const item = itemsById.get(itemId);

  if (!catalog || !item) {
    return <div className="flex items-start gap-2 p-4 text-[12px] text-zinc-300" role={catalogState.status === "error" ? "alert" : undefined}>
      {onClose && <button type="button" onClick={onClose} aria-label={t("chrome.close")} className="order-last grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-subtle hover:bg-white/5 hover:text-white"><X size={16} aria-hidden="true" /></button>}
      <p className="min-w-0 flex-1">{t(catalogState.status === "loading" ? "database.loading" : catalogState.status === "error" ? "database.error" : "database.noMatches")}</p>
    </div>;
  }

  return <ItemDetail
    key={item.id}
    item={item}
    reward={reward}
    embedded={embedded}
    initialRecipeId={initialRecipeId}
    initialTab={initialTab}
    recipes={catalog.recipes}
    itemsById={itemsById}
    onSelect={(next) => openReference({ category: "items", id: next.id, name: next.name })}
    onOpenMap={onOpenMap}
    onClose={onClose}
    compact
  />;
};

export default MapItemPanel;
