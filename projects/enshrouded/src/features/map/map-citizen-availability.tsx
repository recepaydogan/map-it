import { contentUrl } from "../../lib/content-url";
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import ProgressiveList from "../../components/progressive-list";
import DatabaseSectionTitle from "../database/database-section-title";
import { sameReferenceTarget, useReferenceNavigation, useSelectedReference } from "../reference/reference-navigation-context";
import { useReferenceIndex } from "../reference/use-reference-data";

interface QuestBoundary { kind: "QuestAcquire" | "QuestComplete" | "QuestIncomplete"; quest: string; questId: string; step?: number }
interface CitizenRecord {
  windows: { start: QuestBoundary | null; end: QuestBoundary | null }[];
  talk: { quest: string; questId: string; step: number; next?: { name: string; mapId: string; markerId: string } }[];
}
interface CitizenAvailability { version: 2; npcs: Record<string, CitizenRecord> }

let availabilityPromise: Promise<CitizenAvailability> | null = null;

const loadAvailability = () => {
  availabilityPromise ??= fetch(contentUrl(`data/citizen-availability.json`)).then(async (response) => {
    if (!response.ok) throw new Error(`Citizen availability: HTTP ${response.status}`);
    const data = await response.json() as CitizenAvailability;
    if (data.version !== 2 || !data.npcs) throw new Error("Invalid citizen availability catalog");
    return data;
  }).catch((error: unknown) => {
    availabilityPromise = null;
    throw error;
  });
  return availabilityPromise;
};

const MapCitizenAvailability = ({ npcId, name, onOpenMap }: {
  npcId?: string; name: string; onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const index = useReferenceIndex();
  const open = useReferenceNavigation();
  const selected = useSelectedReference();
  const [record, setRecord] = useState<CitizenRecord | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!npcId) return;
    let active = true;
    void loadAvailability().then((data) => {
      if (active) setRecord(data.npcs[npcId] ?? { windows: [], talk: [] });
    }).catch((error: unknown) => {
      console.error("Failed to load citizen availability", error);
      if (active) setError(true);
    });
    return () => { active = false; };
  }, [npcId]);

  const questLink = (questId: string, label?: string) => {
    const summary = index.status === "ready" ? index.data.entries.find((entry) => entry.id === `Quest:${questId}`) : undefined;
    return summary ? <button type="button" onClick={() => open(summary)}
      aria-pressed={selected !== undefined ? sameReferenceTarget(selected, summary) : undefined}
      className="cursor-pointer text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent focus-visible:outline-2 focus-visible:outline-accent">{label}</button> : <span>{label}</span>;
  };
  if (error) return <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>;
  if (!record || (!record.windows.length && !record.talk.length)) return null;
  const boundaryText = (boundary: QuestBoundary | null) => {
    if (!boundary || (boundary.kind === "QuestIncomplete" && !boundary.step)) return null;
    const key = boundary.kind === "QuestIncomplete" ? "atStep"
      : boundary.kind === "QuestAcquire" ? "acceptQuest" : "completeQuest";
    return <Trans i18nKey={`map.citizen.${key}`} values={{ quest: boundary.quest, step: boundary.step }}
      components={{ quest: questLink(boundary.questId) }} />;
  };
  const visibleWindows = record.windows.map((window) => [boundaryText(window.start), boundaryText(window.end)])
    .filter((lines) => lines.some(Boolean));
  return <div className="space-y-5">
    {!!visibleWindows.length && <section>
      <DatabaseSectionTitle className="mb-2">{t("map.citizen.availability")}</DatabaseSectionTitle>
      <ProgressiveList initialCount={3} className="space-y-2">{visibleWindows.map((lines, index) => <div key={index}
        className="divide-y divide-border/60 rounded-[var(--radius-sm)] border border-border bg-surface px-3">
        {lines.map((line, lineIndex) => line && <div key={lineIndex} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 py-2.5">
          <span className="text-[11px] font-medium leading-5 text-subtle">{t(lineIndex === 0 ? "map.citizen.appears" : "map.citizen.disappears")}</span>
          <span className="min-w-0 text-[12px] leading-5 text-zinc-100">{line}</span>
        </div>)}
      </div>)}</ProgressiveList>
    </section>}
    {!!record.talk.length && <section>
      <DatabaseSectionTitle className="mb-2">{t("map.citizen.questObjectives")}</DatabaseSectionTitle>
      <ProgressiveList initialCount={3} className="space-y-2">{record.talk.map((objective, index) => <div key={`${objective.questId}-${objective.step}-${index}`}
        className="rounded-[var(--radius-sm)] border border-border bg-surface p-3">
        <p className="text-[13px] font-medium leading-5 text-zinc-100">{questLink(objective.questId, objective.quest)}</p>
        <div className="mt-2 flex items-center gap-2 text-[12px] text-zinc-200">
          <span className="shrink-0 rounded-[var(--radius-sm)] bg-accent-soft px-2 py-0.5 font-medium tabular-nums text-accent">{t("map.citizen.step", { number: objective.step })}</span>
          <span className="min-w-0">{t("map.citizen.talkTo", { name })}</span>
        </div>
        {objective.next && <button type="button" onClick={() => onOpenMap(objective.next!.mapId, objective.next!.markerId)}
          className="mt-3 flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border px-2.5 py-2 text-left text-accent hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
          <span className="min-w-0 flex-1">{t("map.citizen.nextObjective", { name: objective.next.name })}</span>
          <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
        </button>}
      </div>)}</ProgressiveList>
    </section>}
  </div>;
};

export default MapCitizenAvailability;
