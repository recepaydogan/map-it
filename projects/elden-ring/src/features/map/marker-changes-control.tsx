import { useEffect, useMemo, useRef, useState } from "react";
import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../components/tooltip";
import { markersByGame } from "../../data/markers";
import type { Game } from "../../data/types";
import { cn } from "../../lib/cn";
import { useMapStore } from "../../store/map-store";
import MarkerChangeSection, { type MarkerChangeItem } from "./marker-change-section";

interface MarkerChangesControlProps {
  game: Game;
  /**
   * Names for markers the baked `markersByGame` pool doesn't carry: the live map's
   * per-pattern Nightreign set, and the ER Map's streamed chunk markers. Those pools
   * are the ONLY name source for their ids — without them the panel can't label a
   * change, and used to silently drop it (leaving Changes disabled with no way to
   * revert a saved edit).
   */
  names?: ReadonlyMap<string, string>;
  /**
   * Which map's changes this panel owns. One store slice backs both maps, so each
   * panel takes its own side: "live" lists ids the live map can show, "er-map" takes
   * everything else — its markers stream in per view, so an id being unknown right
   * now is normal and must NOT hide the change.
   */
  scope?: "live" | "er-map";
}

const MarkerChangesControl = ({ game, names, scope = "live" }: MarkerChangesControlProps) => {
  const { t } = useTranslation();
  const overrides = useMapStore((state) => state.markerOverrides);
  const deletions = useMapStore((state) => state.markerDeletions);
  const categoryOverrides = useMapStore((state) => state.markerCategoryOverrides);
  const customMarkers = useMapStore((state) => state.customMarkers);
  const restoreOverride = useMapStore((state) => state.restoreMarkerOverride);
  const toggleDeletion = useMapStore((state) => state.toggleMarkerDeletion);
  const setCategoryOverride = useMapStore((state) => state.setMarkerCategoryOverride);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { moved, removed, reclassified, changeCount } = useMemo(() => {
    const bakedNames = new Map(
      (markersByGame[game] ?? []).map((marker) => [marker.id, marker.name] as const),
    );
    const customNames = new Map(
      customMarkers
        .filter((marker) => marker.game === game)
        .map((marker) => [marker.id, marker.name] as const),
    );
    // The live map's world is fully enumerable (baked pool + host-supplied pattern
    // set + custom), so "known" is a sound ownership test there — and its complement
    // is an exact one for the ER Map, whose ids never appear in the baked pool.
    const ownsId = scope === "er-map"
      ? (id: string) => !bakedNames.has(id)
      : (id: string) => bakedNames.has(id) || customNames.has(id) || (names?.has(id) ?? false);
    const nameFor = (id: string) => customNames.get(id) ?? names?.get(id) ?? bakedNames.get(id);
    const toItems = (ids: string[]): MarkerChangeItem[] =>
      ids
        .filter(ownsId)
        .map((id) => {
          const name = nameFor(id);
          return { id, name: name ?? id, unresolved: name === undefined };
        })
        // Named rows first — an id-only row is a change to a marker this view hasn't
        // loaded, still restorable but not worth the top of the list.
        .sort((left, right) =>
          Number(left.unresolved) - Number(right.unresolved) ||
          left.name.localeCompare(right.name));
    const movedItems = toItems(Object.keys(overrides));
    const removedItems = toItems([...deletions]);
    const reclassifiedItems = toItems(Object.keys(categoryOverrides));
    const changedIds = new Set([
      ...movedItems.map((marker) => marker.id),
      ...removedItems.map((marker) => marker.id),
      ...reclassifiedItems.map((marker) => marker.id),
    ]);
    return {
      moved: movedItems,
      removed: removedItems,
      reclassified: reclassifiedItems,
      changeCount: changedIds.size,
    };
  }, [categoryOverrides, customMarkers, deletions, game, names, overrides, scope]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const panelOpen = open && changeCount > 0;

  return (
    <div ref={rootRef} className="relative">
      <Tooltip label={t("mapEdit.changesHint")} disabled={panelOpen}>
        <button
          onClick={() => setOpen((current) => !current)}
          disabled={changeCount === 0}
          aria-expanded={panelOpen}
          aria-controls="marker-changes-panel"
          className={cn(
            "flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-1 text-[12px] font-medium transition-colors",
            panelOpen
              ? "bg-white/10 text-white cursor-pointer"
              : "text-zinc-300 hover:bg-white/8 hover:text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <History size={14} aria-hidden="true" />
          <span>{t("mapEdit.changes")}</span>
          {changeCount > 0 && <span className="tabular-nums text-zinc-500">{changeCount}</span>}
        </button>
      </Tooltip>
      {panelOpen && (
        <div
          id="marker-changes-panel"
          className="absolute bottom-full right-0 mb-2 flex max-h-[min(24rem,calc(100vh-5rem))] w-80 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface/95 shadow-xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-[12px] font-semibold text-zinc-100">
              {t("mapEdit.changes")}
            </span>
            <span className="tabular-nums text-[11px] text-zinc-500">{changeCount}</span>
          </div>
          <div className="min-h-0 overflow-y-auto">
            <MarkerChangeSection
              title={t("mapEdit.movedMarkers")}
              items={moved}
              onRestore={restoreOverride}
            />
            <MarkerChangeSection
              title={t("mapEdit.removedMarkers")}
              items={removed}
              onRestore={toggleDeletion}
            />
            <MarkerChangeSection
              title={t("mapEdit.categoryChanges")}
              items={reclassified}
              onRestore={(id) => setCategoryOverride(id, null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default MarkerChangesControl;
