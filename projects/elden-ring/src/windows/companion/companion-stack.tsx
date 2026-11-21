import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { bossImageFor } from "../../data/boss-images";
import { categoriesByGame } from "../../data/categories";
import { enemyImageFor } from "../../data/enemy-images";
import { erItemByKey } from "../../data/er-items-data";
import { localizeErMapText } from "../../data/er-map-text";
import { layersByGame } from "../../data/maps";
import { localizeRawMarkers } from "../../features/er-map/er-map-localize";
import { erMapDisplayMarker } from "../../features/er-map/er-map-marker-metadata";
import { useErMapEnemyProfile } from "../../features/er-map/er-map-spatial-data";
import CombatTips from "../../features/detail/combat-tips";
import DetailItem from "../../features/detail/detail-item";
import MarkerDetailContent from "../../features/detail/marker-detail-content";
import { companionEnemyById, companionEnemyCategory } from "./companion-enemy-catalog";
import {
  buildMarkerIndex,
  type CompanionStackState,
  type CompanionView,
} from "./companion-nav";

interface CompanionStackProps extends CompanionStackState {
  /** The tab's root — shown when the history is empty. */
  children: ReactNode;
}

/**
 * Renders the top of a tab's history, wiring every cross-link the app's own
 * panels expose: a boss page's drops open the item, an item's "How to get" opens
 * the boss that drops it (or the merchant who sells it), a dungeon's row opens
 * the boss inside — each pushing a page you can walk back out of.
 *
 * The pages are the dashboard's own components, so what you read here is what
 * the map shows. Only the navigation differs: the dashboard flies the map to a
 * marker, the companion has no map, so it opens that marker's page in place.
 */
const CompanionStack = ({ stack, push, pop, reset, children }: CompanionStackProps) => {
  const { t, i18n } = useTranslation();

  // Markers are localized in place (live binding), so the index is rebuilt per
  // language — same reason the boss catalog is.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const markers = useMemo(() => buildMarkerIndex(), [i18n.language]);

  const view = stack[stack.length - 1];
  const below = stack[stack.length - 2];

  /* ── Regular-enemy pages ────────────────────────────────────────────
     An enemy isn't in the bundled marker set, so its page is assembled the way
     the map assembles it: the streamed record, plus the NpcParam profile its
     combat intel comes from, run through the map's own display-marker builder.
     What comes out IS a Marker, so the page below is the same component every
     boss uses — nothing about this reads as a second kind of page.

     Hooks can't be conditional, so this resolves for every view and simply
     answers null for the ones that aren't an enemy. */
  const enemyId =
    view && (view.kind === "enemy" || view.kind === "enemy-combat") ? view.enemyId : null;
  const enemyRaw = enemyId ? companionEnemyById(enemyId) : null;
  const enemyProfile = useErMapEnemyProfile(enemyRaw?.npcParamId);
  const enemyPage = useMemo(() => {
    if (!enemyRaw) return null;
    const [localized] = localizeRawMarkers([enemyRaw], t);
    const category = companionEnemyCategory(
      localized.category,
      t(`category.${localized.category}`, { defaultValue: localized.category }),
    );
    return {
      marker: erMapDisplayMarker(localized, enemyProfile, category, t).marker,
      category,
      // Portraits are keyed by the ENGLISH name — enName is what localization
      // leaves behind for exactly this.
      portrait: enemyImageFor(localized.enName ?? localized.name),
    };
  }, [enemyProfile, enemyRaw, t]);

  /* ── Scroll memory ──────────────────────────────────────────────────
     Going FORWARD must start at the top: you followed a link to discover a
     page, and landing halfway down it (wherever the previous page happened to
     be scrolled) hides its identity header and reads as a glitch. Going BACK
     must land exactly where you left — the row you tapped should still be under
     the cursor.

     The scroll container is the companion window's page column, found by
     walking up from this subtree so the tabs don't have to thread a ref down.
     Positions are keyed by DEPTH: a stack only ever returns to a depth it left,
     so that's a stable identity without serialising the views. */
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const positions = useRef(new Map<number, number>());
  const liveScroll = useRef(0);
  const depth = stack.length;
  const viewKey = view
    ? `${view.kind}:${"markerId" in view ? view.markerId : "itemKey" in view ? view.itemKey : view.enemyId}`
    : "";
  const lastDepth = useRef(depth);
  const lastKey = useRef(viewKey);

  const scrollElement = useCallback(
    (): HTMLElement | null =>
      anchorRef.current?.closest<HTMLElement>("[data-companion-scroll]") ?? null,
    [],
  );

  useEffect(() => {
    const element = scrollElement();
    if (!element) return;
    // The container is shared with the other tab, which may have left it
    // scrolled — this instance starts at its own top.
    element.scrollTop = 0;
    const onScroll = () => {
      liveScroll.current = element.scrollTop;
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [scrollElement]);

  useLayoutEffect(() => {
    const element = scrollElement();
    if (element) {
      if (depth < lastDepth.current) {
        const target = positions.current.get(depth) ?? 0;
        element.scrollTop = target;
        // A page that isn't fully laid out yet (a boss portrait still decoding)
        // is SHORTER than it will be, so the browser clamps the restore. Try
        // once more next frame — but only while it's still short of the target,
        // so a user who has already scrolled is never yanked back.
        if (element.scrollTop < target) {
          requestAnimationFrame(() => {
            if (element.scrollTop < target) element.scrollTop = target;
          });
        }
      } else if (depth > lastDepth.current || viewKey !== lastKey.current) {
        // Remember where the outgoing page stood before replacing it. The live
        // value is read from the scroll listener, not from the element: by the
        // time this runs the new content has already been laid out and the
        // element's own scrollTop may have been clamped.
        positions.current.set(lastDepth.current, liveScroll.current);
        element.scrollTop = 0;
      }
      liveScroll.current = element.scrollTop;
    }
    lastDepth.current = depth;
    lastKey.current = viewKey;
  }, [depth, viewKey, scrollElement]);

  // Esc walks back one page (and does nothing at the root, where the search box
  // owns the key). The window itself is never closed by Esc — losing a companion
  // you deliberately opened would be a nasty surprise mid-fight.
  useEffect(() => {
    if (!view) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      pop();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, pop]);

  const titleOf = useCallback(
    (entry: CompanionView): string => {
      if (entry.kind === "item") return erItemByKey.get(entry.itemKey)?.name ?? "";
      if (entry.kind === "build") return t("detail.bossBuild");
      // An enemy's expanded page is combat intel only — it has no Build tab, so
      // it must not name itself after one.
      if (entry.kind === "enemy-combat") return t("detail.combatIntel");
      // Resolved from the catalog rather than the page above, so an enemy still
      // names itself while it's the page BELOW (an item drilled out of it).
      if (entry.kind === "enemy") {
        const raw = companionEnemyById(entry.enemyId);
        return raw ? localizeErMapText(raw.name) : "";
      }
      return markers.get(entry.markerId)?.name ?? "";
    },
    [markers, t],
  );

  const openMarker = useCallback(
    (markerId: string) => {
      // Ignore a target this window can't render rather than pushing a blank
      // page — a dead click is better than a dead end.
      if (markers.has(markerId)) push({ kind: "marker", markerId });
    },
    [markers, push],
  );
  const openItem = useCallback(
    (itemKey: string) => {
      if (erItemByKey.has(itemKey)) push({ kind: "item", itemKey });
    },
    [push],
  );

  const backLabel = below ? titleOf(below) : undefined;
  /* "Show on map" is the dashboard's promise; here the same click opens the
     target's page in this window. */
  const navigateTitle = t("companion.openPage");

  const layerLabelFor = (layer: string) =>
    t(`layer.${layer}`, {
      defaultValue:
        layersByGame["elden-ring"].find((entry) => entry.key === layer)?.label ?? layer,
    });

  /* MarkerDetailContent has no back affordance of its own (the dashboard panel
     owns that), so the companion supplies one — but only when there IS somewhere
     to go back to. At the root of the history the header's X returns to the list
     instead. Same markup as the panels' own back rows (data-detail-back), so all
     three line up identically. */
  const backRow = below ? (
    <button
      data-detail-back
      onClick={pop}
      className="flex w-full items-center gap-1 px-4 pt-3 text-xs font-medium text-zinc-400 hover:text-white cursor-pointer"
    >
      <ChevronLeft size={15} aria-hidden="true" />
      <span className="truncate">{t("detail.backTo", { label: backLabel })}</span>
    </button>
  ) : null;

  const page = (): ReactNode => {
    if (!view) return children;

    if (view.kind === "item") {
      const item = erItemByKey.get(view.itemKey);
      if (!item) return children;
      return (
        <DetailItem
          item={item}
          game="elden-ring"
          onClose={reset}
          onBack={below ? pop : undefined}
          backLabel={backLabel}
          onNavigate={openMarker}
          navigateTitle={navigateTitle}
          onDrill={openItem}
          // Hide the pin you came FROM in "where to find" — it's the page below.
          currentMarkerId={below?.kind === "marker" ? below.markerId : undefined}
        />
      );
    }

    if (view.kind === "enemy" || view.kind === "enemy-combat") {
      // The catalog is loaded (the page was opened from it) but the profile
      // arrives a tick later; falling back to the list beats a half-built page.
      if (!enemyPage) return children;
      const enemy = enemyPage.marker;
      const combat = enemy.bossMeta?.combat;

      if (view.kind === "enemy-combat") {
        if (!combat) return children;
        return (
          <CombatTips
            key={`${i18n.language}-${enemy.id}`}
            marker={enemy}
            combat={combat}
            onBack={pop}
            onClose={reset}
            onSelectItem={openItem}
          />
        );
      }

      return (
        <>
          {backRow}
          <MarkerDetailContent
            marker={enemy}
            category={enemyPage.category}
            layerLabel={layerLabelFor(enemy.layer)}
            bossImage={enemyPage.portrait}
            actions={null}
            onClose={reset}
            onDrillItem={openItem}
            onOpenCombat={() => push({ kind: "enemy-combat", enemyId: enemy.id })}
            onSelectMarker={openMarker}
          />
        </>
      );
    }

    const marker = markers.get(view.markerId);
    if (!marker) return children;

    if (view.kind === "build") {
      const combat = marker.bossMeta?.combat;
      if (!combat) return children;
      return (
        <CombatTips
          key={`${i18n.language}-${marker.id}`}
          marker={marker}
          combat={combat}
          onBack={pop}
          onClose={reset}
          onSelectItem={openItem}
        />
      );
    }

    const base = categoriesByGame["elden-ring"].find((entry) => entry.key === marker.category);
    const category = base
      ? { ...base, label: t(`category.${base.key}`, { defaultValue: base.label }) }
      : undefined;

    return (
      <>
        {backRow}
        <MarkerDetailContent
          marker={marker}
          category={category}
          layerLabel={layerLabelFor(marker.layer)}
          bossImage={bossImageFor(marker.id)}
          // No action row: found/favorite/center are map actions, and the
          // companion has no map to center on.
          actions={null}
          onClose={reset}
          onDrillItem={openItem}
          onOpenCombat={() => push({ kind: "build", markerId: marker.id })}
          onSelectMarker={openMarker}
        />
      </>
    );
  };

  // The wrapper is the anchor the scroll effects walk up from; `display: contents`
  // keeps it out of layout entirely, so the pages lay out exactly as they would
  // as direct children of the scroll column.
  return (
    <div ref={anchorRef} className="contents">
      {page()}
    </div>
  );
};

export default CompanionStack;
