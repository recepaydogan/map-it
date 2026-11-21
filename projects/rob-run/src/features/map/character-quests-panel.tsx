import { useRelativeTime } from "../../lib/use-relative-time";
import { Circle, CircleCheck, MapPin, PanelRightClose } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { useCharacterSync } from "../character-sync/character-sync-store";
import { AddonInstallAction } from "../character-sync/addon-install-action";
import { shouldAutoStartOnboarding, useOnboardingActive } from "../onboarding/use-onboarding";
import { indexCharacterQuestDestinations, type CharacterQuestDestination } from "./character-quest-navigation";
import { DEFAULT_MAP_ID, MAP_DEFINITIONS } from "./map-registry";
import { requestMapPointInMain } from "./map-window-bridge";
import { getCategoryConfig } from "./map-config";
import MapPointIcon from "./map-point-icon";
import { cn } from "../../lib/cn";
import { isCharacterQuestObjectiveComplete } from "../character-sync/character-quest-progress";
import type { MapLocation } from "./types";

let destinationsRequest: Promise<Map<string, CharacterQuestDestination>> | undefined;
function loadDestinations() {
  destinationsRequest ??= Promise.all([
    "locations-forever-all-quest-givers.json", "locations-forever-all-new-quest-givers.json", "locations-forever-all-quests.json",
  ].map(async file => {
    const response = await fetch(`${MAP_DEFINITIONS[0]!.dataUrl}/${file}`);
    if (!response.ok) throw new Error(`Quest destinations: HTTP ${response.status}`);
    const data = await response.json() as { version: number; locations: MapLocation[] };
    if (data.version !== 1 || !Array.isArray(data.locations)) throw new Error("Invalid quest destinations");
    return data.locations;
  })).then(groups => indexCharacterQuestDestinations(groups.flat()))
    .catch((error: unknown) => { destinationsRequest = undefined; throw error; });
  return destinationsRequest;
}

/** Saved quest-log companion; stays inside the map frame, before the ad rail. */
export default function CharacterQuestsPanel({ characterId }: { characterId: string | null }) {
  const { t, i18n } = useTranslation();
  const relativeTime = useRelativeTime(i18n.language);
  const gameText = useGameText();
  const sync = useCharacterSync();
  const onboardingActive = useOnboardingActive();
  const [open, setOpen] = useState(() => { try { return localStorage.getItem("wfm:quest-panel-collapsed") === "false"; } catch { return false; } });
  const panelId = useId();
  const giverIcon = getCategoryConfig("npc");
  const questIcon = getCategoryConfig("quest");
  const toggle = () => { setOpen(value => { try { localStorage.setItem("wfm:quest-panel-collapsed", String(value)); } catch { /* Session state still works. */ } return !value; }); };
  const [destinations, setDestinations] = useState<Map<string, CharacterQuestDestination>>();
  const [loadError, setLoadError] = useState(false);
  // An explicitly selected manual character must never display another character's log.
  const id = characterId ?? sync.currentId;
  const character = id ? sync.characters[id] : undefined;
  const log = character?.quests;
  const hasQuests = Boolean(log?.active.length);
  useEffect(() => {
    if (!hasQuests || !open) return;
    let active = true;
    void loadDestinations().then(data => { if (active) { setDestinations(data); setLoadError(false); } })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [hasQuests, open]);
  if (!Object.keys(sync.characters).length || onboardingActive || shouldAutoStartOnboarding()) return null;

  const toggleLabel = t(open ? "nextQuests.collapse" : "nextQuests.expand");
  return (
    <div className="pointer-events-auto relative z-30 shrink-0" data-map-ui>
      <button type="button" aria-label={toggleLabel} aria-expanded={open} aria-controls={open ? panelId : undefined}
        onClick={toggle} title={toggleLabel}
        className="map-filter-panel grid size-[var(--map-toolbar-height)] cursor-pointer place-items-center rounded-full border border-border shadow-xl shadow-black/40 backdrop-blur-xl hover:border-accent/60 focus-visible:outline-2 focus-visible:outline-accent">
        <MapPointIcon fallback={giverIcon.icon} source={giverIcon.nativeIconPath} size={26} />
      </button>
      {open && <aside id={panelId} aria-label={t("nextQuests.questsTitle")}
        style={{ maxHeight: "max(0px, calc(100dvh - 8rem - var(--map-right-panel-bottom, 6rem)))" }}
        className="map-filter-panel absolute right-0 top-full mt-2.5 flex w-[320px] max-w-[calc(100cqw-2.5rem)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border shadow-2xl shadow-black/40 backdrop-blur-xl">
        <header className="flex min-h-14 shrink-0 items-center gap-2.5 border-b border-border px-4 py-3">
          <MapPointIcon fallback={giverIcon.icon} source={giverIcon.nativeIconPath} size={24} />
          <h2 className="min-w-0 flex-1 text-sm font-semibold text-white">{t("nextQuests.questsTitle")}</h2>
          {log && <span className="mr-1 text-xs font-medium tabular-nums text-zinc-300">{log.active.length}</span>}
          <button type="button" aria-label={t("nextQuests.collapse")} aria-expanded={true} aria-controls={panelId} onClick={toggle}
            className="grid size-8 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-zinc-300 hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
            <PanelRightClose size={17} aria-hidden="true" />
          </button>
        </header>
        <div className="scroll-slim min-h-0 overflow-y-auto">
          {character && <p className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-xs text-zinc-300">
            <span className="truncate font-medium text-zinc-100">{character.name || t("gepSync.currentCharacter")}</span>{character.level !== null && <span>{t("map.characters.levelShort", { level: character.level })}</span>}
          </p>}
          {loadError && <p role="status" className="px-4 pt-3 text-[11px] text-subtle">{t("nextQuests.locationError")}</p>}
          {!hasQuests ? <p className="px-4 py-4 text-xs leading-5 text-muted">{t(character && log ? "nextQuests.empty" : "nextQuests.noSnapshot")}</p>
            : <ul className="divide-y divide-border">{log!.active.map(quest => {
              const destination = destinations?.get(quest.id);
              const title = gameText(quest.title, `Quest:${quest.id}:0`);
              return <li key={quest.id} className="px-4 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-7 shrink-0 place-items-center"><MapPointIcon fallback={questIcon.icon} source={questIcon.nativeIconPath} size={24} /></span>
                  <h3 className="min-w-0 flex-1 text-[14px] font-semibold leading-5 text-white">{title}</h3>
                  {quest.level !== null && <span className="flex min-h-7 shrink-0 items-center justify-center text-[11px] text-zinc-300">{t("map.characters.levelShort", { level: quest.level })}</span>}
                </div>
                <div className="mt-3 text-xs leading-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-zinc-400">{t("nextQuests.giver")}</p>
                  <p className="mt-0.5 font-medium text-zinc-100">{destination ? gameText(destination.giverName) : t(destinations || loadError ? "nextQuests.unknownGiver" : "nextQuests.loading")}</p>
                </div>
                {quest.ready === true && <div role="status" className="mt-3 flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-success-text/30 px-2.5 py-1.5 text-xs font-semibold text-success-text">
                  <span className="grid size-5 shrink-0 place-items-center"><CircleCheck size={17} aria-hidden="true" /></span>
                  <span>{t("nextQuests.ready")}</span>
                </div>}
                {quest.objectives.length > 0 && <ul className="mt-3.5 space-y-2">{quest.objectives.map((objective, index) => {
                  const complete = isCharacterQuestObjectiveComplete(objective);
                  const countKnown = objective.have !== null && objective.need !== null && objective.need > 0;
                  const text = countKnown ? objective.text.replace(/^\d+\s*\/\s*\d+\s*/, "") : objective.text;
                  return <li key={index} data-objective-complete={complete || undefined}
                    className={cn("flex min-h-9 items-center gap-2.5 rounded-[var(--radius-sm)] border px-2 py-1.5 text-xs leading-5",
                      complete ? "border-success-text/25" : "border-transparent")}>
                    <span className="grid size-5 shrink-0 place-items-center" role={complete ? "img" : undefined} aria-label={complete ? t("nextQuests.objectiveComplete") : undefined}>
                      {complete ? <CircleCheck size={17} className="text-success-text" aria-hidden="true" /> : <Circle size={6} className="text-zinc-400" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1 text-zinc-100">{gameText(text)}</span>
                    {countKnown && <span className={cn("flex min-h-6 shrink-0 items-center justify-center rounded px-1.5 text-[11px] font-semibold tabular-nums", complete ? "text-success-text" : "text-zinc-300")}>
                      {t("nextQuests.progress", { have: objective.have, need: objective.need })}
                    </span>}
                  </li>;
                })}</ul>}
                {destination ? <button type="button" onClick={() => requestMapPointInMain(destination.giverMarkerId, DEFAULT_MAP_ID)}
                  aria-label={t("nextQuests.showQuestOnMap", { quest: title })}
                  className="mt-4 flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.035] text-xs font-semibold text-zinc-100 hover:border-accent/60 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
                  <MapPin size={13} aria-hidden="true" />{t("nextQuests.showOnMap")}
                </button> : <p className="mt-3 text-[10px] text-subtle">{t(destinations || loadError ? "nextQuests.noLocation" : "nextQuests.loading")}</p>}
              </li>;
            })}</ul>}
          <div className="border-t border-border px-4 py-3 text-[11px] leading-4 text-zinc-400">
            {log && <p>{t("nextQuests.savedCompact", { date: relativeTime(log.capturedAt) })}</p>}
            <p className="mt-1">{t("nextQuests.refreshHint")}</p>
            <div className="mt-2"><AddonInstallAction /></div>
          </div>
        </div>
      </aside>}
    </div>
  );
}
