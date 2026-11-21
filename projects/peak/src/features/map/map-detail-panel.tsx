import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  PackageOpen,
  Weight,
  X,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { twMerge } from "tailwind-merge";
import type {
  MapMarker,
  MarkerCategoryDefinition,
  PeakAchievement,
  PeakGuidebookPage,
  PeakItem,
  PeakItemRarity,
  PeakLootPool,
  PeakLootPoolEntry,
} from "./map-data";
import { MarkerCategoryIcon } from "./marker-category-icon";
import { unitsToMeters } from "../../utils/game-units";

const RARITY_STYLES: Record<PeakItemRarity, string> = {
  common: "bg-primary/[0.08] text-primary",
  uncommon: "bg-emerald-600/25 text-emerald-200",
  rare: "bg-sky-600/25 text-sky-200",
  epic: "bg-violet-600/25 text-violet-200",
  legendary: "bg-amber-600/25 text-amber-200",
  mythic: "bg-rose-600/25 text-rose-200",
  "ridiculously-rare": "bg-fuchsia-600/25 text-fuchsia-200",
};

interface MarkerItemEntry {
  item: PeakItem;
  rarity: PeakItemRarity | null;
  chance: number | null;
  quantityMin?: number;
  quantityMax?: number;
}

interface MapDetailPanelProps {
  marker: MapMarker;
  categoryDefinitions: MarkerCategoryDefinition[];
  markers: MapMarker[];
  items: PeakItem[];
  lootPools: PeakLootPool[];
  achievements: PeakAchievement[];
  guidebook: PeakGuidebookPage[];
  selectedItemId: number | null;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  onItemSelect: (itemId: number) => void;
  onNavigateMarker: (marker: MapMarker) => void;
}

const ItemIcon = ({ item, size = 30 }: { item: PeakItem; size?: number }) => (
  <span
    className="grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-border bg-background/70"
    style={{ width: size, height: size }}
  >
    {item.icon ? (
      <img src={item.icon} alt="" draggable={false} className="h-full w-full object-contain" />
    ) : (
      <PackageOpen size={Math.round(size * 0.45)} className="text-subtle" aria-hidden="true" />
    )}
  </span>
);

const RarityBadge = ({ rarity }: { rarity: PeakItemRarity }) => {
  const { t } = useTranslation();
  return (
    <span className={twMerge("shrink-0 whitespace-nowrap rounded-[var(--radius-full)] px-2 py-0.5 text-[10px] font-medium", RARITY_STYLES[rarity])}>
      {t(`map.rarities.${rarity}`)}
    </span>
  );
};

const ItemMiniCard = ({ entry, onSelect }: { entry: MarkerItemEntry; onSelect: () => void }) => {
  const { t } = useTranslation();
  const quantity = entry.quantityMin != null
    ? entry.quantityMin === entry.quantityMax
      ? `×${entry.quantityMin}`
      : `×${entry.quantityMin}–${entry.quantityMax}`
    : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-primary/[0.03] px-2.5 py-2 text-left transition-colors hover:border-accent/50 hover:bg-primary/[0.06]"
    >
      <ItemIcon item={entry.item} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-primary">
          {entry.item.name}
          {quantity ? <span className="ml-1 text-subtle">{quantity}</span> : null}
        </p>
        <p className="mt-0.5 text-[10px] text-muted">
          {entry.chance != null ? t("map.detail.dropChance", { chance: entry.chance }) : t("map.detail.verifiedReward")}
        </p>
      </div>
      {entry.rarity ? <RarityBadge rarity={entry.rarity} /> : null}
    </button>
  );
};

const MarkerHeader = ({
  marker,
  category,
  onClose,
  hasBack,
}: {
  marker: MapMarker;
  category: MarkerCategoryDefinition;
  onClose: () => void;
  hasBack: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <header className={twMerge(
      "relative mb-3 flex shrink-0 items-start gap-2.5 border-b border-border bg-surface/95 px-3 pb-3 backdrop-blur-xl",
      hasBack ? "pt-2" : "pt-3",
    )}>
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-border bg-background/45">
        <MarkerCategoryIcon
          category={category}
          size={20}
          className={category.iconSource ? "h-8 w-8" : undefined}
        />
      </span>
      <div className="min-w-0 pr-8">
        <h2 className="text-base font-semibold leading-tight text-primary">{marker.name}</h2>
        <p className="mt-0.5 text-xs text-muted">{t(category.labelKey)}</p>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-subtle">
          <MapPin size={11} className="text-accent" aria-hidden="true" />
          {t(marker.regionKey)} · {unitsToMeters(marker.elevation)} m
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-md)] text-subtle transition-colors hover:bg-primary/[0.08] hover:text-primary"
        aria-label={t("map.actions.closeDetails")}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </header>
  );
};

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-surface px-3 py-3">
    <p className="text-[9px] uppercase tracking-[0.16em] text-subtle">{label}</p>
    <p className="mt-1 text-xs font-medium text-primary">{value}</p>
  </div>
);

const MarkerBody = ({
  marker,
  entries,
  pool,
  achievements,
  guidebook,
  onItemSelect,
}: {
  marker: MapMarker;
  entries: MarkerItemEntry[];
  pool: PeakLootPool | null;
  achievements: PeakAchievement[];
  guidebook: PeakGuidebookPage[];
  onItemSelect: (itemId: number) => void;
}) => {
  const { t } = useTranslation();
  const content = marker.content;
  const relatedAchievements = (content.relatedAchievementIds ?? []).flatMap((id) => {
    const achievement = achievements.find((candidate) => candidate.id === id);
    return achievement ? [achievement] : [];
  });
  const guidebookPage = guidebook.find((page) => page.id === content.guidebookPageId) ?? null;
  const formatFactValue = (value: string | number, unit?: string | null): string => {
    if (!unit) return String(value);
    return t(`map.units.${unit}`, { value, defaultValue: `${value} ${unit}` });
  };
  const facts = (content.facts ?? []).map((fact) => ({
    label: t(`map.facts.${fact.key}`, {
      defaultValue: fact.key.replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase()),
    }),
    value: formatFactValue(fact.value, fact.unit),
  }));
  if (content.instances && content.instances > 1) {
    facts.push({ label: t("map.detail.instances"), value: t("map.units.count", { value: content.instances }) });
  }

  return (
    <div className="w-full px-4 pb-4">
      {facts.length > 0 ? (
        <div className="grid grid-cols-2 gap-px border border-border bg-border">
          {facts.map((fact) => <Fact key={fact.label} label={fact.label} value={fact.value} />)}
        </div>
      ) : null}

      {entries.length > 0 ? (
        <section className={facts.length > 0 ? "mt-5" : undefined}>
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
                {pool ? t("map.detail.possibleContents") : t("map.detail.contents")}
              </h3>
              {pool ? <p className="mt-1 text-[11px] text-muted">{t(`map.lootPools.${pool.name}`)}</p> : null}
            </div>
            <span className="text-[10px] tabular-nums text-subtle">{entries.length}</span>
          </div>
          {pool ? <p className="mb-3 text-[11px] leading-5 text-muted">{t("map.detail.runtimeRollNote")}</p> : null}
          <div className="flex flex-col gap-1.5">
            {entries.map((entry) => (
              <ItemMiniCard key={entry.item.id} entry={entry} onSelect={() => onItemSelect(entry.item.id)} />
            ))}
          </div>
        </section>
      ) : null}

      {guidebookPage ? (
        <section className="mt-5">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">{t("map.detail.guidebook")}</h3>
          <div className="rounded-[var(--radius-sm)] border border-border bg-primary/[0.03] px-3 py-3">
            <p className="text-[13px] font-medium text-primary">{guidebookPage.title}</p>
            <p className="mt-1.5 whitespace-pre-line text-[11px] leading-5 text-muted">{guidebookPage.body}</p>
          </div>
        </section>
      ) : null}

      {relatedAchievements.length > 0 ? (
        <section className="mt-5">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">{t("map.detail.relatedAchievements")}</h3>
          <div className="flex flex-col gap-1.5">
            {relatedAchievements.map((achievement) => (
              <div key={achievement.id} className="rounded-[var(--radius-sm)] border border-border bg-primary/[0.03] px-3 py-2.5">
                <p className="text-[12px] font-medium text-primary">{achievement.name}</p>
                {achievement.description ? <p className="mt-1 text-[10px] leading-4 text-muted">{achievement.description}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

    </div>
  );
};

const ItemDetail = ({
  item,
  marker,
  markers,
  lootPools,
  onBack,
  onClose,
  onNavigateMarker,
}: {
  item: PeakItem;
  marker: MapMarker;
  markers: MapMarker[];
  lootPools: PeakLootPool[];
  onBack: () => void;
  onClose: () => void;
  onNavigateMarker: (marker: MapMarker) => void;
}) => {
  const { t } = useTranslation();
  const distanceFromCurrent = (candidate: MapMarker) =>
    Math.hypot(candidate.x - marker.x, candidate.y - marker.y);
  const availability = lootPools.flatMap((pool) => {
    const entry = pool.items.find((candidate) => candidate.itemId === item.id);
    const target = markers
      .filter((candidate) => candidate.content.lootPoolId === pool.id)
      .sort((left, right) => distanceFromCurrent(left) - distanceFromCurrent(right))[0];
    return entry && target
      ? [{
          key: pool.id,
          label: t(`map.lootPools.${pool.name}`),
          note: t("map.detail.dropChance", { chance: entry.chance }),
          rarity: entry.rarity,
          target,
        }]
      : [];
  });
  const directTarget = markers
    .filter((candidate) => candidate.content.items?.some((entry) => entry.itemId === item.id))
    .sort((left, right) => distanceFromCurrent(left) - distanceFromCurrent(right))[0];
  if (directTarget) {
    availability.push({
      key: `marker-${directTarget.content.variant}`,
      label: directTarget.name,
      note: t("map.detail.verifiedReward"),
      rarity: item.baseRarity ?? "common",
      target: directTarget,
    });
  }
  availability.sort(
    (left, right) => distanceFromCurrent(left.target) - distanceFromCurrent(right.target),
  );

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="flex w-full shrink-0 cursor-pointer items-center gap-1 px-4 pt-3 text-xs font-medium text-subtle transition-colors hover:text-primary"
      >
        <ChevronLeft size={15} aria-hidden="true" />
        <span className="truncate">{t("map.detail.backTo", { name: marker.name })}</span>
      </button>
      <header className="relative mb-4 flex shrink-0 items-start gap-3 border-b border-border bg-surface/95 px-4 pb-4 pt-2.5 backdrop-blur-xl">
        <ItemIcon item={item} size={56} />
        <div className="min-w-0 pr-8">
          <h2 className="text-base font-semibold leading-tight text-primary">{item.name}</h2>
          <p className="mt-0.5 text-xs text-muted">{t("map.detail.item")}</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-subtle">
            <MapPin size={11} className="text-accent" aria-hidden="true" />
            {t(marker.regionKey)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-md)] text-subtle transition-colors hover:bg-primary/[0.08] hover:text-primary"
          aria-label={t("map.actions.closeDetails")}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="w-full space-y-5 px-4 pb-4">
          <div className="flex flex-wrap gap-1.5">
            {item.baseRarity ? <RarityBadge rarity={item.baseRarity} /> : null}
            <span className="flex items-center gap-1 rounded-[var(--radius-full)] bg-primary/[0.08] px-2 py-0.5 text-[11px] font-medium text-primary">
              <Weight size={11} aria-hidden="true" />
              {t("map.detail.carryWeightValue", { value: item.weight })}
            </span>
            <span className="rounded-[var(--radius-full)] bg-primary/[0.08] px-2 py-0.5 text-[11px] font-medium text-primary">
              {item.uses == null ? t("map.detail.reusable") : t("map.detail.usesValue", { value: item.uses })}
            </span>
            {item.banInSolo ? (
              <span className="rounded-[var(--radius-full)] bg-amber-600/25 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                {t("map.detail.multiplayerOnly")}
              </span>
            ) : null}
          </div>

          {item.primaryAction || item.secondaryAction ? (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">{t("map.detail.actions")}</h3>
              <div className="grid grid-cols-2 gap-px border border-border bg-border">
                {item.primaryAction ? <Fact label={t("map.detail.primaryAction")} value={item.primaryAction} /> : null}
                {item.secondaryAction ? <Fact label={t("map.detail.secondaryAction")} value={item.secondaryAction} /> : null}
              </div>
            </section>
          ) : null}

          {item.effects.length > 0 || item.cookable ? (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">{t("map.detail.effects")}</h3>
              <div className="grid grid-cols-2 gap-px border border-border bg-border">
                {item.cookable ? <Fact label={t("map.detail.cookable")} value={t("map.detail.yes")} /> : null}
                {item.effects.map((effect, index) => (
                  <Fact
                    key={`${effect.type}-${effect.status ?? "none"}-${index}`}
                    label={t(`map.effects.${effect.type}`, { defaultValue: effect.type.replaceAll("-", " ") })}
                    value={`${effect.amount > 0 ? "+" : ""}${effect.amount}${effect.status ? ` ${t(`map.statuses.${effect.status}`, { defaultValue: effect.status })}` : ""}`}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">{t("map.detail.carryOptions")}</h3>
            <div className="flex flex-wrap gap-1.5 text-[11px] text-primary">
              {item.canPocket ? <span className="rounded-[var(--radius-full)] bg-primary/[0.08] px-2 py-1">{t("map.detail.pocketable")}</span> : null}
              {item.canBackpack ? <span className="rounded-[var(--radius-full)] bg-primary/[0.08] px-2 py-1">{t("map.detail.backpackable")}</span> : null}
              {item.canThrow ? <span className="rounded-[var(--radius-full)] bg-primary/[0.08] px-2 py-1">{t("map.detail.throwable")}</span> : null}
            </div>
          </section>

          {item.tags.length > 0 ? (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">{t("map.detail.properties")}</h3>
              <div className="flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded-[var(--radius-full)] border border-border px-2 py-1 text-[11px] text-muted">
                    {t(`map.itemTags.${tag}`)}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {availability.length > 0 ? (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">{t("map.detail.availableFrom")}</h3>
              <div className="flex flex-col gap-1.5">
                {availability.map(({ key, label, note, rarity, target }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onNavigateMarker(target)}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-primary/[0.03] px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-primary/[0.06]"
                  >
                    <MapPin size={14} className="shrink-0 text-accent" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-primary">{label}</p>
                      <p className="mt-0.5 text-[10px] text-muted">{note}</p>
                    </div>
                    <RarityBadge rarity={rarity} />
                    <ChevronRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
};

const MapDetailPanel = ({
  marker,
  categoryDefinitions,
  markers,
  items,
  lootPools,
  achievements,
  guidebook,
  selectedItemId,
  canGoBack,
  onBack,
  onClose,
  onItemSelect,
  onNavigateMarker,
}: MapDetailPanelProps) => {
  const { t } = useTranslation();
  const category = categoryDefinitions.find((item) => item.id === marker.category)!;
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const pool = marker.content.lootPoolId
    ? lootPools.find((candidate) => candidate.id === marker.content.lootPoolId) ?? null
    : null;
  const entries = useMemo(() => {
    if (pool) {
      return pool.items.flatMap((entry: PeakLootPoolEntry) => {
        const item = itemById.get(entry.itemId);
        return item ? [{ item, rarity: entry.rarity, chance: entry.chance }] : [];
      });
    }
    return (marker.content.items ?? []).flatMap((entry) => {
      const item = itemById.get(entry.itemId);
      return item
        ? [{
            item,
            rarity: item.baseRarity,
            chance: null,
            quantityMin: entry.quantityMin,
            quantityMax: entry.quantityMax,
          }]
        : [];
    });
  }, [itemById, marker.content.items, pool]);
  const selectedItem = selectedItemId == null ? null : itemById.get(selectedItemId) ?? null;
  const hasBack = selectedItem !== null || canGoBack;

  // Lives in the map's left rail so it inherits the same spacing and height
  // constraints as the filters panel instead of maintaining a second offset.
  return (
    <aside className="panel-surface pointer-events-auto flex h-fit min-h-0 w-full flex-col overflow-hidden border border-border-strong animate-fade-in">
      {selectedItem ? (
        <ItemDetail
          item={selectedItem}
          marker={marker}
          markers={markers}
          lootPools={lootPools}
          onBack={onBack}
          onClose={onClose}
          onNavigateMarker={onNavigateMarker}
        />
      ) : (
        <>
          {canGoBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex w-full shrink-0 cursor-pointer items-center gap-1 px-4 pt-3 text-xs font-medium text-subtle transition-colors hover:text-primary"
            >
              <ChevronLeft size={15} aria-hidden="true" />
              <span>{t("map.actions.back")}</span>
            </button>
          ) : null}
          <MarkerHeader marker={marker} category={category} onClose={onClose} hasBack={hasBack} />
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            <MarkerBody
              marker={marker}
              entries={entries}
              pool={pool}
              achievements={achievements}
              guidebook={guidebook}
              onItemSelect={onItemSelect}
            />
          </div>
        </>
      )}
    </aside>
  );
};

export default MapDetailPanel;
