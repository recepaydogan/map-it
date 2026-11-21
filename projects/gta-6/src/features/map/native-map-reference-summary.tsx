import { useTranslation } from "react-i18next";
import type { ReferenceTarget } from "../reference/reference-types";
import { useNativeJson, type NativeWikiEntry } from "../reference/use-native-wiki";
import NativeMarkerRewards from "./native-marker-rewards";
import NativeMapLinkedItemContent from "./native-map-linked-item-content";
import DatabaseSectionTitle from "../database/database-section-title";
import { nativeEntryName } from "../reference/native-wiki-presentation";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import { nativeMarkerContentPolicy } from "./native-marker-content-policy";
import NativeBellGuide from "./native-bell-guide";
import { nativeMarkerRewardsForPoint } from "./native-marker-reward-model";
import NativeQuestObjectives from "../reference/native-quest-objectives";

/** Compact marker preview backed by the same record as the full wiki panel. */
export default function NativeMapReferenceSummary({ reference, markerId, markerCategory }: { reference: ReferenceTarget; markerId: string; markerCategory:string }) {
  const { t } = useTranslation();
  const open = useReferenceNavigation();
  const state = useNativeJson<NativeWikiEntry>(`data/wiki/entries/${reference.id}.json`);
  if (state.status !== "ready") return <p className="mt-4 text-xs text-subtle" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const entry = state.data;
  const policy = nativeMarkerContentPolicy(entry,markerCategory);
  const spawn = entry.spawnAnchors?.find(anchor => anchor.id === markerId);
  const flags = spawn?.native_conditions;
  const info = flags?.SpawnInfo as Record<string, unknown> | undefined;
  const conditions = [
    (flags?.ShouldSpawn === false || flags?.InitialSpawn === false) && "initiallyInactive",
    (info?.bHiddenByDefault === true || flags?.bHidden === true) && "initiallyHidden",
    info?.bStartAIOnPlayerEnterDomain === true && "startsOnEntry",
    info?.bStopAIOnPlayerExitDomain === true && "stopsOnExit",
    flags?.SetShouldNotSpawnAfterDead === true && "noRespawnAfterDeath",
    flags?.AutoRespawnOnDead === true && "automaticRespawn",
  ].filter((key): key is string => typeof key === "string");
  const events = [...new Set(entry.sceneEvents?.filter(event => event.target_spawn_ids.includes(markerId)).map(event => event.kind))];
  const rules = entry.encounterRules?.filter(rule => rule.target_spawn_ids.includes(markerId)) ?? [];
  const rewards = nativeMarkerRewardsForPoint(entry, markerId);
  return <div className="native-map-reference-summary mt-4 space-y-5 border-t border-border pt-4 text-xs leading-relaxed text-subtle">
    <NativeMapLinkedItemContent entry={entry} markerCategory={markerCategory} rewardIds={new Set(rewards.flatMap(row => row.items?.map(item => item.id) ?? []))}>
    {entry.quest && <NativeQuestObjectives entry={entry} markerId={markerId} />}
    <NativeMarkerRewards rows={rewards} currencySources={entry.combatLoot} />
    {policy.showBellGuide && <NativeBellGuide bellId={entry.nativeId} />}
    {policy.showAppearanceConditions && (conditions.length > 0 || rules.length > 0 || events.length > 0) && <section><DatabaseSectionTitle>{t("wiki.marker.appearance")}</DatabaseSectionTitle><ul className="space-y-2 text-zinc-300">{[...conditions,...events].map(key => <li key={key}>{t(`wiki.marker.${key}`)}</li>)}{rules.map(rule => <li key={rule.id}><p>{t(`wiki.marker.${rule.kind}`)}</p>{rule.sourceActors.length > 0 && <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{rule.sourceActors.map(actor => <button type="button" key={actor.id} onClick={() => open(actor)} className="cursor-pointer text-accent hover:underline">{nativeEntryName(actor)}</button>)}</div>}</li>)}</ul></section>}
    </NativeMapLinkedItemContent>
  </div>;
}
