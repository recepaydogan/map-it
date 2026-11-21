import { useEffect, useMemo, useState } from "react";
import { Library, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ER_ITEM_CATEGORIES,
  erCategoryCounts,
  erCategoryColor,
  erItemEnglishTextByKey,
  type ErItem,
  erItemKey,
  erItems,
} from "../../data/er-items-data";
import { useDataVersion } from "../../data/localized-data";
import { fallbackIconUrl } from "../../data/fallback-icons";
import { cn } from "../../lib/cn";
import { ALL_CATEGORY } from "./category-select";
import ItemCatalog, { ItemCatalogCategory } from "../../components/layout/item-catalog";
import ItemIcon from "../../components/item-icon";
import ErItemDetail from "./er-item-detail";

const RENDER_CAP = 300;

/**
 * The Item Codex — a real, searchable browser over the full ER item DB with a
 * rich detail "wiki page" per item. Constrained to the non-ads region (it lives
 * inside MapShell), so it never covers the Overwolf ad rail.
 *
 * `embedded` renders the browser body ALONE — no positioned wrapper, no masthead —
 * so the unified ArchiveOverlay can host it under its own header + ER/NR switcher.
 * Standalone (embedded omitted) it is a self-contained full-window surface.
 */
const CodexOverlay = ({
  onClose,
  initialItemKey,
  embedded,
}: {
  onClose?: () => void;
  initialItemKey?: string | null;
  embedded?: boolean;
}) => {
  const { t, i18n } = useTranslation();
  // Bumped when the game data is swapped to another language; drives the recompute
  // of the (otherwise language-invariant) item list + re-resolves the selection.
  const dataVersion = useDataVersion((s) => s.version);
  // A global-search jump hands us an item key; open on its category with it selected.
  const initial = useMemo(
    () => (initialItemKey ? erItems.find((i) => erItemKey(i) === initialItemKey) : undefined),
    [initialItemKey],
  );
  const [category, setCategory] = useState(initial?.category ?? (typeof window !== "undefined" ? (window as any).__ER_SEO_CATEGORY__ ?? ALL_CATEGORY : ALL_CATEGORY));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ErItem | null>(initial ?? null);
  const counts = useMemo(erCategoryCounts, []);


  // On a language change the item objects are replaced with localized copies, so
  // re-resolve the held selection by its stable key — keeps you on the same item.
  useEffect(() => {
    setSelected((prev) => (prev ? erItems.find((i) => erItemKey(i) === erItemKey(prev)) ?? null : prev));
  }, [dataVersion]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return erItems
      .filter(
        (i) =>
          (category === ALL_CATEGORY || i.category === category) &&
          (!q || i.name.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [category, query, dataVersion]);

  const shown = filtered.slice(0, RENDER_CAP);
  const categories = [
    { key: ALL_CATEGORY, label: t("codex.allItems"), count: erItems.length, icon: "pin" },
    ...ER_ITEM_CATEGORIES.map((entry) => ({
      ...entry, label: t("term." + entry.label, { defaultValue: entry.label }), count: counts[entry.key] ?? 0,
    })),
  ].filter(({ count }) => count > 0);
  const selectCategory = (key: string) => { setCategory(key); setSelected(null); };

  // Cross-link navigation. A detail-page chip ("Used in recipes", "Crafted from")
  // can point to an item OUTSIDE the active category or current search — e.g. the
  // material Aeonian Butterfly links to the consumable "Rot Pot" and the arrow
  // "Rotbone Arrow". Without realigning the filter, `current` (above) drops the pick
  // back to shown[0] — and since the source material is often shown[0] itself, the
  // page appears frozen. So when the target falls outside the visible list, switch to
  // its category and clear a search that would hide it, then select it.
  const selectItem = (it: ErItem) => {
    setSelected(it);
    if (category !== ALL_CATEGORY && it.category !== category) setCategory(it.category);
    if (query.trim() && !it.name.toLowerCase().includes(query.trim().toLowerCase()))
      setQuery("");
      
    // Update the URL without reloading if we are browsing in SEO mode
    if (typeof window !== "undefined" && window.location.pathname.includes("/items/")) {
      const slug = it.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const typeId = erItemKey(it).split(":")[1] || erItemKey(it);
      
      // Preserve language prefix if present (e.g., /de/items/...)
      const match = window.location.pathname.match(/^(.*\/items)/);
      if (match) {
        window.history.replaceState(null, "", `${match[1]}/${it.category}/${slug}-${typeId}`);
      }
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col",
        embedded ? "min-h-0 flex-1" : "absolute inset-0 z-[1500] bg-background animate-fade-in",
      )}
    >
      {/* Masthead — the archive's title page. Engraved caps + a faint gold wash
          give the codex an in-world, tome-like presence. Suppressed when embedded:
          the unified ArchiveOverlay supplies one shared header for both catalogs. */}
      {!embedded && (
      <header className="relative flex items-center gap-3 border-b border-border px-4 py-3.5 sm:px-6 sm:py-4">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/[0.08] to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-accent/40 via-accent/10 to-transparent"
        />
        {/* Engraved gold medallion — a tome-like seal that anchors the masthead.
            Layered fill + inner sheen + soft glow lift it off the flat header. */}
        <div className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] border border-accent/40 bg-gradient-to-b from-accent/[0.22] to-accent/[0.05] shadow-[0_0_18px_-6px_var(--color-accent)] sm:h-12 sm:w-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent"
          />
          <Library size={22} className="relative text-accent" aria-hidden="true" />
        </div>
        <div className="relative min-w-0">
          <h1 className="font-display text-[17px] font-semibold uppercase leading-none tracking-[0.14em] text-white sm:text-[20px] sm:tracking-[0.18em]">
            {t("codex.title")}
          </h1>
          <p className="mt-1.5 truncate text-[11px] tracking-wide text-muted">
            {t("codex.subtitle")}
          </p>
        </div>
        <div className="flex-1" />
        <button
          onClick={onClose}
          aria-label={t("codex.closeArchive")}
          className="relative grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white cursor-pointer"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>
      )}

      <ItemCatalog
        label={t("codex.allItems")} gameName="Elden Ring" artwork="/item-catalog-art.webp" wordmark="/item-catalog-logo.webp"
        search={{ query, label: t("codex.searchPlaceholder", { category: t("codex.itemsFallback") }), clearLabel: t("codex.clearSearch"),
          onChange: (value) => { setQuery(value); setSelected(null); } }}
        categoryLabel={t("codex.categoryLabel")}
        landingCategories={categories.map(({ key, label, count }) => {
          const icon = fallbackIconUrl(key);
          return {
            id: key, label, count: count.toLocaleString(i18n.language), onSelect: () => selectCategory(key),
            icon: icon && <img src={icon} alt="" width={52} height={52} draggable={false} />,
          };
        })}
        categories={categories.map(({ key, label, count }) => <ItemCatalogCategory key={key} label={label}
          count={count.toLocaleString(i18n.language)} active={category === key} onSelect={() => selectCategory(key)} />)}
        columns={[{ label: t("codex.categoryLabel") }]}
        rows={shown.map((item) => {
          const meta = ER_ITEM_CATEGORIES.find((entry) => entry.key === item.category);
          const subtype = item.subtype && item.subtype !== item.name ? item.subtype : meta?.label ?? item.category;
          const type = t("term." + subtype, { defaultValue: subtype });
          const id = erItemKey(item);
          const englishName = erItemEnglishTextByKey(id)?.name ?? item.name;
          const slug = englishName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
          const href = ["/items", item.category, slug + "-" + (id.split(":")[1] || id)].join("/");
          return { id, label: item.name, subtitle: type, cells: [type], href,
            icon: <ItemIcon iconId={item.icon_id} category={item.category}
              color={erCategoryColor[item.category] ?? "#a1a1aa"} glyph={meta?.icon ?? "pin"} size={28} /> };
        })}
        onOpen={(id) => { const item = shown.find((entry) => erItemKey(entry) === id); if (item) selectItem(item); }}
        onBack={() => setSelected(null)} backLabel={t("codex.allItems")}
        detail={selected && <ErItemDetail key={erItemKey(selected)} item={selected} onSelect={selectItem} />}
        emptyMessage={t("codex.noItemsMatch")}
        afterRows={filtered.length > RENDER_CAP && t("codex.renderCap", { shown: RENDER_CAP, total: filtered.length })}
      />
    </div>
  );
};

export default CodexOverlay;
