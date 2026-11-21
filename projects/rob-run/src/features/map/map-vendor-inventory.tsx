import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import { useGameText } from "../../i18n/game-text";
import { contentUrl } from "../../lib/content-url";
import ItemIcon from "../database/item-icon";

interface VendorOffer {
  id: string; name: string; icon?: string; inItemCatalog: boolean;
  copper?: number; quantity?: number; stock?: number;
  currencies?: [number, number][]; items?: [number, number][];
}
interface VendorCatalog {
  version: 1; vendors: Record<string, VendorOffer[]>; markers: Record<string, string>;
}
let request: Promise<VendorCatalog> | undefined;
const load = () => request ??= fetch(contentUrl("data/vendors/inventories.json")).then(async (response) => {
  if (!response.ok) throw new Error(`Vendor inventory: HTTP ${response.status}`);
  const data = await response.json() as VendorCatalog;
  if (data.version !== 1 || !data.vendors || !data.markers) throw new Error("Invalid vendor inventory");
  return data;
}).catch((error: unknown) => { request = undefined; throw error; });

export default function MapVendorInventory({ markerId, npcId, onOpenItem }: {
  markerId: string; npcId?: string; onOpenItem?: (itemId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const [catalog, setCatalog] = useState<VendorCatalog>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void load().then((value) => { if (active) setCatalog(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  if (error) return <p role="alert" className="mt-3 text-xs text-subtle">{t("map.vendorInventory.error")}</p>;
  if (!catalog) return null;
  const offers = catalog.vendors[catalog.markers[markerId] ?? npcId ?? ""];
  if (!offers) return null;
  const number = (value: number) => value.toLocaleString(i18n.language);
  const money = (value: number) => [
    value >= 10000 ? t("map.vendorInventory.gold", { value: number(Math.floor(value / 10000)) }) : "",
    value >= 100 ? t("map.vendorInventory.silver", { value: number(Math.floor(value / 100) % 100) }) : "",
    value % 100 || value === 0 ? t("map.vendorInventory.copper", { value: number(value % 100) }) : "",
  ].filter(Boolean).join(" ");
  return <section className="mt-4 border-t border-border pt-4">
    <h3 className="map-micro-label mb-2">{t("map.vendorInventory.title", { count: offers.length })}</h3>
    <p className="mb-3 text-[11px] leading-4 text-subtle">{t("map.vendorInventory.priceNote")}</p>
    {!offers.length && <p className="text-xs text-subtle">{t("map.vendorInventory.empty")}</p>}
    <ProgressiveList initialCount={8} pageSize={16} className="space-y-1.5">
      {offers.map((offer) => {
        const name = gameText(offer.name, `ItemSparse:${offer.id}:4`);
        const price = [offer.copper !== undefined ? money(offer.copper) : "",
          ...(offer.currencies ?? []).map(([id, quantity]) => t("map.vendorInventory.currency", { id, count: quantity })),
          ...(offer.items ?? []).map(([id, quantity]) => t("map.vendorInventory.itemCost", { id, count: quantity })),
        ].filter(Boolean).join(" + ");
        const body = <><ItemIcon icon={offer.icon} name={name} size={30} />
          <span className="min-w-0 flex-1"><span className="block text-[12px] font-medium text-zinc-100">{name}{(offer.quantity ?? 1) > 1 && <span className="ml-1 text-subtle">×{number(offer.quantity!)}</span>}</span>
            {offer.stock !== undefined && <span className="block text-[11px] text-subtle">{t("map.vendorInventory.stock", { count: offer.stock })}</span>}
          </span><span className="max-w-[42%] shrink-0 break-words text-right text-[11px] tabular-nums text-zinc-300">{price || t("map.vendorInventory.priceUnknown")}</span></>;
        const className = "flex w-full min-w-0 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-elevated px-2 py-2 text-left";
        return offer.inItemCatalog && onOpenItem
          ? <button key={offer.id} type="button" onClick={() => onOpenItem(offer.id)} className={`${className} cursor-pointer hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent`}>{body}</button>
          : <div key={offer.id} className={className}>{body}</div>;
      })}
    </ProgressiveList>
  </section>;
}
