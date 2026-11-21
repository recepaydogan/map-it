
import { ChevronLeft, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { cn } from "../../lib/cn";
import { getCargoSellPrice, getItemVariantKey, getRarityKey, type Cargo, type CatalogItem, type NotorietyLevel } from "./rob-run-data";
import { itemRarityClass, RobRunItemIcon } from "./rob-run-rarity";
import "./rob-run-loot-calculator.css";

export default function RobRunLootCalculator({ items, cargo, notoriety, onBack, initialItemId }: {
  items: CatalogItem[];
  cargo: Cargo[];
  notoriety: NotorietyLevel[];
  onBack: () => void;
  initialItemId?: string;
}) {
  const { t, i18n } = useTranslation();
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [amounts, setAmounts] = useState<Record<string, number>>(() =>
    initialItemId ? { [initialItemId]: 1 } : {});
  const [levelId, setLevelId] = useState("");
  const format = useMemo(() => new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }), [i18n.resolvedLanguage]);
  const term = query.trim().toLocaleLowerCase();
  const sellable = [
    ...items.flatMap((item) => !item.aliasOf && item.sellPrice != null ? [{
      id: item.id, gameId: item.gameId, name: item.name, icon: item.icon, sellPrice: item.sellPrice, cargo: false,
      rarity: item.rarity, reference: item.reference, variant: getItemVariantKey(item),
    }] : []),
    ...cargo.flatMap((item) => {
      const sellPrice = getCargoSellPrice(item);
      return sellPrice === undefined ? [] : [{
        id: `cargo:${item.id}`, gameId: item.id, name: item.name, icon: item.icon, sellPrice, cargo: true,
        rarity: item.rarity, reference: item.reference, variant: undefined,
      }];
    }),
  ];
  const subtitle = (item: typeof sellable[number]) => {
    const rarity = getRarityKey(item.rarity, item.reference?.rarity);
    return [
      item.cargo && t("robRun.economy.cargo"),
      rarity && t(`robRun.rarity.${rarity}`),
      item.variant && t(`robRun.wiki.${item.variant}`),
    ].filter(Boolean).join(" · ");
  };
  const rows = sellable.filter((item) => item.id in amounts);
  const options = term ? sellable.filter((item) => !(item.id in amounts)
    && [item.name, item.gameId ?? item.id, subtitle(item)].some((value) => value.toLocaleLowerCase().includes(term))).slice(0, 8) : [];
  let itemTotal = 0;
  let cargoTotal = 0;
  for (const item of rows) {
    const value = amounts[item.id] * item.sellPrice;
    if (item.cargo) cargoTotal += value;
    else itemTotal += value;
  }
  const total = itemTotal + cargoTotal;
  const level = notoriety.find((entry) => entry.id === levelId);
  const bonus = (value: number, factor: number) => {
    const raw = Math.fround(Math.fround(value) * factor);
    return raw % 1 === 0.5 && Math.floor(raw) % 2 === 0 ? Math.floor(raw) : Math.round(raw);
  };
  const roundedBonus = bonus(itemTotal, level?.lootBonus ?? 0) + bonus(cargoTotal, level?.cargoBonus ?? 0);

  return (
    <section className="rob-run-loot-calculator" aria-labelledby="rob-run-loot-title">
      <article className="rob-run-loot-page">
        <header className="rob-run-loot-header">
          <button type="button" className="rob-run-loot-back" onClick={onBack}>
            <ChevronLeft size={15} aria-hidden="true" /> {t("robRun.economy.backToLoot")}
          </button>
          <h1 id="rob-run-loot-title">{t("robRun.economy.calculator")}</h1>
        </header>
        <div className="rob-run-loot-workspace">
          <section className="rob-run-loot-haul" aria-labelledby="rob-run-loot-haul-label">
            <div className="rob-run-loot-search">
              <label id="rob-run-loot-haul-label" htmlFor="rob-run-loot-item">{t("robRun.economy.addLoot")}</label>
              <div className="rob-run-loot-search-field">
                <Search size={16} aria-hidden="true" />
                <input ref={search} id="rob-run-loot-item" type="search" value={query}
                  onChange={(event) => setQuery(event.target.value)} placeholder={t("robRun.catalog.search")} />
              </div>
              {options.length > 0 && <ul className="rob-run-loot-options">{options.map((item) => (
                <li key={item.id}>
                  <button type="button" className="rob-run-loot-option" onClick={() => {
                    setAmounts((current) => ({ ...current, [item.id]: 1 }));
                    setQuery("");
                    search.current?.focus();
                  }}>
                    <RobRunItemIcon item={item} />
                    <span className="min-w-0">
                      <span className={cn("block", itemRarityClass(item))}>{item.name}</span>
                      <span className="block text-[11px] font-normal text-muted">{subtitle(item)}</span>
                    </span>
                    <small>{format.format(item.sellPrice)}</small>
                    <Plus size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}</ul>}
              {term && options.length === 0 && <p className="text-sm text-muted">{t("robRun.economy.noSellableItems")}</p>}
            </div>
            {rows.length > 0 ? <div className="rob-run-loot-lines">
              <div className="rob-run-loot-columns" aria-hidden="true">
                <span>{t("robRun.economy.haulItem")}</span>
                <span>{t("robRun.economy.haulQuantity")}</span>
                <span>{t("robRun.economy.haulLineTotal")}</span>
              </div>
              <ul>
                {rows.map((item) => {
                  const removeLabel = t("robRun.economy.removeLoot", { name: item.name });
                  return <li key={item.id} className="rob-run-loot-line">
                    <div className="rob-run-loot-item">
                      <RobRunItemIcon item={item} size={34} />
                      <div>
                        <p className={itemRarityClass(item)}>{item.name}</p>
                        <small className="block">{subtitle(item)}</small>
                        <small>{t("robRun.economy.haulUnitPrice", { value: format.format(item.sellPrice) })}</small>
                      </div>
                    </div>
                    <label className="rob-run-loot-quantity">
                      <span aria-hidden="true">{t("robRun.economy.haulQuantity")}</span>
                      <input type="number" min={0} max={1000000} step={1} value={amounts[item.id]}
                        aria-label={t("robRun.economy.itemQuantity", { name: item.name })}
                        onChange={(event) => {
                          const quantity = Math.max(0, Math.min(1000000, Math.floor(event.target.valueAsNumber || 0)));
                          setAmounts((current) => ({ ...current, [item.id]: quantity }));
                        }} />
                    </label>
                    <span className="rob-run-loot-subtotal">{format.format(item.sellPrice * amounts[item.id])}</span>
                    <button type="button" className="rob-run-loot-remove" aria-label={removeLabel} title={removeLabel}
                      onClick={() => {
                        setAmounts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== item.id)));
                        search.current?.focus();
                      }}>
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </li>;
                })}
              </ul>
            </div> : <p className="rob-run-loot-empty">{t("robRun.economy.haulEmpty")}</p>}
          </section>
          <aside className="rob-run-loot-summary" aria-labelledby="rob-run-loot-total">
            <h2 id="rob-run-loot-total">{t("robRun.economy.totalSale")}</h2>
            <output aria-live="polite">{format.format(total + roundedBonus)}</output>
            {levelId && <dl>
              <div><dt>{t("robRun.economy.haulBase")}</dt><dd>{format.format(total)}</dd></div>
              <div><dt>{t("robRun.economy.haulBonus")}</dt><dd>{format.format(roundedBonus)}</dd></div>
            </dl>}
            <span className="rob-run-loot-notoriety-label">{t("robRun.economy.notoriety")}</span>
            <CategoryDropdown neutral ariaLabel={t("robRun.economy.notoriety")} value={levelId} onChange={setLevelId}
              triggerClassName="w-full"
              options={[{ key: "", label: t("robRun.economy.base") }, ...notoriety.map((entry) => ({
                key: entry.id, label: t("robRun.economy.notorietyLevel", { level: entry.index + 1 }),
              }))]} />
          </aside>
        </div>
      </article>
    </section>
  );
}

