import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Users, X } from "lucide-react";
import CategoryDot from "../../components/category-dot";
import ItemIcon from "../../components/item-icon";
import MapActionButton from "../../components/map-action-button";
import { ER_ITEM_CATEGORIES, erCategoryColor, erItemKey, erItems } from "../../data/er-items-data";
import { markersByGame } from "../../data/markers";
import { nrNightfarers } from "../../data/nightreign-data";
import { useUiStore } from "../../store/ui-store";
import { cn } from "../../lib/cn";
import { useIsMobile } from "../../utils/platform";
import { useMapExperience } from "../map-experience/map-experience";
import SearchModal from "./search-modal";

const iconForItemCategory = (cat: string) => ER_ITEM_CATEGORIES.find((c) => c.key === cat)?.icon ?? "pin";

type Result =
  | { kind: "marker"; id: string; name: string; sub: string; color: string; icon: string }
  | { kind: "item"; key: string; name: string; sub: string; iconId: number; category: string; color: string; glyph: string }
  | { kind: "nightfarer"; name: string; sub: string; iconId: number };

/**
 * Global search-as-jump. Searches the whole game's content — every map location
 * (across all layers), the full Elden Ring item database, and the Nightreign
 * Nightfarers — and routes each hit to the right surface: a marker flies the camera
 * (switching layer if needed), an item opens the Grand Archive on it, a Nightfarer
 * opens the roster.
 */
const SearchBox = () => {
  const { t } = useTranslation();
  const { allMarkers, layers, query, setQuery, select, categoryById, game } = useMapExperience();
  const openCodexItem = useUiStore((s) => s.openCodexItem);
  const openNightfarer = useUiStore((s) => s.openNightfarer);
  const isMobile = useIsMobile();
  const [focused, setFocused] = useState(false);
  // Collapsed by default so the header breathes at the Overwolf min window size; the search
  // claims its full width only while in use, then folds back to an icon when empty.
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const expand = () => {
    setExpanded(true);
    setFocused(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Result[] = [];

    // Locations — all layers for ER (the static world); the current pattern for NR.
    const markerPool = game === "elden-ring" ? markersByGame["elden-ring"] : allMarkers;
    for (const m of markerPool) {
      if (out.filter((r) => r.kind === "marker").length >= 6) break;
      if (m.name.toLowerCase().includes(q) || (m.region ?? "").toLowerCase().includes(q)) {
        const def = categoryById.get(m.category);
        const layerLabel = layers.find((l) => l.key === m.layer)?.label ?? m.layer;
        out.push({
          kind: "marker",
          id: m.id,
          name: m.name,
          sub: `${def?.label ?? m.category} · ${m.region ?? layerLabel}`,
          color: def?.color ?? "#a1a1aa",
          icon: def?.icon ?? "pin",
        });
      }
    }

    if (game === "elden-ring") {
      let n = 0;
      for (const it of erItems) {
        if (n >= 6) break;
        if (it.name.toLowerCase().includes(q)) {
          out.push({
            kind: "item",
            key: erItemKey(it),
            name: it.name,
            sub: it.subtype ?? it.category,
            iconId: it.icon_id,
            category: it.category,
            color: erCategoryColor[it.category] ?? "#a1a1aa",
            glyph: iconForItemCategory(it.category),
          });
          n++;
        }
      }
    } else {
      for (const nf of nrNightfarers) {
        if (nf.name.toLowerCase().includes(q) || nf.skill.name?.toLowerCase().includes(q))
          out.push({ kind: "nightfarer", name: nf.name, sub: t("search.subNightfarer", { skill: nf.skill.name }), iconId: nf.smallPortraitId });
      }
    }
    return out;
  }, [query, game, allMarkers, categoryById, layers, t]);

  const open = focused && results.length > 0;

  const choose = (r: Result) => {
    if (r.kind === "marker") select(r.id, "search");
    else if (r.kind === "item") openCodexItem(r.key);
    else openNightfarer(r.name);
    setQuery("");
    setFocused(false);
    setExpanded(false);
  };

  const closeSearch = () => {
    setQuery("");
    setExpanded(false);
    setFocused(false);
  };

  const trigger = (
    <MapActionButton
      data-tour="search"
      onClick={expand}
      active={isMobile && expanded}
      aria-label={t("search.open")}
    >
      <Search size={16} aria-hidden="true" />
    </MapActionButton>
  );

  const field = (
    <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface/85 px-3 py-2 backdrop-blur-xl focus-within:border-accent">
      <Search size={15} className="shrink-0 text-zinc-500" aria-hidden="true" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => {
          setFocused(false);
          if (!query) setExpanded(false); // fold back when left empty
        }, 120)}
        placeholder={game === "elden-ring" ? t("search.placeholderEr") : t("search.placeholderNr")}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500"
      />
      <button
        onClick={closeSearch}
        aria-label={t("search.close")}
        className="shrink-0 text-zinc-500 hover:text-white cursor-pointer"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );

  const rows = results.map((r) => (
    <button
      key={r.kind === "marker" ? `m-${r.id}` : r.kind === "item" ? `i-${r.key}` : `n-${r.name}`}
      // mousedown, not click: the field's blur handler tears the popover down
      // before a click could land.
      onMouseDown={() => choose(r)}
      className={cn("flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-hover cursor-pointer")}
    >
      {r.kind === "marker" && <CategoryDot color={r.color} icon={r.icon} size={22} />}
      {r.kind === "item" && <ItemIcon iconId={r.iconId} category={r.category} color={r.color} glyph={r.glyph} size={22} />}
      {r.kind === "nightfarer" && (
        <span className="grid h-[22px] w-[22px] place-items-center overflow-hidden rounded-[var(--radius-full)] bg-white/5">
          <img src={`/icons/nightreign/menu/${r.iconId}.png`} alt="" className="h-full w-full object-cover" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-zinc-100">{r.name}</span>
        <span className="block truncate text-[11px] text-muted">{r.sub}</span>
      </span>
      {r.kind === "nightfarer" && <Users size={13} className="shrink-0 text-subtle" aria-hidden="true" />}
    </button>
  ));

  // Phone: the trigger stays put in the toolbar and opens a centred modal — see
  // SearchModal for why an inline field can't work at that width.
  if (isMobile) {
    return (
      <>
        {trigger}
        {expanded && (
          <SearchModal
            field={field}
            hasResults={results.length > 0}
            emptyMessage={query.trim() ? t("search.noResults") : t("search.hint")}
            onClose={closeSearch}
          >
            {rows}
          </SearchModal>
        )}
      </>
    );
  }

  // Collapsed: a 36px icon button (matches the Settings button), so the header row stays
  // compact. Clicking it expands the full field.
  if (!expanded && !query) return trigger;

  return (
    <div data-tour="search" className="relative w-60">
      {field}

      {open && (
        <div className="absolute left-0 right-0 top-full z-[1300] mt-1.5 max-h-[70vh] overflow-y-auto overflow-x-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-xl shadow-black/40 animate-fade-in">
          {rows}
        </div>
      )}
    </div>
  );
};

export default SearchBox;
