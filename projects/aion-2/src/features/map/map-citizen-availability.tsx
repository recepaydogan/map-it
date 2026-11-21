import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import ProgressiveList from "../../components/progressive-list";
import DatabaseSectionTitle from "../database/database-section-title";
import { sameReferenceTarget, useReferenceNavigation, useSelectedReference } from "../reference/reference-navigation-context";
import { useReferenceIndex } from "../reference/use-reference-data";
import { useGameText } from "../../i18n/game-text";
import { contentUrl } from "../../lib/content-url";
import { cn } from "../../lib/cn";
import { questDisplayName } from "../reference/quest-presentation";
import type { ReferenceLink } from "../reference/reference-types";

interface CitizenRecord {
  talk: { quest: string; questId: string; step: number }[];
}
interface CitizenAvailability { version: 2; npcs: Record<string, CitizenRecord> }

let availabilityPromise: Promise<CitizenAvailability> | null = null;

const loadAvailability = () => {
  availabilityPromise ??= fetch(contentUrl("data/citizen-availability.json")).then(async (response) => {
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

const MapCitizenAvailability = ({ npcId, name, relatedQuests }: {
  npcId?: string; name: string; relatedQuests: ReferenceLink[];
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const index = useReferenceIndex();
  const open = useReferenceNavigation();
  const selected = useSelectedReference();
  const [record, setRecord] = useState<CitizenRecord | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!npcId) return;
    let active = true;
    void loadAvailability().then((data) => {
      if (active) setRecord(data.npcs[npcId] ?? { talk: [] });
    }).catch((error: unknown) => {
      console.error("Failed to load citizen availability", error);
      if (active) setError(true);
    });
    return () => { active = false; };
  }, [npcId]);

  const questSummary = (questId: string) => index.status === "ready"
    ? index.data.entries.find((entry) => entry.id === `Quest:${questId}`) : undefined;
  const displayQuestName = (questId: string, rawName: string) => {
    const name = questDisplayName({ id: "Quest:" + questId, name: rawName, adventure: questSummary(questId)?.adventure }, t, gameText);
    return gameText(name);
  };
  const questCard = (questId: string, label: string, step?: number) => {
    const summary = questSummary(questId);
    const content = <>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-5 text-zinc-100">{label}</span>
        {step !== undefined && <span className="mt-1.5 flex items-center gap-2 text-[11px] leading-4 text-subtle">
          <span className="shrink-0 rounded-[var(--radius-sm)] bg-accent-soft px-2 py-0.5 font-semibold tabular-nums text-accent">{t("map.citizen.step", { number: step })}</span>
          <span className="min-w-0">{t("map.citizen.talkTo", { name: gameText(name) })}</span>
        </span>}
      </span>
      <ChevronRight size={15} className="shrink-0 self-center text-subtle transition-colors group-hover:text-accent" aria-hidden="true" />
    </>;
    const className = cn("group flex w-full items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2.5 text-left transition-colors",
      summary && "cursor-pointer hover:border-accent/35 focus-visible:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent");
    return summary ? <button type="button" onClick={() => open(summary)}
      aria-pressed={selected !== undefined ? sameReferenceTarget(selected, summary) : undefined}
      className={className}>{content}</button>
      : <div className={className}>{content}</div>;
  };
  if (error) return <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>;
  if (!record) return null;
  const shownQuestIds = new Set(record.talk.map((objective) => `Quest:${objective.questId}`));
  const additionalQuests = relatedQuests.filter((link) => link.category === "quests" && !shownQuestIds.has(link.id));
  if (!record.talk.length && !additionalQuests.length) return null;
  return <section>
      <DatabaseSectionTitle className="mb-2">{t("map.citizen.questObjectives")}</DatabaseSectionTitle>
      <ProgressiveList initialCount={3} className="space-y-2">
        {record.talk.map((objective, index) => <div key={`${objective.questId}-${objective.step}-${index}`}>
          {questCard(objective.questId, displayQuestName(objective.questId, objective.quest), objective.step)}
        </div>)}
        {additionalQuests.map((link) => <div key={link.id}>
          {questCard(link.id.slice("Quest:".length), displayQuestName(link.id.slice("Quest:".length), link.name))}
        </div>)}
      </ProgressiveList>
  </section>;
};

export default MapCitizenAvailability;
