import * as RD from "@radix-ui/react-dropdown-menu";
import { Star, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import CategoryDot from "../../components/category-dot";
import MapActionButton from "../../components/map-action-button";
import { markersByGame } from "../../data/markers";
import { getPortalRoot } from "../../lib/portal";
import { useMapStore } from "../../store/map-store";
import { useMapExperience } from "../map-experience/map-experience";

const ER_BY_ID = new Map(markersByGame["elden-ring"].map((m) => [m.id, m]));

/**
 * Bookmarks — a personal shortlist of Elden Ring map locations. The star in the detail
 * panel adds one; this header menu lists them and jumps the map to any (the camera flies
 * there, switching layer if needed). ER-only: its markers are stable, addressable ids.
 */
const BookmarksMenu = () => {
  const { t } = useTranslation();
  const bookmarks = useMapStore((s) => s.bookmarks);
  const clearBookmarks = useMapStore((s) => s.clearBookmarks);
  const { select, categoryById, layers } = useMapExperience();

  const items = useMemo(
    () => [...bookmarks].map((id) => ER_BY_ID.get(id)).filter((m): m is NonNullable<typeof m> => Boolean(m)),
    [bookmarks],
  );

  return (
    <RD.Root>
      <RD.Trigger asChild>
        <MapActionButton
          data-tour="bookmarks"
          title={t("tracking.bookmarks")}
          aria-label={t("tracking.bookmarks")}
        >
          <Star size={16} fill={items.length ? "#fbbf24" : "none"} className={items.length ? "text-amber-400" : ""} aria-hidden="true" />
          {items.length > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-[var(--radius-full)] bg-amber-400 px-1 text-[10px] font-bold tabular-nums text-black">
              {items.length}
            </span>
          )}
        </MapActionButton>
      </RD.Trigger>

      <RD.Portal container={getPortalRoot()}>
        <RD.Content
          align="end"
          sideOffset={6}
          className="z-[1400] w-[min(18.75rem,calc(100vw-1.5rem))] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl shadow-black/60 animate-fade-in"
        >
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{t("tracking.bookmarks")}</p>
            {items.length > 0 && (
              <button onClick={clearBookmarks} className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-rose-300 cursor-pointer">
                <Trash2 size={12} aria-hidden="true" /> {t("tracking.clear")}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] leading-relaxed text-zinc-500">
              {t("tracking.noBookmarksLead")} <Star size={11} className="-mt-0.5 inline text-amber-400" aria-hidden="true" /> {t("tracking.noBookmarksTrail")}
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto p-1.5">
              {items.map((m) => {
                const def = categoryById.get(m.category);
                const layerLabel = layers.find((l) => l.key === m.layer)?.label ?? m.layer;
                return (
                  <RD.Item
                    key={m.id}
                    onSelect={() => select(m.id)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 outline-none transition-colors data-[highlighted]:bg-surface-hover"
                  >
                    <CategoryDot color={def?.color ?? "#a1a1aa"} icon={def?.icon ?? "pin"} size={22} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-zinc-100">{m.name}</span>
                      <span className="block truncate text-[11px] text-muted">{def?.label} · {m.region ?? layerLabel}</span>
                    </span>
                  </RD.Item>
                );
              })}
            </div>
          )}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
};

export default BookmarksMenu;
