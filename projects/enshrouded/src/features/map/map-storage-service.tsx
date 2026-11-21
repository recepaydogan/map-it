import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import type { StorageServices } from "./use-storage-services";

const MapStorageService = ({ costs }: { costs: StorageServices["costs"] }) => {
  const { t, i18n } = useTranslation();
  const sharedPrices = costs.every((cost) => cost.server === cost.character);
  const price = (amount: number) => t("map.storage.price", { amount: amount.toLocaleString(i18n.language) });

  return <section className="mt-4 border-t border-border pt-4">
    <DatabaseSectionTitle>{t("map.storage.access")}</DatabaseSectionTitle>
    <div className="divide-y divide-border/50 rounded-[var(--radius-sm)] border border-border bg-surface px-3">
      <div className="py-2.5">
        <p className="text-[13px] font-medium text-zinc-100">{t("map.storage.server")}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-subtle">{t("map.storage.serverDescription")}</p>
      </div>
      <div className="py-2.5">
        <p className="text-[13px] font-medium text-zinc-100">{t("map.storage.character")}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-subtle">{t("map.storage.characterDescription")}</p>
      </div>
    </div>
    <p className="mt-2 text-[12px] leading-relaxed text-subtle">{t("map.storage.contents")}</p>

    {costs.length > 0 && <div className="mt-5">
      <DatabaseSectionTitle>{t("map.storage.expansionPrices")}</DatabaseSectionTitle>
      <p className="mb-3 text-[12px] leading-relaxed text-subtle">{t(sharedPrices
        ? "map.storage.samePrices" : "map.storage.separatePrices")}</p>
      <details className="rounded-[var(--radius-sm)] border border-border bg-surface">
        <summary className="cursor-pointer px-3 py-2.5 text-[12px] font-medium text-zinc-100 hover:text-accent">
          {t("map.storage.showPrices", { count: costs.length })}
        </summary>
        <ol className="grid grid-cols-2 gap-1.5 border-t border-border p-2">
          {costs.map((cost) => <li key={cost.line} className="min-w-0 rounded-[var(--radius-sm)] border border-border/70 bg-white/[0.03] px-2 py-1.5">
            <span className="block text-[11px] text-subtle">{t("map.storage.priceEntry", { number: cost.line })}</span>
            <span className="block text-[12px] font-medium tabular-nums text-amber-300">{sharedPrices
              ? price(cost.server) : t("map.storage.serverPrice", { price: price(cost.server) })}</span>
            {!sharedPrices && <span className="block text-[11px] text-subtle">{t("map.storage.characterPrice", { price: price(cost.character) })}</span>}
          </li>)}
        </ol>
      </details>
    </div>}
  </section>;
};

export default MapStorageService;
