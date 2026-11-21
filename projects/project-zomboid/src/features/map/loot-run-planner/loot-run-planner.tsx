import { AlertCircle, PackageSearch, Plus, Route, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SavedLootRun } from "../types";
import LootRunSearch from "./loot-run-search";
import type { LootRunItemOption } from "./loot-run-types";
import { searchLootRunItems } from "./loot-run-utils";
import LootRunStartPicker, { type LootRunStartPickerProps } from "./loot-run-start-picker";

interface LootRunPlannerProps {
  items: LootRunItemOption[];
  query: string;
  selectedItemIds: string[];
  selectedItems: LootRunItemOption[];
  activeRun: SavedLootRun | null;
  startPicker: LootRunStartPickerProps;
  onQueryChange: (query: string) => void;
  onToggleItem: (item: LootRunItemOption) => void;
  onStartNewPlan: () => void;
  onBuildRoute: () => Promise<boolean>;
  onClearRun: () => void;
  showHeader?: boolean;
}

const LootRunPlanner = ({
  items,
  query,
  selectedItemIds,
  selectedItems,
  activeRun,
  startPicker,
  onQueryChange,
  onToggleItem,
  onStartNewPlan,
  onBuildRoute,
  onClearRun,
  showHeader = true,
}: LootRunPlannerProps) => {
  const { t } = useTranslation();
  const [buildFailed, setBuildFailed] = useState(false);
  const [building, setBuilding] = useState(false);
  const searchResults = useMemo(
    () => searchLootRunItems(items, query, 12),
    [items, query],
  );
  const completedCount = activeRun?.completedLocationIds.length ?? 0;
  const plannedCount = activeRun?.locationIds.length ?? 0;

  const handleBuildRoute = async () => {
    setBuilding(true);
    try {
      setBuildFailed(!(await onBuildRoute()));
    } finally {
      setBuilding(false);
    }
  };

  const clearBuildFailure = () => setBuildFailed(false);

  return (
    <section
      className="scroll-slim flex h-full min-h-0 w-full flex-col gap-3 overflow-y-auto"
      aria-labelledby={showHeader ? "loot-run-title" : undefined}
      aria-label={showHeader ? undefined : t("map.lootRun.title")}
    >
      {showHeader && (
        <header className="flex items-start gap-2.5 px-1">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] bg-accent-soft text-accent">
            <PackageSearch size={16} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <h2 id="loot-run-title" className="text-[13px] font-semibold text-white">
              {t("map.lootRun.title")}
            </h2>
            <p className="mt-0.5 text-[10px] leading-4 text-white/75">
              {t("map.lootRun.description")}
            </p>
          </span>
        </header>
      )}

      <LootRunStartPicker {...startPicker} onChange={(value) => { clearBuildFailure(); startPicker.onChange(value); }} />

      {activeRun ? (
        <>
          <div className="flex items-center gap-2 border-y border-border py-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-white/5 text-white/80">
              <PackageSearch size={13} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[11px] font-semibold text-white">
                {activeRun.items.length === 1
                  ? activeRun.items[0]!.name
                  : t("map.lootRun.itemCount", { count: activeRun.items.length })}
              </strong>
              <small className="mt-0.5 block text-[9px] text-white/70">
                {t("map.lootRun.progressLabel", { completed: completedCount, total: plannedCount })}
              </small>
            </span>
            <button
              type="button"
              onClick={() => {
                clearBuildFailure();
                onStartNewPlan();
              }}
              aria-label={t("map.lootRun.newPlan")}
              title={t("map.lootRun.newPlan")}
              className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Plus size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClearRun}
              aria-label={t("map.lootRun.clearRun")}
              title={t("map.lootRun.clearRun")}
              className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-white/70 transition-colors hover:bg-danger/10 hover:text-danger-text"
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </div>

          {buildFailed && (
            <div role="alert" className="flex items-start gap-2 rounded-[var(--radius-md)] border border-warning/40 bg-warning/10 px-2.5 py-2 text-[10px] leading-4 text-white/90">
              <AlertCircle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
              <span>{t("map.lootRun.routeBuildFailed")}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleBuildRoute()}
            disabled={building || !startPicker.ready || startPicker.picking}
            className="map-routes-create"
          >
            <span><Route size={15} aria-hidden="true" /></span>
            {building ? t("map.route.calculating") : t("map.lootRun.rebuildRoute")}
          </button>
        </>
      ) : (
        <>
          {selectedItems.length > 0 && (
            <div className="scroll-slim flex max-h-16 shrink-0 flex-wrap gap-1.5 overflow-y-auto pr-1">
              {selectedItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    clearBuildFailure();
                    onToggleItem(item);
                  }}
                  aria-label={t("map.lootRun.removeSelectedItem", { item: item.name })}
                  className="flex max-w-full cursor-pointer items-center gap-1.5 rounded-[var(--radius-full)] border border-border bg-white/5 px-2 py-1 text-[9px] font-medium text-white/90 hover:bg-white/10"
                >
                  <span className="truncate">{item.name}</span>
                  <X size={10} className="shrink-0 text-white/70" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}

          <LootRunSearch
            query={query}
            items={searchResults}
            totalItems={items.length}
            selectedItemIds={selectedItemIds}
            onQueryChange={(nextQuery) => {
              clearBuildFailure();
              onQueryChange(nextQuery);
            }}
            onToggle={(item) => {
              clearBuildFailure();
              onToggleItem(item);
            }}
          />

          <div className="shrink-0 space-y-2 border-t border-border pt-3">

            {buildFailed && (
              <div role="alert" className="flex items-start gap-2 rounded-[var(--radius-md)] border border-warning/40 bg-warning/10 px-2.5 py-2 text-[10px] leading-4 text-white/90">
                <AlertCircle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                <span>{t("map.lootRun.routeBuildFailed")}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleBuildRoute()}
              disabled={selectedItems.length === 0 || building || !startPicker.ready || startPicker.picking}
              className="map-routes-create"
            >
              <span><Plus size={15} aria-hidden="true" /></span>
              {building ? t("map.route.calculating") : t("map.lootRun.buildRoute")}
            </button>
          </div>
        </>
      )}
    </section>
  );
};

export default LootRunPlanner;
