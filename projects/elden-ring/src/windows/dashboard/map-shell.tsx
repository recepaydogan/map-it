import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { PORTAL_ROOT_ID } from "../../lib/portal";
import { useIsMobile } from "../../utils/platform";
import { useUiStore } from "../../store/ui-store";
import ArchiveOverlay from "../../features/codex/archive-overlay";
import ClassBrowser from "../../features/codex/class-browser";
import DialogueArchive from "../../features/codex/dialogue-archive";
import AddMarkerButton from "../../features/custom-markers/add-marker-button";
import CustomMarkerDialog from "../../features/custom-markers/custom-marker-dialog";
import NightfarerOverlay from "../../features/nightreign/nightfarer-overlay";
import NightlordOverlay from "../../features/nightreign/nightlord-overlay";
import RelicBrowser from "../../features/nightreign/relic-browser";
import GuideOverlay from "../../features/guide/guide-overlay";
import DetailPanel from "../../features/detail/detail-panel";
import FilterRail from "../../features/filters/filter-rail";
import MapView from "../../features/map/map-view";
import WorldSwitcher from "../../features/map/world-switcher";
import SeedBar from "../../features/nightreign/seed-bar";
import PatternFavorites from "../../features/nightreign/pattern-favorites";
import NightlordPanel from "../../features/nightreign/nightlord-panel";
import SearchBox from "../../features/search/search-box";
import SettingsOverlay from "../../features/settings/settings-overlay";
import SupportPage from "../../features/support/support-page";
import NotesAdminOverlay from "../../features/comments/admin/notes-admin-overlay";
import AccountOverlay from "../../features/account/account-overlay";
import ErMap from "../../features/er-map/er-map";
import KeyHintLayer from "../../features/hints/key-hint-layer";
import { useKeyHints } from "../../features/hints/use-key-hints";
import { useMapExperience } from "../../features/map-experience/map-experience";

/**
 * The three-zone shell. The map is full-bleed; filters, detail and search all
 * float over it as edge-docked overlays so the map never loses surface. All
 * overlay layers use pointer-events-none containers with interactive children,
 * so map drag/zoom keeps working in the gaps between panels.
 */
/** Above this many pins on screen at once, rendering gets heavy enough that we
 * nudge the player to narrow the view with filters. */
const MARKER_WARN_THRESHOLD = 1000;

const MapShell = () => {
  const { t } = useTranslation();
  const { game, visibleMarkers, select } = useMapExperience();
  const isMobile = useIsMobile();

  // Performance nudge when a huge number of pins is on screen. Dismissible; it
  // re-arms once the count drops back under the threshold and climbs again. The
  // re-arm is a render-phase state adjustment (React's documented pattern) keyed
  // off the threshold crossing, so it needs no effect.
  const markerCount = visibleMarkers.length;
  const overThreshold = markerCount > MARKER_WARN_THRESHOLD;
  const [warnDismissed, setWarnDismissed] = useState(false);
  const [wasOverThreshold, setWasOverThreshold] = useState(overThreshold);
  if (overThreshold !== wasOverThreshold) {
    setWasOverThreshold(overThreshold);
    if (!overThreshold) setWarnDismissed(false);
  }
  // Hold the nudge back for the first minute after the app opens, so a fresh
  // session isn't greeted by a performance warning before the player has even
  // had a chance to look around.
  const [warnDelayElapsed, setWarnDelayElapsed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setWarnDelayElapsed(true), 60_000);
    return () => clearTimeout(id);
  }, []);

  const keyHintShowing = useKeyHints((s) => s.current !== null);

  // The full-window surface (Archive, Loadout, …) is driven from the header tab bar via the
  // ui-store, so navigation lives in one place. `null` = the live map is showing.
  const activeOverlay = useUiStore((s) => s.activeOverlay);
  const databaseGame = useUiStore((s) => s.databaseGame);
  const closeOverlay = useUiStore((s) => s.closeOverlay);
  const codexItemKey = useUiStore((s) => s.codexItemKey);
  const clearCodexIntent = useUiStore((s) => s.clearCodexIntent);
  const nightfarerName = useUiStore((s) => s.nightfarerName);
  const clearNightfarerIntent = useUiStore((s) => s.clearNightfarerIntent);
  const mapMarkerId = useUiStore((s) => s.mapMarkerId);
  const clearMapMarker = useUiStore((s) => s.clearMapMarker);

  // Codex "show on map" jump: openMapMarker already cleared the overlay, so just select the
  // marker, fly the camera, and drop the stale codex intent. Elden Ring's map surface is the
  // (former test) map component, which consumes the intent itself — production ids are
  // translated there via the build-time production-id bridge — so only Nightreign's live
  // map handles it here.
  useEffect(() => {
    if (!mapMarkerId || game === "elden-ring") return;
    clearCodexIntent();
    select(mapMarkerId);
    clearMapMarker();
  }, [mapMarkerId, game, select, clearCodexIntent, clearMapMarker]);

  return (
    <div data-game={game} className="relative h-full w-full overflow-hidden">
      {/* Dropdowns/popovers mount here — inside the non-ads region. Kept OUTSIDE the
          map layer below so an open overlay's own dropdowns still render while the map
          is hidden. */}
      <div id={PORTAL_ROOT_ID} className="contents" />

      {/* The map layer. A full-window surface (Archive, Settings, …) is a real
          page, not a scrim over the map — so while one is open we take the whole map
          layer out of the render tree with `hidden` (display:none): nothing behind the
          surface is painted or composited, which is the cost you felt. The map is NEVER
          unmounted — that would remount Leaflet (black map + lost camera). display:none
          preserves its tile + camera state, and showing it back is a no-op resize.

          Elden Ring's map IS the game-data map (the former ER map, promoted
          2026-07-16): its own tiles, filter rail, detail panel, search and view
          switcher. The Leaflet live-map block below serves NIGHTREIGN ONLY and is
          untouched — the NR experience (patterns, seeds, POIs) stays exactly as-is. */}
      {game === "elden-ring" && (
        <div className={cn("relative h-full w-full", activeOverlay !== null && "hidden")}>
          <ErMap />
          <KeyHintLayer />
        </div>
      )}
      {game !== "elden-ring" && (
      <div className={cn("relative h-full w-full", activeOverlay !== null && "hidden")}>
        <MapView />
        <KeyHintLayer />

      {/* Floating UI column. The header controls sit ABOVE the filter/detail
          panels in one flex column, so however many rows the controls wrap into
          (the Nightreign seed bar can push to a second row on a narrow window),
          the panels flow below them — the two layers never overlap. Previously
          they were independent absolute bands (header `top-3`, panels a fixed
          `top-16`), so a wrapped header dropped on top of the filter rail.
          The map stays full-bleed: the column is pointer-events-none and only
          its pills/panels capture the pointer, so drag/zoom works in the gaps. */}
      {/* z-1250: the filter rail / panels must paint ABOVE the bottom-centre
          performance warning (z-1200) when they overlap it. */}
      <div className="pointer-events-none absolute inset-x-3 top-[max(0.75rem,var(--app-window-drag-height,0px))] bottom-[calc(0.75rem+var(--anchor-ad-height))] z-[1250] flex flex-col items-start gap-3 max-sm:left-[max(0.75rem,env(safe-area-inset-left))] max-sm:right-[max(0.75rem,env(safe-area-inset-right))]">
        {/* Row 1 — controls. World switcher (+ NR seed bar) leads from the
            top-left; codex/search/settings pinned right. `w-full` so the
            justify-between still spans the map even though the column shrinks
            its rows to content width (needed for row 2 below).

            Nightreign carries more here than Elden Ring does — the seed bar and
            the pattern-favourites pill on top of the shared controls — so on a
            phone this row genuinely cannot hold one line and is allowed to wrap.
            The action cluster keeps `ml-auto`, so when it does wrap it lands
            right-aligned on its own line rather than adrift mid-row. */}
        <div className="flex w-full flex-wrap items-start justify-between gap-1.5 sm:gap-3">
          {/* Left cluster is a COLUMN: the switcher (+ seed bar), then whatever
              the phone layout parks under it. The filter trigger goes there so it
              sits beneath the switcher no matter how the rest of the row wraps —
              left in the row below, it drifted down behind the wrapped actions.

              `flex-1 min-w-0` is what keeps the ACTION cluster pinned top-right:
              as a content-width item this column would push the actions onto a
              wrapped line — and since the column is two rows tall, that line
              started below the filter, stranding the actions halfway down the
              map. Letting the column shrink instead means the seed bar wraps
              inside it while the actions stay on the first line. */}
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
            {/* Phone: the seed bar LEADS. The Nightlord and Find pattern are what
                you reach for during a run, so they take the top line and the game
                switcher sits beneath them; desktop keeps both on one line with the
                switcher first. */}
            {isMobile && game === "nightreign" && (
              <div className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-1.5">
                <SeedBar />
              </div>
            )}
            <div className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
              <WorldSwitcher />
              {!isMobile && game === "nightreign" && <SeedBar />}
            </div>
            {isMobile && <FilterRail />}
          </div>
          <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {game === "nightreign" && <PatternFavorites />}
            <AddMarkerButton />
            <SearchBox />
          </div>
        </div>

        {/* Row 2 — filter rail + slide-in detail panel. Not `w-full`: it stays
            content-width so [data-left-overlay]'s right edge tracks the panels
            (FlyToSelected lands markers just beside the open detail panel). */}
        <div data-left-overlay className="flex min-h-0 flex-1 items-start gap-3">
          {!isMobile && <FilterRail />}
          <DetailPanel />
          <NightlordPanel />
        </div>
      </div>

      {/* Performance nudge: too many pins on screen at once. Sits bottom-centre over
          the live map only (a full-window surface hides it), and never blocks map
          drag/zoom — only the pill itself captures the pointer. */}
      {markerCount > MARKER_WARN_THRESHOLD && warnDelayElapsed && !warnDismissed && activeOverlay === null && (
        <div className={cn(
          "pointer-events-none absolute inset-x-0 z-[1200] flex justify-center px-4 transition-all duration-300",
          // Both nudges dock bottom-centre; the key hint is transient, so the
          // warning steps up out of its way for the few seconds it's on screen.
          keyHintShowing ? "bottom-[5.25rem]" : "bottom-4",
        )}>
          <div className="pointer-events-auto flex max-w-[calc(100%-1rem)] items-center gap-2.5 rounded-[var(--radius-lg)] border border-amber-400/40 bg-surface/95 px-3.5 py-2 shadow-2xl backdrop-blur-xl">
            <TriangleAlert size={16} className="shrink-0 text-amber-400" aria-hidden="true" />
            <p className="min-w-0 truncate text-xs text-zinc-200">
              {t("chrome.markerWarning", { count: markerCount })}
            </p>
            <button
              onClick={() => setWarnDismissed(true)}
              aria-label={t("tracking.close")}
              className="-mr-1 shrink-0 rounded-[var(--radius-md)] p-1 text-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      </div>
      )}

      {/* Full-window surfaces — driven by the active tab ALONE (not the game), so the
          Archive and the Nightreign browsers are reachable from either game (their data
          is always loaded). The header tab bar stays visible above these (it lives in
          the window title bar), so they read as tabbed content rather than modal popups. */}
      {activeOverlay === "codex" && (
        <ArchiveOverlay
          key={`${databaseGame ?? "map-game"}:${codexItemKey ?? "browse"}`}
          initialItemKey={codexItemKey}
          initialGame={databaseGame}
          onClose={() => {
            closeOverlay();
            clearCodexIntent();
          }}
        />
      )}
      {activeOverlay === "nightfarers" && (
        <NightfarerOverlay
          initialName={nightfarerName}
          onClose={() => {
            closeOverlay();
            clearNightfarerIntent();
          }}
        />
      )}
      {activeOverlay === "classes" && <ClassBrowser onClose={closeOverlay} />}
      {activeOverlay === "dialogue" && <DialogueArchive onClose={closeOverlay} />}
      {activeOverlay === "nightlords" && <NightlordOverlay onClose={closeOverlay} />}
      {activeOverlay === "relics" && <RelicBrowser onClose={closeOverlay} />}
      {activeOverlay === "guide" && <GuideOverlay onClose={closeOverlay} game={game} />}
      {activeOverlay === "account" && <AccountOverlay onClose={closeOverlay} />}
      {activeOverlay === "settings" && <SettingsOverlay onClose={closeOverlay} />}
      {activeOverlay === "support" && <SupportPage />}
      {activeOverlay === "notesAdmin" && <NotesAdminOverlay onClose={closeOverlay} />}

      {/* Custom-marker create/edit dialog — self-gating (renders null when closed). */}
      <CustomMarkerDialog />
    </div>
  );
};

export default MapShell;
