import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { ItemDatabaseEntry } from "../items/types";
import MapItemLinkRow from "./map-item-link-row";
import type { MapLootDisplayRow } from "./map-loot-display-rows";

const INITIAL_LOOT_LIMIT = 10;

interface MapLootListProps {
  rows: MapLootDisplayRow[];
  loading?: boolean;
  selectedItemId?: string;
  onSelectItem?: (item: ItemDatabaseEntry) => void;
}

const MapLootList = ({
  rows,
  loading = false,
  selectedItemId,
  onSelectItem,
}: MapLootListProps) => {
  const { t, i18n } = useTranslation();
  const listId = useId();
  const rowsKey = rows.map((row) => row.id).join("|");
  const [expandedRowsKey, setExpandedRowsKey] = useState<string | null>(null);
  const expanded = expandedRowsKey === rowsKey;
  const visibleRows = expanded ? rows : rows.slice(0, INITIAL_LOOT_LIMIT);
  const hiddenCount = Math.max(0, rows.length - INITIAL_LOOT_LIMIT);

  if (loading && rows.length === 0) {
    return <p className="text-[11px] text-muted">{t("items.loading")}</p>;
  }
  if (rows.length === 0) return null;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-2.5">
      <ul id={listId} className="grid min-w-0 grid-cols-1 gap-1.5">
        {visibleRows.map((row) => {
          const displayName = row.item.localizedNames[i18n.language]
            ?? row.item.localizedNames.en
            ?? row.item.name;
          const formattedChance = row.chance?.toLocaleString(i18n.language, { maximumFractionDigits: 2 });
          return (
            <li key={row.id} className="min-w-0">
              <MapItemLinkRow
                item={row.item}
                displayName={displayName}
                secondary={row.amount > 1 ? t("map.containerLoot.amount", { count: row.amount }) : undefined}
                trailing={row.certainty === "conditional" ? (
                  <span className="min-w-0 break-words text-right text-[11px] font-medium text-subtle">
                    {t("map.itemStoryImpact.conditional")}
                  </span>
                ) : formattedChance !== undefined ? (
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-subtle">
                    {`${row.certainty === "possible" ? "≈" : ""}${t("map.containerLoot.chance", { chance: formattedChance })}`}
                  </span>
                ) : undefined}
                active={selectedItemId === row.item.id}
                ariaLabel={t("map.containerLoot.viewItem", { item: displayName })}
                onSelect={onSelectItem}
              />
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpandedRowsKey(expanded ? null : rowsKey)}
          className="flex min-h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-white/[0.03] px-3 text-[11px] font-semibold text-subtle transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-zinc-100"
        >
          <ChevronDown
            size={14}
            className={cn("transition-transform", expanded && "rotate-180")}
            aria-hidden="true"
          />
          {t(expanded ? "map.checklist.showLess" : "map.checklist.showMore", { count: hiddenCount })}
        </button>
      )}
    </div>
  );
};

export default MapLootList;
