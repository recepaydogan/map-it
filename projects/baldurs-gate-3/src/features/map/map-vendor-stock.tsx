import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  createItemDatabaseIndex,
  resolveItemDatabaseEntry,
} from "../items/item-database-match";
import type { ItemDatabaseEntry } from "../items/types";
import { useItemDatabase } from "../items/use-item-database";
import MapDetailSection from "./map-detail-section";
import MapItemLinkRow from "./map-item-link-row";
import type { MapTradeStockProfile } from "./types";

interface MapVendorStockProps {
  vendor: MapTradeStockProfile;
  isVendor?: boolean;
  selectedItemId?: string;
  onSelectItem: (item: ItemDatabaseEntry) => void;
}

const MapVendorStock = ({ vendor, isVendor = true, selectedItemId, onSelectItem }: MapVendorStockProps) => {
  const { t, i18n } = useTranslation();
  const { data } = useItemDatabase();
  const itemIndex = useMemo(() => createItemDatabaseIndex(data?.items ?? []), [data]);
  const language = (i18n.resolvedLanguage ?? i18n.language).split("-")[0];
  const conditionalStock = vendor.conditionalStock ?? [];
  if (vendor.namedStock.length === 0 && conditionalStock.every(({ namedStock }) => namedStock.length === 0)) return null;
  const stockList = (names: string[]) => (
    <ul className="flex flex-col gap-1.5">
      {names.map((stockName) => {
        const item = resolveItemDatabaseEntry(itemIndex, { title: stockName });
        const displayName = item ? item.localizedNames[language] ?? item.localizedNames.en ?? item.name : stockName;
        return (
          <li key={stockName}>
            <MapItemLinkRow item={item} displayName={displayName} active={selectedItemId === item?.id}
              ariaLabel={t("map.vendor.viewItem", { item: displayName })} onSelect={onSelectItem} />
          </li>
        );
      })}
    </ul>
  );
  return (
    <MapDetailSection id="map-vendor-stock-title" title={t(isVendor ? "map.vendor.title" : "map.vendor.namedStock")}>
      <p className="mb-2 text-xs leading-relaxed text-zinc-300">{t("map.vendor.hint")}</p>
      {vendor.namedStock.length > 0 && stockList(vendor.namedStock)}
      {conditionalStock.filter(({ namedStock }) => namedStock.length > 0).map((stock) => (
        <section key={stock.id} className="mt-3 border-t border-border pt-3">
          <h4 className="mb-1 text-xs font-semibold text-accent">{t("map.itemStoryImpact.conditional")}</h4>
          <p className="mb-2 text-xs leading-relaxed text-zinc-200">
            {stock.localizedConditions[language] ?? stock.localizedConditions.en}
          </p>
          {stockList(stock.namedStock)}
        </section>
      ))}
    </MapDetailSection>
  );
};

export default MapVendorStock;
