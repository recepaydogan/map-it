import { Globe2, LoaderCircle, LocateFixed, MapPin, RotateCcw, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_GUIDE_SOURCES, GAME_MAP_DIMENSIONS,
  GAME_WORLD_MAP_PREVIEWS,
  GAME_TELEMETRY, WORLD_LIBRARY_CONFIG } from "../../game-config";
import { resolveWorldMapPlayer } from "./world-map-player";
import { worldTrackingNotice, worldTrackingStatus } from "./world-tracking-status";
import { resolveBiomePreview } from "../generation/resolve-biome-preview";
import WorldBiomeMap from "./world-biome-map";
import { emptyPersonalState, generationKey, type NewWorld, type WorldCreateRequest, type WorldRecord } from "./world-types";
import { useGameSession } from "../game-session/use-game-session";
import { readGameSession } from "../game-session/session-storage";
import { refreshWorldLibrary, runWorldCommand, useWorldLibrary, worldRepository } from "./use-world-library";
import { bindSelectedServerWorld } from "./bind-selected-server-world";
import { isCurrentWorldBinding } from "./world-session-binding";
import WorldSelector from "./world-selector";
import { useWorldKnowledgeCatalogs } from "./use-world-knowledge-catalogs";
import { EMPTY_KNOWLEDGE_CATALOGS } from "../knowledge/knowledge-catalogs";
import { resolveLiveGuideSource, resolveWorldGuideSource } from "../knowledge/guide-source-selection";
import type { WorldMapSurface } from "./world-types";
import { LINKED_WORLD_PREVIEW, readWorldPreviewState, resolveWorldPreview, writeWorldPreviewState,
  type WorldPreviewState } from "./world-preview-state";
import { useWorldHotkeyFeedback } from "./use-world-hotkey-feedback";
import { cn } from "../../lib/cn";
import type { MapWindowCommand } from "../map/map-window-command";
import type { WorldStructureSearchRequest } from "./world-structure-search-request";
import MapDropdownTrigger from "../../components/map-dropdown-trigger";
import { ONBOARDING_MAP_PANEL_EVENT, type OnboardingMapPanel } from "../onboarding/onboarding-map-panel";

const SERVER_NOTICE_DISMISSED_KEY = "server-seed-notice:dismissed:v1";

const hotkeyFeedbackText = (feedback: ReturnType<typeof useWorldHotkeyFeedback>, t: ReturnType<typeof useTranslation>["t"]): string => {
  if (!feedback) return "";
  if (feedback.type === "minimap") return t("worldHotkeys.minimapUnavailable");
  if (feedback.status === "saved") return t("worldHotkeys.pinSaved", feedback);
  if (feedback.status === "unavailable") return t("worldHotkeys.pinUnavailable");
  if (feedback.status === "limit") return t("worldHotkeys.pinLimit");
  return t("worldHotkeys.pinFailed");
};

/** A world descriptor never falls through to an unrelated bundled/static map. */
const WorldMapWorkspace = ({ active = true, minimapMode = false, viewScope = "desktop", followLivePosition = false, zoomCommand,
  onToggleFollowLivePosition, createRequest, onExploreSeeds, structureSearchRequest, onStructureSearchApplied }: {
  active?: boolean; minimapMode?: boolean; viewScope?: WorldMapSurface; followLivePosition?: boolean; zoomCommand?: MapWindowCommand | null;
  onToggleFollowLivePosition?: () => void;
  createRequest?: WorldCreateRequest | null;
  onExploreSeeds?: (edition: string, version: string) => void;
  structureSearchRequest?: WorldStructureSearchRequest | null;
  onStructureSearchApplied?: (revision: number) => void;
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<NewWorld | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [worldSelectorOpen, setWorldSelectorOpen] = useState(false);
  const [dismissedServerNoticeKey, setDismissedServerNoticeKey] = useState<string | null>(() => {
    try { return sessionStorage.getItem(SERVER_NOTICE_DISMISSED_KEY); }
    catch (error) { console.error("[World notice] Unable to restore dismissal", error); return null; }
  });
  useEffect(() => {
    if (minimapMode) return;
    const showPanel = (event: Event) => {
      const panel = (event as CustomEvent<OnboardingMapPanel>).detail;
      setWorldSelectorOpen(panel === "world-create");
      setFilterOpen(panel === "explore");
    };
    window.addEventListener(ONBOARDING_MAP_PANEL_EVENT, showPanel);
    return () => window.removeEventListener(ONBOARDING_MAP_PANEL_EVENT, showPanel);
  }, [minimapMode]);
  useEffect(() => {
    if (!active || !filterOpen) return;
    const closeFilterOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      setFilterOpen(false);
    };
    window.addEventListener("keydown", closeFilterOnEscape);
    return () => window.removeEventListener("keydown", closeFilterOnEscape);
  }, [active, filterOpen]);
  const library = useWorldLibrary();
  const live = useGameSession();
  const hotkeyFeedback = useWorldHotkeyFeedback();
  const previewKey = `${WORLD_LIBRARY_CONFIG.detachedPreviewKeyPrefix}:${viewScope}`;
  const [previewState, setPreviewState] = useState<WorldPreviewState>(() => {
    if (minimapMode) return LINKED_WORLD_PREVIEW;
    try { return readWorldPreviewState(sessionStorage, previewKey); }
    catch (error) { console.error("[World preview] Unable to restore window state", error); return LINKED_WORLD_PREVIEW; }
  });
  const selectionPreview = resolveWorldPreview(minimapMode ? LINKED_WORLD_PREVIEW : previewState,
    library.data?.selection.worldId ?? null, library.data?.worlds.map(item => item.id) ?? []);
  const detached = !minimapMode && selectionPreview.detached;
  const world = library.data?.worlds.find(item => item.id === selectionPreview.worldId) ?? null;
  const draftWorld = useMemo<WorldRecord | null>(() => draft ? ({ schemaVersion: 1, id: "draft-world-preview",
    name: draft.name, edition: draft.edition, generation: draft.generation, association: null, favorite: false,
    createdAt: 0, lastOpenedAt: 0, movedToBottomAt: null, personal: emptyPersonalState() }) : null, [draft]);
  const mapWorld = draftWorld ?? world;
  const liveGuideSource = resolveLiveGuideSource(GAME_GUIDE_SOURCES, live.session);
  const guideSource = resolveWorldGuideSource(GAME_GUIDE_SOURCES.filter(candidate => candidate.gameId === "minecraft"),
    world ? { edition: world.edition, version: world.generation.version } : null, liveGuideSource);
  // Resume/camera writes replace world records during movement, but do not change catalogs.
  const guideWorldId = world?.id;
  const guideEdition = world?.edition;
  const guideVersion = guideSource?.version ?? world?.generation.version;
  const updatePreview = (next: WorldPreviewState) => {
    setPreviewState(next);
    try { writeWorldPreviewState(sessionStorage, previewKey, next); }
    catch (error) { console.error("[World preview] Unable to persist window state", error); }
  };
  useEffect(() => {
    if (minimapMode || previewState.mode !== "detached" || selectionPreview.detached) return;
    try { writeWorldPreviewState(sessionStorage, previewKey, LINKED_WORLD_PREVIEW); }
    catch (error) { console.error("[World preview] Unable to clear missing detached world", error); }
  }, [minimapMode, selectionPreview.detached, previewKey, previewState.mode]);
  const knowledgeCatalogs = useWorldKnowledgeCatalogs(guideWorldId, guideEdition, guideVersion, guideSource);
  const biomePreview = mapWorld && !library.error ? resolveBiomePreview(mapWorld, GAME_WORLD_MAP_PREVIEWS) : null;
  const exampleWorldVisible = !draftWorld && mapWorld?.id === WORLD_LIBRARY_CONFIG.exampleWorld.id;
  const mapDimensions = GAME_MAP_DIMENSIONS.map(item => item.id);
  const player = !draftWorld && !library.error && !detached
    ? resolveWorldMapPlayer(world, live, library.data?.binding ?? null, live.now,
      GAME_TELEMETRY.staleAfterMs, mapDimensions, GAME_TELEMETRY.coordinateLimit)
    : null;
  const session = live.session;
  const unboundPosition = !player && live.status === "live" && session?.connected && session.registered && session.inWorld && !session.issue
    && session.position && session.dimension && GAME_MAP_DIMENSIONS.some(item => item.id === session.dimension)
    && [session.position.x, session.position.y, session.position.z].every(value => Number.isFinite(value)
      && Math.abs(value) <= GAME_TELEMETRY.coordinateLimit) ? session.position : null;
  const serverNoticeKey = session && (session.identity.server || session.identity.realmId)
    ? JSON.stringify([session.id, session.generation, session.identity.server, session.identity.realmId]) : null;
  const trackingStatus = worldTrackingStatus(library.data, session, live.now, GAME_TELEMETRY.staleAfterMs, !!library.error || !!live.error);
  const trackingNotice = worldTrackingNotice(trackingStatus, session);
  const selectedSeedMapReady = !!player && !!world && world.id !== WORLD_LIBRARY_CONFIG.exampleWorld.id;
  const serverSessionActive = !minimapMode && !detached && session?.connected && session.inWorld && !!serverNoticeKey;
  const worldPreparing = !!session?.connected && session.inWorld && !selectedSeedMapReady
    && (!serverNoticeKey || isCurrentWorldBinding(world, session, library.data?.binding ?? null));
  const serverNeedsWorld = serverSessionActive && !selectedSeedMapReady
    && !isCurrentWorldBinding(world, session, library.data?.binding ?? null);
  const showWorldLoadNotice = !detached && !draftWorld && !serverNeedsWorld
    && !trackingNotice && (worldPreparing || (!minimapMode && !serverSessionActive && exampleWorldVisible));
  const showServerSeedNotice = serverNeedsWorld && dismissedServerNoticeKey !== serverNoticeKey;
  const dismissServerSeedNotice = () => {
    if (!serverNoticeKey) return;
    setDismissedServerNoticeKey(serverNoticeKey);
    try { sessionStorage.setItem(SERVER_NOTICE_DISMISSED_KEY, serverNoticeKey); }
    catch (error) { console.error("[World notice] Unable to persist dismissal", error); }
  };
  const feedbackText = hotkeyFeedbackText(hotkeyFeedback, t);
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-map-surface [container-type:inline-size]" data-world-id={mapWorld?.id}
      data-world-preview={detached ? "detached" : "linked"}>
      {!detached && !draftWorld && trackingNotice && <div role="status" data-tracking-status={trackingNotice}
        className={cn("absolute z-40 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface/95 px-3 py-2 text-[11px] text-zinc-200",
          minimapMode ? "left-3 top-3" : "left-3 top-16")}>
        <span>{t(`tracking.${trackingNotice}`)}</span>
        {trackingNotice === "chooseWorld" && !minimapMode &&
          <button type="button" onClick={() => { setWorldSelectorOpen(true); setFilterOpen(false); }}
            className="cursor-pointer font-semibold text-accent hover:underline">{t("tracking.selectWorld")}</button>}
      </div>}
      {hotkeyFeedback && <div data-world-hotkey-feedback role={hotkeyFeedback.type === "pin" && hotkeyFeedback.status === "failed" ? "alert" : "status"}
        className={cn("pointer-events-none absolute left-1/2 top-14 z-[70] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-[var(--radius-md)] border bg-surface/95 px-3 py-2 text-center text-xs font-semibold text-zinc-100 shadow-[var(--panel-shadow)] backdrop-blur-xl",
          hotkeyFeedback.type === "pin" && hotkeyFeedback.status === "saved" ? "border-success/60 text-success-text"
            : hotkeyFeedback.type === "pin" && hotkeyFeedback.status === "failed" ? "border-danger/60 text-danger-text" : "border-warning/60 text-warning") }>
        {hotkeyFeedback.type === "pin" && hotkeyFeedback.status === "saved"
          ? <MapPin size={14} className="shrink-0" aria-hidden="true" />
          : <TriangleAlert size={14} className="shrink-0" aria-hidden="true" />}
        <span>{feedbackText}</span>
      </div>}
      {mapWorld && biomePreview && <div className="absolute inset-0">
        <WorldBiomeMap key={`${mapWorld.id}:${generationKey(mapWorld)}`} world={mapWorld} config={biomePreview} active={active} player={player}
          now={live.now}
          unboundPositionVisible={!!unboundPosition || trackingStatus !== "live"}
          structureSearchRequest={structureSearchRequest} onStructureSearchApplied={onStructureSearchApplied}
          knowledgeCatalogs={draftWorld ? EMPTY_KNOWLEDGE_CATALOGS : knowledgeCatalogs} minimapMode={minimapMode} followLivePosition={followLivePosition} zoomCommand={zoomCommand}
          filterOpen={filterOpen} onFilterOpenChange={setFilterOpen}
          viewScope={viewScope} onToggleFollowLivePosition={onToggleFollowLivePosition}
          personalEditingEnabled={!draftWorld}
          saveCamera={draftWorld ? async () => undefined : undefined} saveFilter={draftWorld ? async () => undefined : undefined}
          savePersonal={draftWorld ? async (_worldId, change) => change(mapWorld.personal) : undefined} />
      </div>}
      {library.ready && library.data && !library.error && !minimapMode && <div className="pointer-events-none absolute inset-x-3 top-3 z-50 flex flex-wrap items-start gap-3">
        <div data-tour="filters-trigger" className="pointer-events-auto w-28 shrink-0">
          <MapDropdownTrigger icon={SlidersHorizontal} label={t("structureMap.filters.title")} open={filterOpen}
            aria-expanded={filterOpen} aria-controls="world-structure-filter-panel"
            onClick={() => { setWorldSelectorOpen(false); setFilterOpen(open => !open); }}
            className="w-full" />
        </div>
        <div data-tour="worlds" className="pointer-events-auto max-w-full">
          <WorldSelector worlds={library.data.worlds} selected={world} active={active} open={worldSelectorOpen}
            createRequest={createRequest} onExploreSeeds={onExploreSeeds}
            onOpenChange={open => { setWorldSelectorOpen(open); if (open) setFilterOpen(false); }}
            onPreview={setDraft}
            onSelect={async next => {
              if (detached) { updatePreview({ mode: "detached", worldId: next.id }); return; }
              await runWorldCommand(async () => {
                const selected = await worldRepository.select(next.id);
                await bindSelectedServerWorld(worldRepository, selected, readGameSession(), Date.now(), readGameSession);
              });
            }}
            onCreate={async input => {
              if (!detached) {
                await runWorldCommand(async () => {
                  const created = await worldRepository.create(input);
                  await bindSelectedServerWorld(worldRepository, created, readGameSession(), Date.now(), readGameSession);
                });
                return;
              }
              const created = await runWorldCommand(() => worldRepository.create(input, { select: false }));
              updatePreview({ mode: "detached", worldId: created.id });
            }} />
        </div>
        <div aria-hidden="true" className="h-9 w-40 shrink-0" />
        {detached && <span role="status" className="hidden min-w-0 truncate rounded-[var(--radius-md)] border border-border bg-surface px-2 py-2 text-[11px] text-zinc-200 @[1000px]:block">
          {t("worlds.preview.liveDisabled")}
        </span>}
      </div>}
      {(unboundPosition || showServerSeedNotice || showWorldLoadNotice) && <div className={cn("pointer-events-none absolute z-[70] flex max-w-[calc(100%-2rem)] flex-col items-center gap-2",
        minimapMode ? showWorldLoadNotice ? "bottom-2 left-1/2 w-max -translate-x-1/2" : "bottom-3 left-3 items-start"
          : "bottom-5 left-1/2 w-max -translate-x-1/2")}>
        {unboundPosition && <div data-unbound-world-position role="status" className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-[var(--panel-bg)] px-3 py-2 text-[11px] font-mono tabular-nums text-zinc-100 shadow-[var(--panel-shadow)]">
          <LocateFixed size={13} className="shrink-0 text-accent" aria-hidden="true" />
          <span aria-label={t("mapPlayer.position", { x: Math.round(unboundPosition.x), y: Math.round(unboundPosition.y), z: Math.round(unboundPosition.z) })}>
            X {Math.round(unboundPosition.x)} · Y {Math.round(unboundPosition.y)} · Z {Math.round(unboundPosition.z)}
          </span>
        </div>}
        {showWorldLoadNotice && <div role="status" aria-live="polite" data-world-load-notice={worldPreparing ? "preparing" : "waiting"}
          className={cn("flex items-center gap-2 border border-accent/35 bg-surface/95 text-center font-medium text-zinc-100 shadow-[var(--panel-shadow)] backdrop-blur-xl",
            minimapMode ? "rounded-[var(--radius-md)] px-3 py-2 text-[11px]" : "rounded-[var(--radius-full)] px-4 py-2.5 text-[12px]")}>
          {worldPreparing && <LoaderCircle size={14} className="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          <span>{t(worldPreparing
            ? minimapMode ? "tracking.preparingWorldShort" : "tracking.preparingWorld"
            : "worlds.example.gameLoadNotice")}</span>
        </div>}
        {showServerSeedNotice && <div data-server-world-notice role="status" className="pointer-events-auto flex items-center gap-2 rounded-[var(--radius-full)] border border-accent/35 bg-surface/95 py-2 pl-4 pr-2 text-center text-[12px] font-medium text-zinc-100 shadow-[var(--panel-shadow)] backdrop-blur-xl">
          <span>{t("worlds.serverSeedNotice")}</span>
          <button type="button" aria-label={t("worlds.dismissServerSeedNotice")}
            className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-zinc-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={dismissServerSeedNotice}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>}
      </div>}
      {!biomePreview && <div className="grid h-full place-items-center px-6 pb-6 pt-20">
        <div role="status" className="max-w-sm text-center">
          {!library.ready ? <LoaderCircle size={24} className="mx-auto animate-spin text-accent" aria-hidden="true" /> : <Globe2 size={24} className="mx-auto text-accent" aria-hidden="true" />}
          <p className="mt-3 text-[13px] leading-5 text-white/80">
            {t(!library.ready ? "worlds.loading" : library.error ? "worlds.loadFailed" : world ? "worlds.sourceUnavailable" : "worlds.selectionPrompt")}
          </p>
          {world && !biomePreview && <p className="mt-2 text-[11px] leading-4 text-zinc-300">{t("biomeMap.available")}</p>}
          {library.error && <button type="button" onClick={() => { void refreshWorldLibrary(); }} className="mx-auto mt-3 flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-border px-3 py-2 text-xs text-zinc-100 hover:bg-surface-hover">
            <RotateCcw size={13} aria-hidden="true" />{t("worlds.retry")}
          </button>}
        </div>
      </div>}
    </div>
  );
};

export default WorldMapWorkspace;
