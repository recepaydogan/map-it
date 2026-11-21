import type { ReferenceTarget } from "../reference/reference-types";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import RobRunItemDetail from "../rob-run/rob-run-item-detail";
import { loadRobRunItems, type CatalogItem } from "../rob-run/rob-run-data";
import { useReferenceNavigation } from "../reference/reference-navigation-context";

const MapItemPanel = ({ itemId, onOpenMap, onClose, reward, embedded = false }: {
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
  const [catalog, setCatalog] = useState<CatalogItem[]>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void loadRobRunItems().then((items) => { if (active) setCatalog(items); }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  const entry = catalog?.find((entry) => entry.id === itemId || entry.gameId === itemId);
  const item = entry?.aliasOf ? catalog?.find((item) => item.id === entry.aliasOf) ?? entry : entry;

  if (!catalog || !item) {
    return <div className="flex items-start gap-2 p-4 text-[12px] text-zinc-300" role={error ? "alert" : undefined}>
      {onClose && <button type="button" onClick={onClose} aria-label={t("chrome.close")} className="order-last grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-subtle hover:bg-white/5 hover:text-white"><X size={16} aria-hidden="true" /></button>}
      <p className="min-w-0 flex-1">{t(error ? "robRun.catalog.error" : !catalog ? "robRun.catalog.loading" : "robRun.catalog.empty")}</p>
    </div>;
  }

  return <RobRunItemDetail
    key={item.id}
    item={item}
    quantity={reward?.quantity}
    embedded={embedded}
    items={catalog}
    onSelectItem={(id) => openReference({ category: "items", id, name: catalog.find((entry) => entry.id === id)?.name })}
    onOpenMarker={(id) => onOpenMap("looty-bay", id)}
    onClose={onClose}
    compact
  />;
};

export default MapItemPanel;
