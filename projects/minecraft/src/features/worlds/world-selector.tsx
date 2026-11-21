import { ArrowLeft, Globe2, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { useDismissable } from "../map/use-dismissable";
import { runWorldCommand, worldRepository } from "./use-world-library";
import WorldActions from "./world-actions";
import WorldForm from "./world-form";
import WorldList from "./world-list";
import type { NewWorld, WorldCreateRequest, WorldRecord } from "./world-types";
import { getBrowserJourneyStorage } from "../journey/journey-storage";
import { terrainDirectoryHandleRepository } from "./terrain-directory-handles";
import MapDropdownTrigger from "../../components/map-dropdown-trigger";
import { ONBOARDING_MAP_PANEL_EVENT, type OnboardingMapPanel } from "../onboarding/onboarding-map-panel";

type Pane = { kind: "list" } | { kind: "new" } | { kind: "manage" | "forget"; worldId: string };

interface WorldSelectorProps {
  worlds: WorldRecord[];
  selected: WorldRecord | null;
  active: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (world: WorldRecord) => Promise<void> | void;
  onCreate?: (input: NewWorld) => Promise<void> | void;
  onPreview?: (input: NewWorld | null) => void;
  createRequest?: WorldCreateRequest | null;
  onExploreSeeds?: (edition: string, version: string) => void;
}

const WorldSelector = ({ worlds, selected, active, open, onOpenChange, onSelect, onCreate, onPreview,
  createRequest, onExploreSeeds }: WorldSelectorProps) => {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const listFocus = useRef<HTMLElement | null>(null);
  const [pane, setPane] = useState<Pane>({ kind: "list" });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [prefill, setPrefill] = useState<WorldCreateRequest | null>(null);
  const appliedCreateRevision = useRef<number | null>(null);
  const tourCreateOpen = useRef(false);
  useEffect(() => {
    const showTourPane = (event: Event) => {
      if ((event as CustomEvent<OnboardingMapPanel>).detail !== "world-create") {
        if (tourCreateOpen.current) {
          tourCreateOpen.current = false;
          onPreview?.(null);
          setPane({ kind: "list" });
        }
        return;
      }
      tourCreateOpen.current = true;
      setPrefill(null);
      setPane({ kind: "new" });
      setFailed(false);
    };
    window.addEventListener(ONBOARDING_MAP_PANEL_EVENT, showTourPane);
    return () => window.removeEventListener(ONBOARDING_MAP_PANEL_EVENT, showTourPane);
  }, [onPreview]);
  const managed = "worldId" in pane ? worlds.find(world => world.id === pane.worldId) : null;
  const showList = pane.kind === "list" || ((pane.kind === "manage" || pane.kind === "forget") && !managed);
  useEffect(() => {
    if (!createRequest || createRequest.revision === appliedCreateRevision.current) return;
    appliedCreateRevision.current = createRequest.revision;
    setPrefill(createRequest);
    setPane({ kind: "new" });
    setFailed(false);
    onOpenChange(true);
  }, [createRequest, onOpenChange]);
  const close = useCallback(() => { setPrefill(null); onPreview?.(null); onOpenChange(false); trigger.current?.focus(); }, [onOpenChange, onPreview]);
  const back = useCallback(() => {
    setFailed(false);
    if (pane.kind === "forget") setPane({ kind: "manage", worldId: pane.worldId });
    else if (pane.kind !== "list") {
      onPreview?.(null); setPrefill(null); setPane({ kind: "list" });
      requestAnimationFrame(() => {
        if (listFocus.current?.isConnected) listFocus.current.focus();
        else addButton.current?.focus();
      });
    }
    else close();
  }, [pane, close, onPreview]);
  // Escape unwinds a nested dropdown, then the current pane, then the selector.
  useDismissable(open && active, root, close, "[data-map-nested-popover]", back, pane.kind !== "new");
  const run = async (command: () => Promise<unknown> | unknown, onDone?: () => void) => {
    if (busy) return;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBusy(true); setFailed(false);
    try { await command(); onDone?.(); }
    catch (error) { console.error("[World library] Command failed", error); setFailed(true); }
    finally {
      setBusy(false);
      requestAnimationFrame(() => {
        if (origin?.isConnected && document.activeElement === document.body) origin.focus();
      });
    }
  };
  const forgetWorld = async (worldId: string) => {
    await terrainDirectoryHandleRepository.removeWorld(worldId);
    await worldRepository.forget(worldId);
    try { getBrowserJourneyStorage().remove(worldId); }
    catch (error) { console.error("Forgot the world, but could not remove its local journey record", error); }
  };
  const saveWorld = (input: NewWorld) => { void run(() => onCreate ? onCreate(input)
    : runWorldCommand(() => worldRepository.create(input)), () => { setPane({ kind: "list" }); close(); }); };
  return (
    <div ref={root} className="flex max-w-full items-start gap-2" data-map-ui>
      <div className="w-40 shrink-0">
        <MapDropdownTrigger ref={trigger} icon={Globe2} label={selected?.name ?? t("worlds.title")} open={open}
          onClick={() => onOpenChange(!open)} aria-expanded={open} aria-controls="world-selector-panel" aria-label={t("worlds.title")} />
      </div>
      <button type="button" data-tour="world-new" aria-label={t("worlds.add")} aria-controls="world-selector-panel"
        onClick={event => { listFocus.current = event.currentTarget; setPrefill(null); setPane({ kind: "new" }); setFailed(false); onOpenChange(true); }}
        className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface/90 px-3 text-[12px] font-semibold text-zinc-100 shadow-lg backdrop-blur-xl hover:border-accent/40 hover:bg-surface-hover">
        <Plus size={15} className="text-accent" aria-hidden="true" />
        <span className="hidden whitespace-nowrap @[360px]:inline">{t("worlds.add")}</span>
      </button>
      <section id="world-selector-panel" aria-label={t("worlds.title")} aria-busy={busy} hidden={!open} inert={!open || !active}
        className={cn("absolute left-0 top-[calc(100%+12px)] flex max-h-[calc(100dvh-64px)] w-[19rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/95 shadow-2xl shadow-black/40 backdrop-blur-xl", !open && "hidden")}>
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          {!showList && <button type="button" onClick={back} aria-label={t("worlds.back")} className="grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-300 hover:bg-white/5"><ArrowLeft size={16} aria-hidden="true" /></button>}
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{pane.kind === "new" ? t("worlds.add") : managed?.name ?? t("worlds.title")}</h2>
          {showList && <button ref={addButton} type="button" onClick={event => { listFocus.current = event.currentTarget; setPrefill(null); setPane({ kind: "new" }); setFailed(false); }} className="flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] px-2 text-[12px] font-semibold text-accent hover:bg-accent-soft"><Plus size={16} aria-hidden="true" /><span>{t("worlds.add")}</span></button>}
          <button type="button" onClick={close} aria-label={t("chrome.close")} className="grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/5 hover:text-white"><X size={16} aria-hidden="true" /></button>
        </header>
        {failed && <p role="alert" className="px-4 pt-3 text-xs text-danger-text">{t("worlds.writeFailed")}</p>}
        <div className={cn("flex min-h-0 flex-1 flex-col", !showList && "hidden")} inert={!showList}>
          <WorldList worlds={worlds} selectedId={selected?.id ?? null} busy={busy}
            onSelect={world => { void run(() => onSelect ? onSelect(world) : runWorldCommand(() => worldRepository.select(world.id)), close); }}
            onFavorite={world => { void run(() => runWorldCommand(() => worldRepository.setFavorite(world.id, !world.favorite))); }}
            onManage={world => { listFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setPane({ kind: "manage", worldId: world.id }); setFailed(false); }} />
        </div>
        <div className={cn("scroll-slim min-h-0 flex-1 overflow-y-auto", showList && "hidden")}>
          {pane.kind === "new" && <WorldForm key={prefill?.revision ?? "manual"} busy={busy} onSave={saveWorld}
            initialWorld={prefill?.input} onPreview={onPreview} onExploreSeeds={onExploreSeeds} />}
          {pane.kind === "manage" && managed && <WorldActions key={managed.id} world={managed} busy={busy}
            onRename={name => { void run(() => runWorldCommand(() => worldRepository.rename(managed.id, name))); }}
            onMoveToBottom={() => { void run(() => runWorldCommand(() => worldRepository.moveToBottom(managed.id)), () => setPane({ kind: "list" })); }}
            onForget={() => setPane({ kind: "forget", worldId: managed.id })} />}
          {pane.kind === "forget" && managed && <div className="space-y-4 p-4">
            <p className="text-[13px] leading-5 text-white/80">{t("worlds.forgetBody")}</p>
            <button type="button" disabled={busy} onClick={() => { void run(() => runWorldCommand(() => forgetWorld(managed.id)), () => setPane({ kind: "list" })); }}
              className="w-full cursor-pointer rounded-[var(--radius-md)] border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] font-semibold text-danger-text disabled:cursor-wait">{t("worlds.forget")}</button>
          </div>}
        </div>
      </section>
    </div>
  );
};

export default WorldSelector;
