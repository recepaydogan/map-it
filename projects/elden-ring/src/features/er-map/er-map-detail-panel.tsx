import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { bossImageFor } from "../../data/boss-images";
import { enemyImageFor } from "../../data/enemy-images";
import { erItemByKey, erItemKey, type ErItem } from "../../data/er-items-data";
import { localizeErMapText } from "../../data/er-map-text";
import type { CategoryDef, Game, Marker } from "../../data/types";
import { cn } from "../../lib/cn";
import { useIsMobile, useMediaQuery } from "../../utils/platform";
import { MarkerCommentsButton, MarkerCommentsPanel, erMapCommentKey } from "../comments";
import CombatTips from "../detail/combat-tips";
import useKeyHintTriggers from "../hints/use-key-hint-triggers";
import DetailItem from "../detail/detail-item";
import MarkerDetailContent from "../detail/marker-detail-content";
import ErMapDetailActions from "./er-map-detail-actions";
import { isErMapEnemyCategory } from "./er-map-enemy-category";
import { erMapDisplayMarker } from "./er-map-marker-metadata";
import { loadErMapItemIndex, loadProductionIdMap, useErMapEnemyProfile } from "./er-map-spatial-data";
import type { ErMapItemIndex, RawErMapMarker } from "./types";

interface ErMapDetailPanelProps {
  marker: RawErMapMarker | null;
  categoryById: Map<string, CategoryDef>;
  viewLabel: string;
  favorite: boolean;
  found: boolean;
  onClose: () => void;
  onToggleFavorite: () => void;
  onToggleFound: () => void;
  onCenter: () => void;
  /** Select the build-time-resolved arrival marker of a connection click,
   * switching to its view first when needed. */
  onNavigateToMarker?: (viewKey: string, markerId: string, push?: boolean) => void;
  parentMarker?: RawErMapMarker | null;
  onBack?: () => void;
}

const ErMapDetailPanel = ({
  marker,
  categoryById,
  viewLabel,
  favorite,
  found,
  onClose,
  onToggleFavorite,
  onToggleFound,
  onCenter,
  onNavigateToMarker,
  parentMarker,
  onBack,
}: ErMapDetailPanelProps) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  /* Room for two 360px columns beside the filter rail without eating the map:
     rail (272) + 2×360 + gaps/insets (~50) ≈ 1040, so 1180 leaves the map a
     usable strip. Overwolf's 1300px floor always clears it. */
  const sideBySide = useMediaQuery("(min-width: 1180px)") && !isMobile;
  const [drillItemKey, setDrillItemKey] = useState<string | null>(null);
  const [combatOpen, setCombatOpen] = useState(false);
  /* Deliberately NOT reset when the marker changes (drill and combat are): the
     tips column is an inspector the reader opened on purpose, and snapping it
     shut on every click-through would make it feel like it fell over. The count
     store keeps the cost of following it to one cached integer per marker. */
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [itemIndex, setItemIndex] = useState<ErMapItemIndex | null>(null);
  const [productionIdMap, setProductionIdMap] = useState<Record<string, { view: string; id: string }> | null>(null);

  useEffect(() => {
    loadProductionIdMap().then(setProductionIdMap).catch(() => {});
  }, []);

  useEffect(() => {
    loadErMapItemIndex()
      .then(setItemIndex)
      .catch((err) => console.error("Error loading ER-map item index:", err));
  }, []);



  // The panel no longer remounts per marker (that flashed the whole panel closed/open
  // when navigating between markers — the Map tab keeps its DetailPanel mounted and just
  // swaps content). Without the remount we must reset this panel's own drill/combat
  // sub-state ourselves when the marker changes, synchronously during render so the new
  // marker never flashes the previous one's drilled item or combat view.
  const markerId = marker?.id ?? null;
  const [prevMarkerId, setPrevMarkerId] = useState(markerId);
  if (markerId !== prevMarkerId) {
    setPrevMarkerId(markerId);
    setDrillItemKey(null);
    setCombatOpen(false);
  }

  const markerItem = marker?.itemKey ? erItemByKey.get(marker.itemKey) : undefined;
  const drilledItem = drillItemKey ? erItemByKey.get(drillItemKey) : undefined;
  /* Clicking the row that is already open closes it again — with the item beside
     the list instead of replacing it, the row reads as a toggle. Drilling also
     puts the tips away: there is ONE companion column, and three panels beside
     the filter rail would leave no map to look at. */
  const toggleDrillItem = useCallback((key: string) => {
    setCommentsOpen(false);
    setDrillItemKey((current) => (current === key ? null : key));
  }, []);

  /* Two items can be on screen at once now (the marker's own item in the main
     panel, a drilled one in the companion), so the index lookups are per item
     instead of one memo over "the" shown item. */
  const itemViewMap = useCallback((item: ErItem | undefined) => {
    const viewMap = new Map<string, string>();
    if (!itemIndex || !item) return viewMap;
    const entry = itemIndex[erItemKey(item)];
    if (entry) {
      if (entry.locations) {
        for (const loc of entry.locations) {
          viewMap.set(loc.id, loc.layer);
        }
      }
      if (entry.dropSources) {
        for (const ds of entry.dropSources) {
          viewMap.set(ds.id, ds.layer);
        }
      }
    }
    return viewMap;
  }, [itemIndex]);
  const enemyProfile = useErMapEnemyProfile(
    isErMapEnemyCategory(marker?.category) ? marker?.npcParamId : undefined,
  );
  const display = useMemo(
    () => marker
      ? erMapDisplayMarker(marker, enemyProfile, categoryById.get(marker.category), t)
      : null,
    [categoryById, enemyProfile, marker, t],
  );
  const category = useMemo(
    () => categoryById.get(display?.marker.category ?? marker?.category ?? ""),
    [categoryById, display?.marker.category, marker?.category],
  );
  // The fallback dungeonBoss label (evergaols, and any surface arena without an
  // interior join) carries the production twin's Map-tab boss id. The build-time
  // production-id bridge — the same exact-twin join codex jumps ride — turns it
  // into THIS map's (view, id); only once resolved does the row become a real
  // click-through instead of a plain label.
  const dungeonBossLink = useMemo(() => {
    const prodId = display?.productionDungeonBossId;
    return (prodId && productionIdMap?.[prodId]) || null;
  }, [display?.productionDungeonBossId, productionIdMap]);
  const contentMarker = useMemo(() => {
    if (!display) return null;
    return dungeonBossLink
      ? { ...display.marker, dungeonBossId: dungeonBossLink.id }
      : display.marker;
  }, [display, dungeonBossLink]);
  // Dungeon links run both ways — a dungeon lists its bosses, a boss points back
  // at its entrance. Both are projected onto a surface like everything else and
  // carry the view their marker lives in, so following either is the same
  // "switch view (maybe) + select" the connection click-through does.
  const linkViewById = useMemo(() => {
    const views = new Map<string, string>();
    for (const boss of marker?.dungeonBosses ?? []) views.set(boss.id, boss.view);
    for (const entrance of marker?.dungeonEntrances ?? []) views.set(entrance.id, entrance.view);
    // A merged portal hub's destination rows carry their own arrival view.
    for (const destination of marker?.connectionOptions ?? []) {
      if (destination.id && destination.view) views.set(destination.id, destination.view);
    }
    // Single-destination portals synthesize their one destination row from
    // these raw fields (er-map-marker-metadata) — same click-through path.
    if (marker?.connectionTargetMarkerId && marker?.connectionTargetView) {
      views.set(marker.connectionTargetMarkerId, marker.connectionTargetView);
    }
    return views;
  }, [marker]);

  const itemLocationsFor = useCallback((item: ErItem | undefined) => {
    if (!itemIndex || !item) return undefined;
    return itemIndex[erItemKey(item)]?.locations.map((loc) => ({
      id: loc.id,
      game: "elden-ring" as Game,
      layer: loc.layer as Marker["layer"],
      category: loc.category,
      name: localizeErMapText(loc.name),
      region: loc.region ? localizeErMapText(loc.region) : loc.region,
      pixel: { x: 0, y: 0 },
    }));
  }, [itemIndex]);

  const itemDropSourcesFor = useCallback((item: ErItem | undefined) => {
    if (!itemIndex || !item) return undefined;
    const rawSources = itemIndex[erItemKey(item)]?.dropSources;
    if (!rawSources) return undefined;

    const groups = new Map<string, {
      id: string;
      name: string;
      category: string;
      note: string;
      region: string;
      count: number;
    }>();

    for (const ds of rawSources) {
      const key = `${ds.name}|${ds.category}|${ds.note}|${ds.region || ""}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
      } else {
        groups.set(key, {
          id: ds.id,
          name: localizeErMapText(ds.name),
          category: ds.category,
          // Every drop row carries a chance in practice; the field is optional
          // only because location rows share the row type.
          note: ds.note ?? "",
          region: ds.region ? localizeErMapText(ds.region) : "",
          count: 1,
        });
      }
    }

    return [...groups.values()].map((g) => {
      const displayName = g.count > 1 ? `${g.name} (x${g.count})` : g.name;
      const fullName = g.region ? `${displayName} (${g.region})` : displayName;
      return {
        markerId: g.id,
        name: fullName,
        category: g.category,
        note: g.note,
      };
    });
  }, [itemIndex]);

  // Contextual key coaching for the Elden Ring map. Driven from here because this
  // is the one place that knows the panel's FULL depth — the drilled item and the
  // combat view are this component's own state, and Esc unwinds them before it
  // ever closes the panel.
  useKeyHintTriggers({
    selectedId: markerId,
    canGoBack: combatOpen || drillItemKey != null || parentMarker != null,
  });

  useEffect(() => {
    if (!marker) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Drill first — it's the deepest layer, and it can sit on top of the combat view.
      if (drillItemKey) setDrillItemKey(null);
      else if (combatOpen) setCombatOpen(false);
      else if (parentMarker && onBack) onBack();
      else onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [combatOpen, drillItemKey, marker, onClose, parentMarker, onBack]);

  if (!marker || !display) return null;

  const actions = (
    <ErMapDetailActions
      favorite={favorite}
      found={found}
      onToggleFavorite={onToggleFavorite}
      onToggleFound={onToggleFound}
      onCenter={onCenter}
    />
  );
  const location = [display.marker.region, viewLabel].filter(Boolean).join(" · ");
  // Production bosses keep their CDN portrait (keyed by production marker id);
  // MSB-placed regular enemies fall back to the enemy portrait set (keyed by name).
  const bossImage = display.productionMarkerId
    ? bossImageFor(display.productionMarkerId)
    : isErMapEnemyCategory(marker.category)
      // The portrait set is keyed by the ENGLISH name — a localized copy carries
      // the original along as enName.
      ? enemyImageFor(marker.enName ?? marker.name)
      : null;

  /* Wide desktop: a drilled item opens as its OWN panel beside this one, so the
     build you drilled from stays on screen next to the weapon you are reading.
     Narrow windows and the mobile bottom sheet have nowhere to put a second
     column, so there the drill still replaces this panel's content. */
  const mainIsDrill = !sideBySide && drilledItem != null;
  const mainItem = mainIsDrill ? drilledItem : markerItem;
  const companionItem = sideBySide ? drilledItem : undefined;
  const panelClass = cn(
    "pointer-events-auto max-w-fit flex flex-col overflow-hidden border border-border bg-surface/90 backdrop-blur-xl animate-slide-in",
    isMobile
      // Bottom sheet: dock to the bottom and grow upward, stopping at
      // --sheet-top-gap (index.css) — clear of the title bar AND the map's own
      // toolbar row, the same ceiling the filter sheet uses.
      ? "fixed inset-x-2 bottom-[calc(0.5rem+var(--anchor-ad-height))] z-[1300] max-h-[calc(100dvh-var(--sheet-top-gap)-env(safe-area-inset-top)-var(--anchor-ad-height))] rounded-[var(--radius-lg)]"
      : "max-h-full w-90 max-w-[calc(100vw-1.5rem)] rounded-[var(--radius-lg)]",
  );
  /* Community tips. Keyed off the RAW marker: the tip address is a rewrite of
     this map's own id, not of the localized copy the panel renders. */
  const commentKey = erMapCommentKey(marker);
  const isFightable = isErMapEnemyCategory(marker.category);
  const commentsShown = commentsOpen;
  /* A bottom sheet can only hold one thing, so on a phone the tips take the
     sheet over; everywhere else they open as the companion column beside it. */
  const commentsAsMain = isMobile && commentsShown;
  const commentsAsCompanion = !isMobile && commentsShown;
  const showingCombat = combatOpen && !mainIsDrill && Boolean(display.marker.bossMeta?.combat);
  /* The button belongs to the MARKER, so it goes away while the panel is showing
     something else: a drilled item's tips would be about the wrong thing, and
     the combat page is its own full-height read. */
  const showCommentsButton = !showingCombat && !mainIsDrill;
  const commentsPanel = (
    <MarkerCommentsPanel
      markerKey={commentKey}
      markerName={display.marker.name}
      isBoss={isFightable}
      className={panelClass}
      onClose={() => setCommentsOpen(false)}
    />
  );

  /* Item rows navigate by raw marker id, but they don't all come from the same
     set. "Where to find" / "Dropped by" are fed the er-map item index, so their
     ids are THIS map's (and the view map knows their layer). "How to get" —
     merchant shacks and the remembrance boss — is built from the PRODUCTION
     marker set (data/markers.ts), whose ids (er-wmp-…) don't exist here; those
     go through the build-time production-id bridge, the same translation the
     codex "show on map" jump uses. Without it the click selected an id no
     marker had and the map simply sat there. */
  const navigateFrom = (viewMap: Map<string, string>) =>
    onNavigateToMarker
      ? (targetId: string) => {
          const view = viewMap.get(targetId);
          if (view) {
            onNavigateToMarker(view, targetId, true);
            return;
          }
          const twin = productionIdMap?.[targetId];
          onNavigateToMarker(twin?.view ?? "overworld", twin?.id ?? targetId, true);
        }
      : undefined;

  return (
    <>
      {isMobile && (
        <button
          type="button"
          className="fixed inset-0 z-[1290] cursor-default bg-black/40 animate-fade-in"
          onClick={onClose}
          aria-label={t("detail.closeDetails")}
        />
      )}
      {commentsAsMain ? commentsPanel : (
      <aside
        data-testid="er-map-detail-panel"
        aria-label={t("erMap.markerDetails")}
        className={panelClass}
      >
        {/* On a narrow window a drilled item sits ON TOP of the combat view —
            combatOpen stays true while you inspect a piece of the recommended
            build, so Back returns you to the build page (with its level/style
            intact) instead of the boss page. Side by side, the combat view simply
            never leaves. */}
        {combatOpen && !mainIsDrill && display.marker.bossMeta?.combat ? (
          <CombatTips
            marker={display.marker}
            combat={display.marker.bossMeta.combat}
            onBack={() => setCombatOpen(false)}
            onClose={onClose}
            onSelectItem={toggleDrillItem}
          />
        ) : mainItem ? (
          <DetailItem
            item={mainItem}
            game="elden-ring"
            currentMarkerId={marker.id}
            location={mainIsDrill ? display.marker.name : location}
            onClose={onClose}
            onBack={mainIsDrill ? () => setDrillItemKey(null) : (parentMarker ? onBack : undefined)}
            backLabel={mainIsDrill ? display.marker.name : (parentMarker ? parentMarker.name : undefined)}
            onDrill={toggleDrillItem}
            actions={actions}
            onNavigate={navigateFrom(itemViewMap(mainItem))}
            customLocations={itemLocationsFor(mainItem)}
            customDropSources={itemDropSourcesFor(mainItem)}
          />
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            {parentMarker && onBack && (
              <button
                onClick={onBack}
                className="flex w-full shrink-0 items-center gap-1 px-4 pt-3 text-xs font-medium text-zinc-400 hover:text-white cursor-pointer"
              >
                <ChevronLeft size={15} aria-hidden="true" />
                <span className="truncate">
                  {t("detail.backTo", { label: parentMarker.name })}
                </span>
              </button>
            )}
            <MarkerDetailContent
              marker={contentMarker ?? display.marker}
              category={category}
              layerLabel={viewLabel}
              bossImage={bossImage}
              actions={actions}
              onClose={onClose}
              onDrillItem={toggleDrillItem}
              onOpenCombat={() => setCombatOpen(true)}
              onSelectMarker={
                onNavigateToMarker
                  ? (markerId) => {
                      const view = linkViewById.get(markerId)
                        ?? (dungeonBossLink?.id === markerId ? dungeonBossLink.view : undefined);
                      if (view) onNavigateToMarker(view, markerId, true);
                    }
                  : undefined
              }
              onHighlightClick={(term) => {
                if (term === "Imbued Sword Key" || term === display.imbuedSwordKeyName) {
                  setDrillItemKey("goods:8186");
                } else if (display.connectionTargetView && display.connectionTargetMarkerId && onNavigateToMarker) {
                  // Resolved on the display result (raw fields + the waygate warp
                  // table) — the raw marker is no longer mutated to carry these.
                  onNavigateToMarker(display.connectionTargetView, display.connectionTargetMarkerId, true);
                } else {
                  onCenter?.();
                }
              }}
            />
          </div>
        )}

        {/* Pinned below the scroll area, so it stays reachable however long the
            marker's page runs — a boss with a full combat readout scrolls for
            several screens, and an affordance buried under that is one nobody
            finds. */}
        {showCommentsButton && (
          <MarkerCommentsButton
            markerKey={commentKey}
            open={commentsShown}
            isBoss={isFightable}
            onToggle={() => {
              setDrillItemKey(null);
              setCommentsOpen((open) => !open);
            }}
          />
        )}
      </aside>
      )}

      {/* The companion column, shared by the drilled item and the tips — whichever
          was opened last. It carries no marker actions (favourite / found / centre
          act on the marker, which is still right there in the main panel) and its
          close button dismisses only itself. */}
      {commentsAsCompanion ? commentsPanel : companionItem ? (
        <aside
          data-testid="er-map-item-panel"
          aria-label={companionItem.name}
          className={panelClass}
        >
          <DetailItem
            item={companionItem}
            game="elden-ring"
            currentMarkerId={marker.id}
            location={display.marker.name}
            onClose={() => setDrillItemKey(null)}
            onDrill={toggleDrillItem}
            onNavigate={navigateFrom(itemViewMap(companionItem))}
            customLocations={itemLocationsFor(companionItem)}
            customDropSources={itemDropSourcesFor(companionItem)}
          />
        </aside>
      ) : null}
    </>
  );
};

export default ErMapDetailPanel;
