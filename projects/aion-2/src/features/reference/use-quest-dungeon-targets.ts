import { useEffect, useMemo, useState } from "react";
import { questDungeonTargets, questLinkedDungeonIds, type QuestLocationTarget } from "./quest-location-targets";
import type { ReferenceEntry } from "./reference-types";
import { loadReferenceData } from "./use-reference-data";

async function referenceChunk(id: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
  return new Uint8Array(digest)[0]!.toString(16).padStart(2, "0");
}

export function useQuestDungeonTargets(entry: ReferenceEntry): QuestLocationTarget[] {
  const ids = useMemo(() => questLinkedDungeonIds(entry), [entry]);
  const [loaded, setLoaded] = useState<{ entryId: string; targets: QuestLocationTarget[] } | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all(ids.map(async (id) => {
      const chunk = await referenceChunk(id);
      const data = await loadReferenceData<{ entries: Record<string, ReferenceEntry> }>(`dungeons/${chunk}.json`);
      const dungeon = data.entries[id];
      if (!dungeon) throw new Error(`Missing dungeon reference: ${id}`);
      return dungeon;
    })).then((dungeons) => {
      if (active) setLoaded({ entryId: entry.id, targets: questDungeonTargets(entry, dungeons) });
    }).catch((error: unknown) => {
      console.error(`Quest dungeon targets could not be loaded for ${entry.id}.`, error);
      if (active) setLoaded({ entryId: entry.id, targets: [] });
    });
    return () => { active = false; };
  }, [entry, ids]);
  return loaded?.entryId === entry.id ? loaded.targets : [];
}
