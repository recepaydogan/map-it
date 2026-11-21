import { Crosshair, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ItemCatalog from "../../components/layout/item-catalog";
import { contentUrl } from "../../lib/content-url";
import { getCategoryConfig } from "../map/map-config";
import { loadCodexMap, type CodexMapFacts } from "./rob-run-codex-data";
import { loadRobRunItems, type CatalogItem } from "./rob-run-data";
import { DetailFacts, DetailItemLink, DetailSection } from "./rob-run-detail";
import RobRunWikiWorkspace from "./rob-run-wiki-workspace";

interface HeistItem {
  id: string;
  name: string;
  icon?: string;
}

interface Heist {
  id: string;
  name: string;
  description: string;
  type: string;
  icon?: string;
  gear: HeistItem[];
  rewards: HeistItem[];
  counts: Record<string, number>;
}

interface HeistCatalogProps {
  onOpenMarker: (id: string) => void;
}

function HeistItems({ label, items }: {
  label: string; items: (HeistItem & { meta?: string })[];
}) {
  if (!items.length) return null;
  return <DetailSection title={label}>
    <ul className="rob-run-detail-stock">
      {items.map((item) => <li key={item.id}>
        <DetailItemLink item={item} meta={item.meta} />
      </li>)}
    </ul>
  </DetailSection>;
}

function HeistDetail({ heist, map, items, onOpenMarker }: HeistCatalogProps & {
  heist: Heist; map?: CodexMapFacts; items: CatalogItem[];
}) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.resolvedLanguage);
  const money = new Intl.NumberFormat(i18n.resolvedLanguage, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const facts = map?.points[heist.id];
  const name = facts?.title ?? heist.name;
  const itemById = new Map(items.map((item) => [item.id, item]));
  const keys = (facts?.keys ?? []).flatMap(({ item: id, opens }) => {
    const item = itemById.get(id);
    return item ? [{ ...item, meta: opens }] : [];
  });
  const children = Object.values(map?.points ?? {}).filter((point) => point.parent?.id === heist.id);
  const gearIds = new Set(heist.gear.map((item) => item.id));
  const fixed = new Map<string, { min: number; max: number }>();
  const counts = new Map<string, number>();
  const opening = new Map<string, Set<number>>();
  for (const point of children) {
    const category = getCategoryConfig(point.parent!.category);
    const label = t(category.labelKey);
    counts.set(label, (counts.get(label) ?? 0) + 1);
    for (const entry of point.requirements ?? []) gearIds.add(entry.item);
    const seconds = point.drillSeconds ?? point.unlockSeconds;
    if (seconds !== undefined) {
      const values = opening.get(label) ?? new Set<number>();
      values.add(seconds);
      opening.set(label, values);
    }
    if (!point.random && point.lootPool !== undefined) {
      for (const entry of map?.lootPools[point.lootPool] ?? []) {
        if (entry.min === undefined) continue;
        const total = fixed.get(entry.item) ?? { min: 0, max: 0 };
        fixed.set(entry.item, { min: total.min + entry.min, max: total.max + (entry.max ?? entry.min) });
      }
    }
  }
  if (heist.id === "bank") gearIds.add("drill-1");
  if (heist.id === "grand-hotel") gearIds.add("auto-flipper-1");
  const gear = [...gearIds].flatMap((id) => {
    const item = itemById.get(id) ?? heist.gear.find((entry) => entry.id === id);
    return item && !keys.some((key) => key.id === id) ? [item] : [];
  });
  const fixedItems = [...fixed].flatMap(([id, { min, max }]) => {
    const item = itemById.get(id);
    if (!item) return [];
    const format = item.gameId === "cash_1" ? money : number;
    const amount = max === min ? format.format(min) : `${format.format(min)}–${format.format(max)}`;
    return [{ ...item, meta: item.gameId === "cash_1" ? amount : `×${amount}` }];
  });
  const possible = facts?.lootPool !== undefined ? (map?.lootPools[facts.lootPool] ?? []).flatMap(({ item: id }) => {
    const item = itemById.get(id);
    return item && !fixed.has(id) ? [item] : [];
  }) : [];
  const refills = (facts?.refills ?? []).flatMap(({ item: id, points }) => {
    const item = itemById.get(id);
    return item ? [{ ...item, meta: points !== undefined ? t("robRun.location.refillPoints", { count: points }) : undefined }] : [];
  });

  return <RobRunWikiWorkspace title={name}>
    <article>
      <header className="rob-run-detail-header">
        {heist.icon && <img src={contentUrl(heist.icon)} alt="" />}
        <div>
          <p className="rob-run-detail-eyebrow">{[facts?.district, heist.type].filter(Boolean).join(" · ")}</p>
          <h1>{name}</h1>
          {heist.description && <p>{heist.description}</p>}
          <button type="button" onClick={() => onOpenMarker(heist.id)} className="rob-run-detail-action mt-2">
            <MapPin size={16} aria-hidden="true" /> {t("robRun.maps.openMap")}
          </button>
        </div>
      </header>
      <div className="rob-run-detail-content">
        <HeistItems label={t("robRun.location.accessKeys")} items={keys} />
        <HeistItems label={t("robRun.heists.requiredGear")} items={gear} />
        <HeistItems label={t("robRun.heists.fixedLoot")} items={fixedItems} />
        <HeistItems label={t("robRun.location.potentialLoot")} items={possible} />
        {facts?.lootPool === undefined && <HeistItems label={t("robRun.heists.previewRewards")}
          items={(heist.rewards ?? []).map((item) => itemById.get(item.id) ?? item)} />}
        <HeistItems label={t("robRun.location.refills")} items={refills} />
        {opening.size > 0 && <DetailSection title={t("robRun.heists.openingTimes")}>
          <DetailFacts rows={[...opening].map(([label, times]) => [label, [...times].sort((a, b) => a - b)
            .map((seconds) => t("robRun.economy.seconds", { amount: number.format(seconds) })).join(" · ")])} />
        </DetailSection>}
        <DetailSection title={t("robRun.heists.spots")}>
          <DetailFacts rows={(counts.size ? [...counts] : Object.entries(heist.counts)).sort(([a], [b]) => a.localeCompare(b))} />
        </DetailSection>
      </div>
    </article>
  </RobRunWikiWorkspace>;
}

export default function RobRunHeists({ onOpenMarker }: HeistCatalogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [rows, setRows] = useState<Heist[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [reference, setReference] = useState<CodexMapFacts>();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    void loadRobRunItems().then((data) => { if (!controller.signal.aborted) setItems(data); }, () => {});
    void loadCodexMap("looty-bay").then((data) => { if (!controller.signal.aborted) setReference(data); }, () => {});
    void fetch(contentUrl("data/rob-run/heists.json"), { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Heist catalog request failed.");
      const data: Heist[] = await response.json();
      if (!controller.signal.aborted) {
        setRows(data);
        setStatus("ready");
      }
    }).catch(() => {
      if (!controller.signal.aborted) setStatus("error");
    });
    return () => controller.abort();
  }, []);

  const term = query.trim().toLowerCase();
  const visible = rows.filter((row) => [row.name, reference?.points[row.id]?.title ?? "", row.type, ...Object.keys(row.counts),
    ...[...row.gear, ...(row.rewards ?? [])].map(({ name }) => name)]
    .join(" ").toLowerCase().includes(term));
  const selected = rows.find(({ id }) => id === selectedId);

  return <ItemCatalog
    label={t("robRun.heists.title")}
    search={{ query, onChange: setQuery, label: t("robRun.heists.search"), clearLabel: t("map.search.clear") }}
    columns={[{ label: t("robRun.heists.buildingType") }, { label: t("robRun.heists.spots"), numeric: true }]}
    rows={visible.map((row) => ({
      id: row.id, label: reference?.points[row.id]?.title ?? row.name,
      icon: row.icon
        ? <img src={contentUrl(row.icon)} className="size-6 object-contain" alt="" />
        : <Crosshair size={16} aria-hidden="true" />,
      cells: [row.type, Object.values(row.counts).reduce((sum, count) => sum + count, 0)],
    }))}
    onOpen={setSelectedId} onBack={() => setSelectedId(undefined)} backLabel={t("robRun.heists.back")} backInToolbar
    emptyMessage={t("robRun.heists." + (status === "ready" ? "empty" : status))}
    detail={selected && <HeistDetail key={selected.id} heist={selected} map={reference} items={items} onOpenMarker={onOpenMarker} />}
  />;
}

