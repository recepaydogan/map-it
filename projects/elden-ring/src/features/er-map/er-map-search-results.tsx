import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import CategoryDot from "../../components/category-dot";
import ItemIcon from "../../components/item-icon";
import {
  ER_ITEM_CATEGORIES,
  erCategoryColor,
  goodsKind,
  type ErItem,
} from "../../data/er-items-data";
import type { CategoryDef } from "../../data/types";
import { cn } from "../../lib/cn";
import type { ErAcquisitionKind, ErItemSource } from "./er-map-item-sources";
import { erMapCategoryArtUrl, erMapMarkerArtUrl } from "./er-map-marker-art";
import type { RawErMapMarker } from "./types";

export interface MarkerResult {
  marker: RawErMapMarker;
  count: number;
}

export interface ItemResult {
  item: ErItem;
  key: string;
  sources: ErItemSource[];
}

interface ErMapSearchResultsProps {
  markerResults: MarkerResult[];
  itemResults: ItemResult[];
  categoryById: Map<string, CategoryDef>;
  /** Item keys whose full source list is unfolded. */
  openItems: ReadonlySet<string>;
  toggleItem: (key: string) => void;
  onSelectMarker: (id: string) => void;
  onNavigate: (view: string, id: string) => void;
}

/** Sources shown before an item folds the rest behind a "+N more". */
const SOURCE_PREVIEW = 3;

const iconForItemCategory = (category: string) =>
  ER_ITEM_CATEGORIES.find((entry) => entry.key === category)?.icon ?? "pin";

const ACQ_TONE: Record<ErAcquisitionKind, string> = {
  treasure: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  shop: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  "npc-drop": "border-sky-400/30 bg-sky-400/10 text-sky-200",
  drop: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  area: "border-white/15 bg-white/5 text-zinc-300",
};

/**
 * The badge names the ACT — buy it, kill for it, pick it up. That's the question
 * a source row answers, so it gets the badge; the number behind it (a drop's
 * chance, a ware's price) is a detail and rides the sub-line instead.
 */
const acquisitionDetail = (source: ErItemSource, always: string): string | undefined => {
  if (source.kind === "drop") {
    return !source.note || source.note === "Guaranteed"
      ? always
      : source.note.replace(/\s*drop$/i, "");
  }
  // Shop rows carry the rune price; the rest say all they have to say in the badge.
  return source.kind === "shop" ? source.note : undefined;
};

/**
 * The map search's result list: locations first, then items with the markers
 * that hand them over nested underneath.
 *
 * Shared verbatim by both shells — the desktop popover anchored under the field,
 * and the phone's centred modal — so the two can't drift on ranking, wording or
 * row anatomy. Scrolling is the shell's job; this renders a plain flow.
 */
const ErMapSearchResults = ({
  markerResults,
  itemResults,
  categoryById,
  openItems,
  toggleItem,
  onSelectMarker,
  onNavigate,
}: ErMapSearchResultsProps) => {
  const { t } = useTranslation();

  const sectionHeading = (label: string) => (
    <div className="sticky top-0 z-10 bg-surface/95 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 backdrop-blur-sm">
      {label}
    </div>
  );

  return (
    <>
      {markerResults.length > 0 && (
        <>
          {sectionHeading(t("search.sectionLocations"))}
          {markerResults.map(({ marker, count }) => {
            const category = categoryById.get(marker.category);
            return (
              <button
                key={marker.id}
                // mousedown, not click: on the desktop popover the field's blur
                // handler tears the list down before a click could land.
                onMouseDown={() => onSelectMarker(marker.id)}
                className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-hover cursor-pointer"
              >
                <CategoryDot
                  color={category?.color ?? "#a1a1aa"}
                  icon={category?.icon ?? "pin"}
                  iconUrl={erMapMarkerArtUrl(marker)}
                  size={22}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-white">
                    {marker.name}
                    {count > 1 && <span className="text-zinc-500"> ×{count}</span>}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {category?.label ?? marker.category} · {marker.region ?? marker.areaNo}
                  </span>
                </span>
              </button>
            );
          })}
        </>
      )}

      {itemResults.length > 0 && (
        <>
          {sectionHeading(t("search.sectionItems"))}
          {itemResults.map(({ item, key, sources }) => {
            const isOpen = openItems.has(key);
            const shown = isOpen ? sources : sources.slice(0, SOURCE_PREVIEW);
            const hidden = sources.length - shown.length;
            return (
              <div key={key}>
                <div className="flex w-full items-center gap-2.5 px-3 py-2">
                  <ItemIcon
                    iconId={item.icon_id}
                    category={item.category}
                    color={erCategoryColor[item.category] ?? "#a1a1aa"}
                    glyph={iconForItemCategory(item.category)}
                    size={22}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-white">{item.name}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {/* goodsKind pulls the real kind out of the goods enum
                          ("Great Rune", "Remembrance"…). It's what tells the
                          handful of same-named items apart — the restored
                          Godrick's Great Rune from the inert one. */}
                      {[item.subtype ?? goodsKind(item) ?? item.category,
                        t("search.sourceCount", { count: sources.length })].join(" · ")}
                    </span>
                  </span>
                </div>

                {/* Rail under the item icon: the rows below are that item's
                    answers, not more top-level results. */}
                <div className="ml-7 border-l border-white/10">
                  {shown.map((source) => {
                    const sourceCategory = categoryById.get(source.category);
                    const detail = acquisitionDetail(source, t("search.acqAlways"));
                    return (
                      <button
                        key={`${source.kind}-${source.markerId}`}
                        onMouseDown={() => onNavigate(source.layer, source.markerId)}
                        className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-hover cursor-pointer"
                      >
                        <CategoryDot
                          color={sourceCategory?.color ?? "#a1a1aa"}
                          icon={sourceCategory?.icon ?? "pin"}
                          iconUrl={erMapCategoryArtUrl(source.category)}
                          size={18}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] text-zinc-200">
                            {source.name}
                            {source.count > 1 && (
                              <span className="text-zinc-500"> ×{source.count}</span>
                            )}
                          </span>
                          <span className="block truncate text-[10px] text-muted">
                            {[sourceCategory?.label ?? source.category, source.region, detail]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-[var(--radius-full)] border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                            ACQ_TONE[source.kind],
                          )}
                        >
                          {t(`search.acq_${source.kind}`)}
                        </span>
                      </button>
                    );
                  })}
                  {(hidden > 0 || isOpen) && (
                    <button
                      // preventDefault keeps focus in the input: the blur
                      // handler would otherwise close the whole dropdown
                      // before the expanded rows could ever be clicked.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        toggleItem(key);
                      }}
                      className="flex min-h-11 w-full items-center gap-1 px-3 py-1.5 text-left text-[11px] text-zinc-400 transition-colors hover:bg-surface-hover hover:text-white cursor-pointer"
                    >
                      <ChevronDown
                        size={12}
                        className={cn("shrink-0 transition-transform", isOpen && "rotate-180")}
                        aria-hidden="true"
                      />
                      {isOpen ? t("search.showFewer") : t("search.moreSources", { count: hidden })}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
};

export default ErMapSearchResults;
