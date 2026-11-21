import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";

interface QuestIdentity { id?: string; key?: string; name: string }
export interface QuestRequirements {
  title: string;
  classes?: QuestIdentity[];
  profession?: QuestIdentity;
  /** Advisory association from the matching Classic quest, not verified Forever eligibility. */
  classicProfessionReference?: QuestIdentity;
  races?: QuestIdentity[];
  /** Progress needed to finish the quest, not a threshold for accepting it. */
  skillObjective?: { professionKey: string; level: number };
  learnProfession?: QuestIdentity;
}
interface RequirementsCatalog { version: 1; quests: Record<string, QuestRequirements> }

let catalogRequest: Promise<RequirementsCatalog> | undefined;
const loadRequirements = () => {
  catalogRequest ??= fetch(contentUrl("data/quests/requirements.json"))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Quest requirements: HTTP ${response.status}`);
      const data: RequirementsCatalog = await response.json();
      if (data.version !== 1 || !data.quests) throw new Error("Invalid quest requirements");
      return data;
    }).catch((error: unknown) => { catalogRequest = undefined; throw error; });
  return catalogRequest;
};

export function useQuestRequirements(questId?: string) {
  const [catalog, setCatalog] = useState<RequirementsCatalog>();
  const [error, setError] = useState(false);
  const hasQuestId = !!questId && /^\d+$/.test(questId);
  useEffect(() => {
    if (!hasQuestId) return;
    let active = true;
    void loadRequirements().then((data) => {
      if (active) { setCatalog(data); setError(false); }
    }).catch((cause: unknown) => {
      console.error("Failed to load quest requirements", cause);
      if (active) setError(true);
    });
    return () => { active = false; };
  }, [hasQuestId]);
  return { requirements: hasQuestId ? catalog?.quests[questId] : undefined, error: hasQuestId && error };
}
