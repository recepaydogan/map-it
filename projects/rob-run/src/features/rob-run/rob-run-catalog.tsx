import { CarFront, Construction, Crosshair, FlaskConical, Gem, HardHat, KeyRound, Package, Pill, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ItemCatalog, { ItemCatalogCategory } from "../../components/layout/item-catalog";
import { contentUrl } from "../../lib/content-url";
import { GAME_CONFIG } from "../../game-config";
import { getItemTypeKey, getItemVariantKey, getRarityKey, itemCategories, loadRobRunItems, type CatalogItem, type ItemCategory } from "./rob-run-data";
import RobRunItemDetail from "./rob-run-item-detail";
import RobRunWikiWorkspace from "./rob-run-wiki-workspace";
import { itemRarityClass, RobRunItemIcon } from "./rob-run-rarity";

const categoryIcons = {
  keys: KeyRound,
  tools: Wrench,
  weapons: Crosshair,
  equipment: HardHat,
  supplies: Pill,
  valuables: Gem,
  materials: Package,
  vehicles: CarFront,
  cargo: Package,
  drugs: FlaskConical,
  building: Construction,
};

const categoryArtwork: Record<ItemCategory, string> = {
  keys: "safe-key-1",
  tools: "mini-drill-1",
  weapons: "kl545-m1",
  equipment: "backpack-2",
  supplies: "afak-1",
  valuables: "gold-bar-1",
  materials: "weaponparts-box-1",
  vehicles: "buletti-soltempra",
  cargo: "cargo-workbench-1",
  drugs: "bush-drugs-1",
  building: "home-2",
};

interface CatalogProps {
  selectedId?: string;
  onSelect: (id?: string) => void;
  onOpenMarker: (id: string) => void;
}

export default function RobRunCatalog({ selectedId, onSelect, onOpenMarker }: CatalogProps) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selectedCategory, setCategory] = useState<ItemCategory | "all">();
  const category = selectedCategory ?? "all";
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    void loadRobRunItems().then((data) => {
      if (!active) return;
      setItems(data);
      setStatus("ready");
    }, () => {
      if (active) setStatus("error");
    });
    return () => { active = false; };
  }, []);

  const selectCategory = (id: ItemCategory | "all") => {
    setCategory(id);
    onSelect();
  };
  const label = (id: ItemCategory | "all") => t("robRun.catalog." + id);
  const categories = itemCategories.flatMap((id) => {
    const group = items.filter((item) => !item.aliasOf && item.category === id);
    if (!group.length) return [];
    const art = group.find((item) => item.id === categoryArtwork[id] && item.icon)?.icon
      ?? group.find((item) => item.icon)?.icon;
    return [{
      id, label: label(id), count: String(group.length), onSelect: () => selectCategory(id),
      icon: art && <img src={contentUrl(art)} alt="" width={52} height={52} draggable={false} />,
    }];
  });
  const all = { id: "all", label: label("all"), count: String(items.filter((item) => !item.aliasOf).length), onSelect: () => selectCategory("all") };
  const number = useMemo(() => new Intl.NumberFormat(i18n.resolvedLanguage), [i18n.resolvedLanguage]);
  const rows = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const typeLabel = (item: CatalogItem) => {
      const key = getItemTypeKey(item.inventoryType);
      return key ? t(`robRun.itemTypes.${key}`) : t(`robRun.catalog.${item.category}`);
    };
    const itemLabels = (item: CatalogItem) => {
      const rarity = getRarityKey(item.rarity, item.reference?.rarity);
      const variant = getItemVariantKey(item);
      return [rarity && t(`robRun.rarity.${rarity}`), variant && t(`robRun.wiki.${variant}`)].filter(Boolean).join(" · ");
    };
    return items.filter((item) => !item.aliasOf && (category === "all" || item.category === category)
      && [item.name, item.description, typeLabel(item), itemLabels(item), item.gameId ?? item.id]
        .some((field) => field.toLocaleLowerCase().includes(term)))
      .map((item) => {
        const Icon = categoryIcons[item.category];
        const rarityClass = itemRarityClass(item);
        return {
          id: item.id, label: item.name, subtitle: itemLabels(item), nameClassName: rarityClass,
          icon: item.icon
            ? <RobRunItemIcon item={item} size={32} loading="lazy" />
            : <Icon size={16} aria-hidden="true" />,
          cells: [
            typeLabel(item),
            <span className={rarityClass}>{itemLabels(item) || "—"}</span>,
            item.sellPrice == null ? "—" : number.format(item.sellPrice),
            ...(category === "weapons" ? [item.weapon?.damage ?? "—",
              item.weapon ? number.format(Math.round(60000 / item.weapon.cooldownMs)) : "—",
              item.weapon?.magazine ?? "—"] : []),
            item.markers.length || "—",
          ],
        };
      });
  }, [items, category, query, number, t]);
  const entry = items.find((item) => item.id === selectedId);
  const selected = entry?.aliasOf ? items.find((item) => item.id === entry.aliasOf) ?? entry : entry;

  return <ItemCatalog
    label={t("robRun.catalog.title")} gameName={GAME_CONFIG.gameName}
    landingCategories={status === "ready" && !selectedId && !selectedCategory ? [all, ...categories] : undefined}
    categories={[all, ...categories].map(({ id, label, count, onSelect }) => (
      <ItemCatalogCategory key={id} label={label} count={count} onSelect={onSelect} active={id === category} />
    ))}
    search={{ query, label: t("robRun.catalog.search"), clearLabel: t("map.search.clear"), onChange: setQuery }}
    columns={[
      { label: t("robRun.catalog.category") },
      { label: t("robRun.wiki.rarity") },
      { label: t("robRun.catalog.sellPrice"), numeric: true },
      ...(category === "weapons" ? ["damage", "fireRate", "magazine"].map((key) => ({
        label: t(`robRun.wiki.${key}`), numeric: true,
      })) : []),
      { label: t("robRun.catalog.locations"), numeric: true },
    ]}
    rows={rows} onOpen={onSelect} onBack={() => onSelect()} backLabel={t("robRun.catalog.back")} backInToolbar
    emptyMessage={t("robRun.catalog." + (status === "ready" ? "empty" : status))}
    detail={selected && <RobRunWikiWorkspace key={selected.id} title={selected.name}>
      <RobRunItemDetail item={selected} items={items} onOpenMarker={onOpenMarker} />
    </RobRunWikiWorkspace>}
  />;
}

