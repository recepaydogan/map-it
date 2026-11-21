import { Check, CheckCircle2, Crosshair, Navigation, Pencil, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NR_BOSS_CATEGORIES, bossImageFor, nrBossImageFor } from "../../data/boss-images";
import { erItemByKey } from "../../data/er-items-data";
import { markersByGame } from "../../data/markers";
import { cn } from "../../lib/cn";
import { useMapStore } from "../../store/map-store";
import { useIsMobile, useMediaQuery } from "../../utils/platform";
import { MarkerCommentsButton, MarkerCommentsPanel, productionCommentKey } from "../comments";
import { useCustomMarkerUi } from "../custom-markers/custom-marker-ui";
import { useMapExperience } from "../map-experience/map-experience";
import CombatTips from "./combat-tips";
import DetailItem from "./detail-item";
import MarkerDetailContent from "./marker-detail-content";

/**
 * Slide-in marker detail. Sections are driven by which fields the marker has
 * (spec Section 9.1): description, stats, drops, shop, contents. One generic
 * panel, not one per marker type.
 */
const DetailPanel = () => {
  const {
    selectedMarker,
    categoryById,
    layers,
    game,
    select,
    pushSelect,
    goBack,
    parentMarker,
    focusSelected,
    drillItemKey: drillKey,
    setDrillItemKey: setDrillKey,
    combatTipsOpen,
    setCombatTipsOpen,
  } = useMapExperience();
  const foundMarkers = useMapStore((s) => s.foundMarkers);
  const toggleFound = useMapStore((s) => s.toggleFound);
  const bookmarks = useMapStore((s) => s.bookmarks);
  const toggleBookmark = useMapStore((s) => s.toggleBookmark);
  const editMode = useMapStore((s) => s.editMode);
  const toggleMarkerDeletion = useMapStore((s) => s.toggleMarkerDeletion);
  const removeCustomMarker = useMapStore((s) => s.removeCustomMarker);
  const beginEditCustom = useCustomMarkerUi((s) => s.beginEdit);
  const isMobile = useIsMobile();
  /* Wide enough for a second 360px column beside this one (see the ER Map panel
     for the arithmetic) — below that, a drill keeps replacing the panel body. */
  const sideBySide = useMediaQuery("(min-width: 1180px)") && !isMobile;
  const { t } = useTranslation();
  /* Deliberately NOT reset when the marker changes: the tips column is an
     inspector the reader opened on purpose, and snapping it shut on every
     click-through would make it feel like it fell over. */
  const [commentsOpen, setCommentsOpen] = useState(false);

  // Drill-down: a loot row clicked inside a boss/dungeon panel shows that item's
  // detail IN PLACE (no map jump). drillId lives in context so ESC can unwind it.

  if (!selectedMarker) return null;

  const def = categoryById.get(selectedMarker.category);
  const layerLabel =
    layers.find((l) => l.key === selectedMarker.layer)?.label ?? selectedMarker.layer;

  // ER item markers carry an itemKey (unique group:id) → show the item's real icon
  // + full game data. Resolve via the key, never the bare id (ids collide).
  const item = selectedMarker.itemKey
    ? erItemByKey.get(selectedMarker.itemKey)
    : undefined;
  const location = [selectedMarker.region, layerLabel].filter(Boolean).join(" · ");

  // The drilled loot (every drop's itemKey resolves here — built from this DB).
  const drillItem = drillKey != null ? erItemByKey.get(drillKey) : undefined;
  /* Clicking the row that is already open closes it again — with the item beside
     the list instead of replacing it, the row reads as a toggle. Drilling also
     puts the tips away: there is ONE companion column, and three panels beside
     the filter rail would leave no map to look at. */
  const toggleDrill = (key: string) => {
    setCommentsOpen(false);
    setDrillKey(drillKey === key ? null : key);
  };

  // A drilled loot is always a drop of the current marker, so it's obtained HERE.
  // Only offer "Navigate to this loot" when the item also has a pin right at this
  // spot — the thing you'd grab on the ground (e.g. a church's nearby Golden Seed).
  // We must NOT jump to a far-away same-item pin: a boss drop's standalone pin is a
  // DIFFERENT instance (e.g. 3 Magma Wyrms all drop the Scalesword, but its only
  // map pin is at a fourth spot — sending you across the map is wrong). That far
  // pin still shows, region-labelled, in the drilled item's "Where to find".
  const LOCAL_PIN = 150; // nominal units (~same area)
  const drillTarget = (() => {
    if (drillKey == null) return undefined;
    let best: (typeof markersByGame)[typeof game][number] | undefined;
    let bd = Infinity;
    for (const m of markersByGame[game]) {
      if (m.itemKey !== drillKey || m.id === selectedMarker.id) continue;
      const d = Math.hypot(m.pixel.x - selectedMarker.pixel.x, m.pixel.y - selectedMarker.pixel.y);
      if (d < bd) { bd = d; best = m; }
    }
    return best && bd <= LOCAL_PIN ? best : undefined;
  })();
  const navigateToLoot = () => {
    if (drillTarget) pushSelect(drillTarget.id); // push so Back returns to this boss/dungeon
  };
  // Every boss/miniboss marker carries a portrait screenshot. ER keys by
  // marker id, NR by raw marker name — both locale-proof (see boss-images.ts).
  const bossImage =
    selectedMarker.category === "boss" || selectedMarker.category === "miniboss"
      ? bossImageFor(selectedMarker.id)
      : NR_BOSS_CATEGORIES.has(selectedMarker.category)
        ? nrBossImageFor(selectedMarker.name)
        : null;
  // The action row — Mark as found + favorite + icon-only Center on map — is the ONLY
  // place the Center action ever lives (never a footer button). It shows on every detail
  // view in BOTH games: marker, item, AND drilled loot. NR tracks found/favorite by marker
  // id just like ER, so the click dialog is identical across games.
  const isMarked = bookmarks.has(selectedMarker.id);
  const isFound = foundMarkers.has(selectedMarker.id);
  const trackActions = (
      <div className="flex items-stretch gap-2 px-4 pb-3 pt-0.5">
        <button
          onClick={() => toggleFound(selectedMarker.id)}
          aria-pressed={isFound}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-[12.5px] font-semibold transition-all cursor-pointer active:scale-[0.98]",
            isFound
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20"
              : "border-border bg-white/[0.03] text-zinc-300 hover:border-emerald-500/40 hover:bg-emerald-500/[0.06] hover:text-white",
          )}
        >
          {isFound ? (
            <CheckCircle2 size={15} aria-hidden="true" />
          ) : (
            <Check size={15} className="opacity-70" aria-hidden="true" />
          )}
          {isFound ? t("detail.found") : t("detail.markAsFound")}
        </button>
        <button
          onClick={() => toggleBookmark(selectedMarker.id)}
          aria-pressed={isMarked}
          aria-label={isMarked ? t("detail.removeFromFavorites") : t("detail.addToFavorites")}
          title={isMarked ? t("detail.removeFromFavorites") : t("detail.addToFavorites")}
          className={cn(
            "group/fav grid w-11 shrink-0 place-items-center rounded-[var(--radius-md)] border transition-all cursor-pointer active:scale-95",
            isMarked
              ? "border-amber-400/50 bg-amber-400/15 text-amber-300 hover:bg-amber-400/20"
              : "border-border bg-white/[0.03] text-zinc-400 hover:border-amber-400/40 hover:text-amber-300",
          )}
        >
          <Star
            size={16}
            fill={isMarked ? "currentColor" : "none"}
            className="transition-transform group-hover/fav:scale-110"
            aria-hidden="true"
          />
        </button>
        <button
          onClick={focusSelected}
          aria-label={t("detail.centerOnMap")}
          title={t("detail.centerOnMap")}
          className="grid w-11 shrink-0 place-items-center rounded-[var(--radius-md)] border border-border bg-white/[0.03] text-zinc-300 transition-all hover:border-accent/50 hover:bg-accent/[0.08] hover:text-white cursor-pointer active:scale-95"
        >
          <Crosshair size={16} aria-hidden="true" />
        </button>
      </div>
    );

  // Custom (user) markers get their own action row in place of found/favorite: Edit
  // opens the create dialog pre-filled, Delete removes it, Center flies the camera.
  // Works in both games, so a custom NR marker is editable too.
  const customActions = selectedMarker.custom ? (
    <div className="flex items-stretch gap-2 px-4 pb-3 pt-0.5">
      <button
        onClick={() => beginEditCustom(selectedMarker.id)}
        className="flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-border bg-white/[0.03] px-3 py-2 text-[12.5px] font-semibold text-zinc-300 transition-all hover:border-accent/50 hover:bg-accent/[0.08] hover:text-white cursor-pointer active:scale-[0.98]"
      >
        <Pencil size={15} aria-hidden="true" /> {t("detail.edit")}
      </button>
      <button
        onClick={() => {
          if (editMode) toggleMarkerDeletion(selectedMarker.id);
          else removeCustomMarker(selectedMarker.id);
          select(null);
        }}
        aria-label={t("detail.deleteMarker")}
        title={t("detail.deleteMarker")}
        className="grid w-11 shrink-0 place-items-center rounded-[var(--radius-md)] border border-border bg-white/[0.03] text-zinc-400 transition-all hover:border-rose-500/50 hover:bg-rose-500/[0.1] hover:text-rose-300 cursor-pointer active:scale-95"
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
      <button
        onClick={focusSelected}
        aria-label={t("detail.centerOnMap")}
        title={t("detail.centerOnMap")}
        className="grid w-11 shrink-0 place-items-center rounded-[var(--radius-md)] border border-border bg-white/[0.03] text-zinc-300 transition-all hover:border-accent/50 hover:bg-accent/[0.08] hover:text-white cursor-pointer active:scale-95"
      >
        <Crosshair size={16} aria-hidden="true" />
      </button>
    </div>
  ) : null;

  // Footer only for drilled loot that also has its own pin (Navigate to this loot — a
  // different action than Center). Every marker now carries the action row (with Center),
  // in both games, so the footer is never just a Center button.
  const showNavigate = Boolean(drillItem && drillTarget);
  const showFooter = showNavigate && !selectedMarker.custom;

  /* Wide desktop: the drilled item opens as its own column beside this panel, so
     the boss (or its build page) stays readable next to the item you drilled into.
     Narrow windows and the mobile sheet keep the in-place drill. */
  const companionItem = sideBySide ? drillItem : undefined;
  const mainIsDrill = !sideBySide && drillItem != null;
  const panelClass = cn(
    "pointer-events-auto flex flex-col overflow-hidden border border-border bg-surface/90 backdrop-blur-xl animate-slide-in",
    // Mobile: break out of the filter-rail row into a full-width overlay so
    // the collapsed rail beside it can't shove the panel off-screen (the cut
    // off buttons). The body scrolls internally and the height is capped to the
    // viewport, so a tall boss page never overflows the screen — it scrolls.
    // Desktop/Overwolf keep the docked 360px slide-in.
    isMobile
      // Bottom sheet: dock to the bottom and grow upward, stopping at
      // --sheet-top-gap (index.css) — clear of the title bar AND the map's own
      // toolbar row, the same ceiling every other phone sheet uses.
      ? "fixed inset-x-2 bottom-[calc(0.5rem+var(--anchor-ad-height))] z-[1300] max-h-[calc(100dvh-var(--sheet-top-gap)-env(safe-area-inset-top)-var(--anchor-ad-height))] rounded-[var(--radius-lg)]"
      : "max-h-full w-90 max-w-[calc(100vw-1.5rem)] rounded-[var(--radius-lg)]",
  );
  /* Community tips, as their own column beside this one. */
  const commentKey = productionCommentKey(selectedMarker);
  const isBoss = bossImage !== null;
  const commentsShown = commentsOpen;
  /* A bottom sheet can only hold one thing, so on a phone the tips take the
     sheet over; everywhere else they open as the companion column beside it. */
  const commentsAsMain = isMobile && commentsShown;
  const commentsAsCompanion = !isMobile && commentsShown;
  const showingCombat = combatTipsOpen && !mainIsDrill && Boolean(selectedMarker.bossMeta?.combat);
  /* The button belongs to the MARKER, so it goes away while the panel is showing
     something else: a drilled item's tips would be about the wrong thing, and
     the combat page is its own full-height read. */
  const showCommentsButton = !showingCombat && !mainIsDrill;
  const commentsPanel = (
    <MarkerCommentsPanel
      markerKey={commentKey}
      markerName={selectedMarker.name}
      isBoss={isBoss}
      className={panelClass}
      onClose={() => setCommentsOpen(false)}
    />
  );

  const navigateFooter = (
    <footer className="flex shrink-0 gap-2 border-t border-border p-3">
      <button
        onClick={navigateToLoot}
        className="flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-accent px-3 py-2 text-[13px] font-semibold text-on-accent transition-colors hover:bg-accent/90 cursor-pointer"
      >
        <Navigation size={15} aria-hidden="true" />
        {t("detail.navigateToThisLoot")}
      </button>
    </footer>
  );

  return (
    <>
    {/* Mobile: a tap-to-dismiss scrim behind the sheet. The panel's close (X) lives in
        the scrollable header, so on a tall boss page it scrolls out of reach — and a phone
        has no ESC. The scrim gives a reliable one-tap close (standard bottom-sheet UX) and
        focuses attention on the sheet. Desktop/Overwolf (isMobile === false) never render it. */}
    {isMobile && (
      <div
        className="fixed inset-0 z-[1290] bg-black/40 animate-fade-in"
        onClick={() => select(null)}
        aria-hidden="true"
      />
    )}
    {commentsAsMain ? commentsPanel : (
    <div className={panelClass}>
      {/* Each branch lays itself out: a fixed header (outside the scroll area, so the
          scrollbar only runs alongside the body) + one scrollable body below it. */}
      {/* On a narrow window a drilled item sits ON TOP of the combat view —
          combatTipsOpen stays true while you inspect a piece of the recommended
          build, so Back returns you to the build page (with its level/style intact)
          instead of the boss page. Side by side, the build page never leaves. */}
      {combatTipsOpen && !mainIsDrill && selectedMarker.bossMeta?.combat ? (
          <CombatTips
            marker={selectedMarker}
            combat={selectedMarker.bossMeta.combat}
            onBack={goBack}
            onClose={() => select(null)}
            onSelectItem={toggleDrill}
          />
        ) : mainIsDrill && drillItem ? (
          // A drilled item (a boss/cookbook sub-item) takes priority over the marker's own
          // item view so drilling from an item page — e.g. a cookbook's taught recipe — works.
          <DetailItem
            item={drillItem}
            game={game}
            location={selectedMarker.name}
            onClose={() => select(null)}
            onBack={goBack}
            backLabel={item?.name ?? selectedMarker.name}
            onNavigate={pushSelect}
            onDrill={toggleDrill}
            actions={trackActions}
          />
        ) : item ? (
          <DetailItem
            item={item}
            game={game}
            location={location}
            onClose={() => select(null)}
            onBack={parentMarker ? goBack : undefined}
            backLabel={parentMarker?.name}
            onNavigate={pushSelect}
            onDrill={toggleDrill}
            currentMarkerId={selectedMarker.id}
            actions={trackActions}
          />
        ) : (
          <MarkerDetailContent
            marker={selectedMarker}
            category={def}
            layerLabel={layerLabel}
            bossImage={bossImage}
            actions={selectedMarker.custom ? customActions : trackActions}
            onClose={() => select(null)}
            onDrillItem={toggleDrill}
            onOpenCombat={() => setCombatTipsOpen(true)}
            onSelectMarker={pushSelect}
          />
        )}

      {/* Footer only for drilled loot that also has its own pin (Navigate to this loot — a
          different action than Center). It belongs to the drilled item, so side by
          side it moves to the companion column with it. */}
      {showFooter && mainIsDrill && navigateFooter}

      {/* Pinned below the scroll area, so it stays reachable however long the
          marker's page runs — a boss with a full combat readout scrolls for
          several screens, and an affordance buried under that is one nobody
          finds. */}
      {showCommentsButton && (
        <MarkerCommentsButton
          markerKey={commentKey}
          open={commentsShown}
          isBoss={isBoss}
          onToggle={() => {
            setDrillKey(null);
            setCommentsOpen((open) => !open);
          }}
        />
      )}
    </div>
    )}

    {/* The companion column, shared by the drilled item and the tips — whichever
        was opened last. Its close button dismisses only itself, and Esc does the
        same. */}
    {commentsAsCompanion ? commentsPanel : companionItem ? (
      <div className={panelClass} data-testid="detail-item-panel">
        <DetailItem
          item={companionItem}
          game={game}
          location={selectedMarker.name}
          onClose={() => setDrillKey(null)}
          onNavigate={pushSelect}
          onDrill={toggleDrill}
        />
        {showFooter && navigateFooter}
      </div>
    ) : null}
    </>
  );
};

export default DetailPanel;
