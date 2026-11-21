import ItemCatalog, { ItemCatalogCategory } from "../../components/layout/item-catalog";
import { Backpack, Check, ChefHat, ChevronDown, Package } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { twMerge } from "tailwind-merge";
import { usePeakSession } from "../../state/peak-session-store";
import { useLiveInventory } from "../map/live-state";
import { usePeakMapData, type PeakItem, type PeakItemRarity, type PeakLootPool } from "../map/map-data";

const RARITIES: PeakItemRarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "ridiculously-rare"];
const RARITY_COLORS: Record<PeakItemRarity, string> = {
  common: "#9aa5ad", uncommon: "#87b987", rare: "#7fa8d9", epic: "#bda6e8",
  legendary: "#e2b26f", mythic: "#d98278", "ridiculously-rare": "#d6c279",
};
const prettify = (value: string) => value.replace(/[-_]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());

interface PoolAppearance { pool: PeakLootPool; rarity: PeakItemRarity; chance: number }
interface ItemGroup { key: string; label: string; items: PeakItem[]; representative: PeakItem }
interface GroupPoolAppearance { pool: PeakLootPool; rarities: PeakItemRarity[]; chance: number }

const RarityBadge = ({ rarity }: { rarity: PeakItemRarity }) => {
  const { t } = useTranslation();
  return <span className="shrink-0 rounded-[var(--radius-sm)] border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide" style={{ color: RARITY_COLORS[rarity], borderColor: `${RARITY_COLORS[rarity]}55` }}>{t(`map.rarities.${rarity}`)}</span>;
};

const ItemIcon = ({ item, size }: { item: PeakItem; size: number }) => item.icon ? (
  <img src={item.icon} alt="" draggable={false} width={size} height={size} className="shrink-0 object-contain" aria-hidden="true" />
) : (
  <span className="grid shrink-0 place-items-center border border-border bg-background/70 text-subtle" style={{ width: size, height: size }}>
    <Package size={Math.round(size * 0.5)} aria-hidden="true" />
  </span>
);

const ItemsScreen = () => {
  const { t, i18n } = useTranslation();
  const peakMap = usePeakMapData();
  const session = usePeakSession();
  const inventory = useLiveInventory(session.isGameRunning);
  const [query, setQuery] = useState("");
  const [rarityFilter, setRarityFilter] = useState<PeakItemRarity | null>(null);
  const [poolFilter, setPoolFilter] = useState<string | null>(null);
  const [carryingFilter, setCarryingFilter] = useState(false);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [poolMenuOpen, setPoolMenuOpen] = useState(false);
  const [rarityMenuOpen, setRarityMenuOpen] = useState(false);
  const poolMenuRef = useRef<HTMLDivElement | null>(null);
  const rarityMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!poolMenuOpen && !rarityMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!poolMenuRef.current?.contains(event.target as Node)) setPoolMenuOpen(false);
      if (!rarityMenuRef.current?.contains(event.target as Node)) setRarityMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPoolMenuOpen(false);
        setRarityMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [poolMenuOpen, rarityMenuOpen]);

  const ownedDisplayIds = useMemo(() => new Set((inventory ?? []).map((entry) => entry.itemId)), [inventory]);
  const appearancesByItem = useMemo(() => {
    const map = new Map<number, PoolAppearance[]>();
    for (const pool of peakMap.lootPools) for (const entry of pool.items) {
      const list = map.get(entry.itemId) ?? [];
      list.push({ pool, rarity: entry.rarity, chance: entry.chance });
      map.set(entry.itemId, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.chance - a.chance);
    return map;
  }, [peakMap.lootPools]);

  const itemGroups = useMemo(() => {
    const groups = new Map<string, { label: string; items: PeakItem[] }>();
    peakMap.items.forEach((item) => {
      const label = t(`items.names.${item.name}`, { defaultValue: item.name }).trim();
      const key = label.toLocaleLowerCase();
      const group = groups.get(key) ?? { label, items: [] };
      group.items.push(item);
      groups.set(key, group);
    });

    return [...groups.entries()].map(([key, group]): ItemGroup => {
      const items = [...group.items].sort((a, b) => {
        const appearanceDifference = (appearancesByItem.get(b.id)?.length ?? 0) - (appearancesByItem.get(a.id)?.length ?? 0);
        if (appearanceDifference !== 0) return appearanceDifference;
        const poolDifference = b.spawnPools.length - a.spawnPools.length;
        return poolDifference !== 0 ? poolDifference : a.displayId - b.displayId;
      });
      return { key, label: group.label, items, representative: items[0] };
    });
  }, [appearancesByItem, peakMap.items, t]);

  const filteredItemGroups = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return itemGroups.filter((group) => {
      if (normalized && !group.label.toLocaleLowerCase().includes(normalized)) return false;
      if (rarityFilter && !group.items.some((item) => item.baseRarity === rarityFilter)) return false;
      if (carryingFilter && !group.items.some((item) => ownedDisplayIds.has(item.displayId))) return false;
      if (poolFilter && !group.items.some((item) =>
        (appearancesByItem.get(item.id) ?? []).some(({ pool }) => pool.id === poolFilter))) return false;
      return true;
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [appearancesByItem, carryingFilter, itemGroups, ownedDisplayIds, poolFilter, query, rarityFilter]);

  // As in ER, the rail is navigation and the item page is the protagonist.
  const selectedGroup = filteredItemGroups.find((group) => group.key === selectedItemKey) ?? null;
  const selectedItem = selectedGroup?.representative ?? null;
  const selectedAppearances: GroupPoolAppearance[] = selectedGroup ? (() => {
    const byPool = new Map<string, GroupPoolAppearance>();
    selectedGroup.items.forEach((item) => {
      (appearancesByItem.get(item.id) ?? []).forEach((appearance) => {
        const current = byPool.get(appearance.pool.id);
        if (!current) {
          byPool.set(appearance.pool.id, {
            pool: appearance.pool,
            rarities: [appearance.rarity],
            chance: appearance.chance,
          });
          return;
        }
        if (!current.rarities.includes(appearance.rarity)) current.rarities.push(appearance.rarity);
        current.chance = Math.min(100, Math.round((current.chance + appearance.chance) * 10) / 10);
      });
    });
    return [...byPool.values()].sort((a, b) => b.chance - a.chance);
  })() : [];
  const appearanceRarities = new Set(selectedAppearances.flatMap((appearance) => appearance.rarities));
  const sharedAppearanceRarity = appearanceRarities.size === 1 ? selectedAppearances[0]?.rarities[0] ?? null : null;
  const selectedBaseRarities = selectedGroup
    ? [...new Set(selectedGroup.items.flatMap((item) => item.baseRarity ? [item.baseRarity] : []))]
    : [];
  const selectedOwned = selectedGroup?.items.some((item) => ownedDisplayIds.has(item.displayId)) ?? false;
  const selectedWeights = selectedGroup ? [...new Set(selectedGroup.items.map((item) => item.weight))] : [];
  const selectedUses = selectedGroup ? [...new Set(selectedGroup.items.map((item) => item.uses))] : [];
  const selectedCookable = selectedGroup ? [...new Set(selectedGroup.items.map((item) => item.cookable))] : [];
  const selectedPocketable = selectedGroup ? [...new Set(selectedGroup.items.map((item) => item.canPocket))] : [];
  const selectedPrimaryActions = selectedGroup ? [...new Set(selectedGroup.items.map((item) => item.primaryAction))] : [];
  const selectedEffects = selectedGroup ? (() => {
    const effects = new Map<string, { effect: PeakItem["effects"][number]; variants: number }>();
    selectedGroup.items.forEach((item) => {
      const itemEffectKeys = new Set<string>();
      item.effects.forEach((effect) => {
        const key = JSON.stringify(effect);
        if (itemEffectKeys.has(key)) return;
        itemEffectKeys.add(key);
        const current = effects.get(key);
        effects.set(key, { effect, variants: (current?.variants ?? 0) + 1 });
      });
    });
    return [...effects.values()];
  })() : [];
  const poolLabel = (name: string) => t(`items.pools.${name}`, { defaultValue: prettify(name) });
  const selectedPool = peakMap.lootPools.find((pool) => pool.id === poolFilter) ?? null;
  const itemsById = useMemo(() => new Map(peakMap.items.map(item => [item.id, item])), [peakMap.items]);

  const categories = [
    { id: "all", label: t("items.allPools"), count: undefined, icon: null },
    ...peakMap.lootPools.map((pool) => {
      const representative = [...pool.items]
        .sort((a, b) => b.chance - a.chance)
        .map(entry => itemsById.get(entry.itemId))
        .find(item => item?.icon);
      return {
        id: pool.id, label: poolLabel(pool.name), count: pool.items.length.toLocaleString(i18n.language),
        icon: representative && <ItemIcon item={representative} size={52} />,
      };
    }),
  ];
  const selectPool = (id: string) => { setPoolFilter(id === "all" ? null : id); setSelectedItemKey(null); };

  return <ItemCatalog
    label={t("items.ariaLabel")} artwork="/item-catalog-art.webp" wordmark="/item-catalog-logo.webp" gameName="PEAK"
    search={{ query, label: t("items.searchLabel"), placeholder: t("items.searchPlaceholder"),
      clearLabel: t("map.search.clear"), onChange: (value) => { setQuery(value); setSelectedItemKey(null); } }}
    categoryLabel={t("items.poolFilter")}
    landingCategories={categories.map((category) => ({ ...category, onSelect: () => selectPool(category.id) }))}
    categories={categories.map(({ id, label, count }) => <div key={id}><ItemCatalogCategory label={label} count={count}
      active={(poolFilter ?? "all") === id} onSelect={() => selectPool(id)} /></div>)}
    toolbar={<>
      <div className="flex flex-wrap items-center gap-2">
              <div ref={rarityMenuRef} className="relative shrink-0">
                <button type="button" onClick={() => setRarityMenuOpen((open) => !open)} aria-haspopup="listbox" aria-expanded={rarityMenuOpen} className={twMerge("flex h-8 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border bg-background px-2.5 text-left transition-colors", rarityMenuOpen ? "border-accent text-primary" : "border-border text-muted hover:border-border-strong hover:text-primary")}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-[var(--radius-full)]" style={{ backgroundColor: rarityFilter ? RARITY_COLORS[rarityFilter] : "var(--color-accent)" }} aria-hidden="true" />
                  <span className="whitespace-nowrap text-[11px] font-medium">{rarityFilter ? t(`map.rarities.${rarityFilter}`) : t("items.allRarities")}</span>
                  <ChevronDown size={13} className={twMerge("shrink-0 text-subtle transition-transform", rarityMenuOpen && "rotate-180 text-accent")} aria-hidden="true" />
                </button>
                {rarityMenuOpen && <div role="listbox" aria-label={t("items.rarityFilter")} className="absolute left-0 top-full z-50 mt-1 w-max min-w-full overflow-hidden rounded-[var(--radius-md)] border border-border-strong bg-surface-elevated p-1 shadow-[0_18px_50px_rgba(0,0,0,.65)]">
                  {[null, ...RARITIES].map((rarity) => { const active = rarity === rarityFilter; return <button key={rarity ?? "all"} type="button" role="option" aria-selected={active} onClick={() => { setRarityFilter(rarity); setRarityMenuOpen(false); }} className={twMerge("flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[11px] transition-colors", active ? "bg-surface-elevated font-semibold text-primary" : "text-muted hover:bg-primary/[0.06] hover:text-primary")}><span className="h-1.5 w-1.5 shrink-0 rounded-[var(--radius-full)]" style={{ backgroundColor: rarity ? RARITY_COLORS[rarity] : "var(--color-accent)" }} aria-hidden="true" /><span className="flex-1 whitespace-nowrap">{rarity ? t(`map.rarities.${rarity}`) : t("items.allRarities")}</span><Check size={12} className={twMerge("shrink-0 text-accent", !active && "invisible")} aria-hidden="true" /></button>; })}
                </div>}
              </div>
              <div ref={poolMenuRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setPoolMenuOpen((open) => !open)}
                  aria-haspopup="listbox"
                  aria-expanded={poolMenuOpen}
                  className={twMerge(
                    "flex h-8 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border bg-background px-2.5 text-left transition-colors",
                    poolMenuOpen ? "border-accent text-primary" : "border-border text-muted hover:border-border-strong hover:text-primary",
                  )}
                >
                  <Package size={12} className="shrink-0 text-accent" aria-hidden="true" />
                  <span className="whitespace-nowrap text-[11px] font-medium">{selectedPool ? poolLabel(selectedPool.name) : t("items.allPools")}</span>
                  <ChevronDown size={13} className={twMerge("shrink-0 text-subtle transition-transform", poolMenuOpen && "rotate-180 text-accent")} aria-hidden="true" />
                </button>
                {poolMenuOpen && (
                  <div role="listbox" aria-label={t("items.poolFilter")} className="absolute left-0 top-full z-50 mt-1 w-max min-w-full max-h-72 overflow-y-auto rounded-[var(--radius-md)] border border-border-strong bg-surface-elevated p-1 shadow-[0_18px_50px_rgba(0,0,0,.65)]">
                    {[null, ...peakMap.lootPools].map((pool) => {
                      const active = pool ? pool.id === poolFilter : poolFilter === null;
                      return (
                        <button
                          key={pool?.id ?? "all"}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => { setPoolFilter(pool?.id ?? null); setPoolMenuOpen(false); }}
                          className={twMerge(
                            "flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[11px] transition-colors",
                            active ? "bg-surface-elevated font-semibold text-primary" : "text-muted hover:bg-primary/[0.06] hover:text-primary",
                          )}
                        >
                          <span className="flex-1 whitespace-nowrap">{pool ? poolLabel(pool.name) : t("items.allPools")}</span>
                          {pool && <span className="shrink-0 tabular-nums text-[9px] text-subtle">{pool.items.length}</span>}
                          <Check size={12} className={twMerge("shrink-0 text-accent", !active && "invisible")} aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            {inventory !== null && <button type="button" onClick={() => setCarryingFilter((current) => !current)} aria-pressed={carryingFilter} className={twMerge("flex h-8 cursor-pointer items-center justify-center px-2 gap-1.5 rounded-[var(--radius-md)] border px-2 text-[9px] font-semibold uppercase tracking-wide transition-colors", carryingFilter ? "border-accent bg-surface-elevated text-accent" : "border-accent/50 text-accent hover:border-accent")}><Backpack size={11} aria-hidden="true" />{t("items.carryingFilter", { count: ownedDisplayIds.size })}</button>}
    </>}
    columns={[{ label: t("items.rarityFilter") }, { label: t("items.detail.weight"), numeric: true }]}
    rows={filteredItemGroups.map((group) => {
      const rarities = [...new Set(group.items.flatMap((item) => item.baseRarity ? [item.baseRarity] : []))];
      const rarity = rarities.map((id) => t("map.rarities." + id)).join(" · ");
      return { id: group.key, label: group.label, subtitle: rarity, cells: [rarity || "—", group.representative.weight],
        icon: <ItemIcon item={group.representative} size={30} /> };
    })}
    onOpen={setSelectedItemKey} onBack={() => setSelectedItemKey(null)} backLabel={t("items.ariaLabel")}
    detail={selectedItem && <article className="mx-auto flex w-full max-w-[780px] flex-col gap-6 px-7 py-7">
            <header className="flex items-center gap-5 border-b border-border pb-6">
              <div className="grid h-24 w-24 shrink-0 place-items-center rounded-[var(--radius-lg)] border border-border-strong bg-surface/70"><ItemIcon item={selectedItem} size={72} /></div>
              <div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-subtle">{t("items.detail.itemProfile")}</p><h2 className="mt-1 font-display text-2xl font-semibold leading-tight text-primary">{selectedGroup?.label}</h2><div className="mt-2 flex flex-wrap items-center gap-1.5">{selectedBaseRarities.map((rarity) => <RarityBadge key={rarity} rarity={rarity} />)}{selectedGroup && selectedGroup.items.length > 1 && <span className="shrink-0 rounded-[var(--radius-sm)] border border-border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-subtle">{t("items.variantCount", { count: selectedGroup.items.length })}</span>}{selectedOwned && <span className="flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-accent/50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent"><Backpack size={10} aria-hidden="true" />{t("items.carrying")}</span>}</div></div>
            </header>

            <dl className="grid grid-cols-4 gap-2">
              <div className="rounded-[var(--radius-md)] border border-border bg-surface/45 p-3"><dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-subtle">{t("items.detail.weight")}</dt><dd className="mt-1 text-base font-semibold tabular-nums text-primary">{selectedWeights.length === 1 ? selectedWeights[0] : `${Math.min(...selectedWeights)}–${Math.max(...selectedWeights)}`}</dd>{selectedUses.length === 1 && selectedUses[0] !== null ? <dd className="mt-0.5 text-[10px] text-subtle">{t("items.uses", { count: selectedUses[0] })}</dd> : selectedUses.length > 1 ? <dd className="mt-0.5 text-[10px] text-subtle">{t("items.detail.usesVary")}</dd> : null}</div>
              <div className="rounded-[var(--radius-md)] border border-border bg-surface/45 p-3"><dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-subtle">{t("items.detail.cookable")}</dt><dd className="mt-1 text-sm font-semibold text-primary">{selectedCookable.length === 1 ? (selectedCookable[0] ? t("items.yes") : t("items.no")) : t("items.detail.varies")}</dd></div>
              <div className="rounded-[var(--radius-md)] border border-border bg-surface/45 p-3"><dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-subtle">{t("items.detail.pocketable")}</dt><dd className="mt-1 text-sm font-semibold text-primary">{selectedPocketable.length === 1 ? (selectedPocketable[0] ? t("items.yes") : t("items.no")) : t("items.detail.varies")}</dd></div>
              <div className="rounded-[var(--radius-md)] border border-border bg-surface/45 p-3"><dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-subtle">{t("items.detail.primaryAction")}</dt><dd className="mt-1 truncate text-sm font-semibold text-primary">{selectedPrimaryActions.length === 1 ? (selectedPrimaryActions[0] || t("items.detail.noAction")) : t("items.detail.varies")}</dd></div>
            </dl>
            <p className="-mt-4 text-[11px] leading-relaxed text-subtle">{t("items.detail.cookableHint")}</p>

            {selectedEffects.length > 0 && <section><h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle"><ChefHat size={12} className="text-accent" aria-hidden="true" />{t("items.detail.effects")}</h3><ul className="mt-2 grid grid-cols-2 gap-2">{selectedEffects.map(({ effect, variants }, index) => <li key={`${effect.type}-${index}`} className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-surface/45 px-3 py-2 text-[12px]"><span className="min-w-0 text-primary">{t(`items.effects.${effect.type}`, { defaultValue: prettify(effect.type) })}{effect.status ? ` · ${prettify(effect.status)}` : ""}{selectedGroup && variants < selectedGroup.items.length && <span className="mt-0.5 block text-[9px] text-subtle">{t("items.detail.variantApplicability", { count: variants, total: selectedGroup.items.length })}</span>}</span>{typeof effect.amount === "number" && <span className="shrink-0 tabular-nums text-muted">{effect.amount > 0 ? `+${effect.amount}` : effect.amount}</span>}</li>)}</ul></section>}
            <section><div className="flex items-center gap-2"><h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle"><Backpack size={12} className="text-accent" aria-hidden="true" />{t("items.detail.foundIn")}</h3><span className="text-[10px] tabular-nums text-subtle">{selectedAppearances.length}</span>{sharedAppearanceRarity && <div className="ml-auto"><RarityBadge rarity={sharedAppearanceRarity} /></div>}</div>{selectedAppearances.length === 0 ? <p className="mt-2 text-[12px] text-muted">{t("items.detail.noPools")}</p> : <ul className="mt-2 grid grid-cols-2 gap-2">{selectedAppearances.map((appearance) => <li key={appearance.pool.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border bg-surface/45 px-3 py-2.5 text-[12px]"><span className="flex min-w-0 items-center gap-2"><span className="truncate font-medium text-primary">{poolLabel(appearance.pool.name)}</span>{!sharedAppearanceRarity && appearance.rarities.map((rarity) => <RarityBadge key={rarity} rarity={rarity} />)}</span><span className="shrink-0 tabular-nums font-semibold text-accent">{appearance.chance}%</span></li>)}</ul>}</section>
          </article>}
    emptyMessage={t(peakMap.loading ? "map.today.loading" : "items.empty")}
  />;
};

export default ItemsScreen;
