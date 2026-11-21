import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import DatabaseSectionTitle from "../database/database-section-title";
import AdventureRewards from "../reference/adventure-rewards";
import { adventureFacts } from "../reference/adventure-presentation";
import DungeonCreatureList from "../reference/dungeon-creature-list";
import ReferenceFactBadges from "../reference/reference-fact-badges";
import ReferenceSections from "../reference/reference-sections";
import type { ReferenceSummary } from "../reference/reference-types";
import { useReferenceEntries, useReferenceEntry, useReferenceIndex } from "../reference/use-reference-data";

const ENTRY_FACTS = new Set([
  "reference.labels.minimum-party-size", "reference.labels.maximum-party-size",
  "reference.labels.minimum-level", "reference.labels.maximum-level",
]);
const FACTION_REWARDS = new Set(["reference.labels.faction-rewards-light", "reference.labels.faction-rewards-dark"]);

const MapInstanceEntrance = ({ referenceId }: {
  referenceId: string;
}) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState("");
  const index = useReferenceIndex();
  const indexData = index.status === "ready" ? index.data : undefined;
  const summaries = useMemo(() => indexData
    ? new Map(indexData.entries.map((entry) => [entry.id, entry])) : undefined, [indexData]);
  const sourceSummary = summaries?.get(referenceId);
  const source = useReferenceEntry(sourceSummary);
  const destinationIds = source.status === "ready"
    ? source.data.sections.filter((section) => section.title === "reference.adventure.entranceDestinations")
      .flatMap((section) => section.links ?? []).filter((link) => link.category === "dungeons").map((link) => link.id)
    : [];
  const destinationSummaries = destinationIds.map((id) => summaries?.get(id))
    .filter((entry): entry is ReferenceSummary => entry?.category === "dungeons");
  const destinations = useReferenceEntries(destinationSummaries);
  const selectedDestination = destinations.status === "ready"
    ? destinations.data.find((entry) => entry.id === selectedId) ?? destinations.data[0]
    : undefined;
  const questLinks = selectedDestination?.instanceLayer?.questAccess ?? [];
  const rewardQuestSummaries = questLinks.map((link) => summaries?.get(link.id))
    .filter((entry): entry is ReferenceSummary => entry?.category === "quests");
  const rewardQuests = useReferenceEntries(rewardQuestSummaries);
  if (index.status === "error" || source.status === "error" || destinations.status === "error"
    || rewardQuests.status === "error"
    || (index.status === "ready" && !sourceSummary)
    || (source.status === "ready" && (!destinationIds.length || destinationSummaries.length !== destinationIds.length))
    || (questLinks.length !== rewardQuestSummaries.length)) {
    return <p role="alert" className="mt-4 text-xs text-danger-text">{t("reference.error")}</p>;
  }
  if (index.status !== "ready" || source.status !== "ready" || destinations.status !== "ready"
    || rewardQuests.status !== "ready") {
    return <p role="status" className="mt-4 text-xs text-subtle">{t("reference.loading")}</p>;
  }

  const availableDestinations = destinationIds.map((id) => destinations.data.find((entry) => entry.id === id)!);
  const destination = selectedDestination!;
  const entryFacts = adventureFacts([
    ...destination.facts,
    ...destination.sections.filter((section) => section.title === "reference.labels.entry-requirements")
      .flatMap((section) => section.facts ?? []),
  ], t).filter((fact) => ENTRY_FACTS.has(fact.label));
  const bosses = destination.sections.filter((section) => ["reference.labels.bosses", "reference.labels.boss"].includes(section.title))
    .flatMap((section) => section.links ?? []);
  const factionRewards = destination.sections.filter((section) => FACTION_REWARDS.has(section.title));
  const completionRewards = rewardQuests.data.map((entry) => ({
    quest: entry,
    sections: entry.sections.filter((section) => ["reference.labels.rewards", "reference.labels.choose-a-reward"].includes(section.title)),
  })).filter(({ sections }) => sections.length > 0);
  return <div className="mt-4 space-y-6 border-t border-border pt-4">
    {availableDestinations.length > 1 && <CategoryDropdown ariaLabel={t("reference.adventure.selectVariant")}
      value={destination.id} onChange={setSelectedId}
      options={availableDestinations.map((entry) => ({ key: entry.id, label: entry.name }))} />}
    <ReferenceFactBadges facts={entryFacts} layout="grid" />
    {!!bosses.length && <section>
      <DungeonCreatureList links={bosses} dungeonId={destination.id} bosses />
    </section>}
    {!!factionRewards.length && <div className="space-y-6">
      <AdventureRewards sections={factionRewards} />
    </div>}
    {!!completionRewards.length && <section className="space-y-3">
      {completionRewards.length > 1 && <DatabaseSectionTitle>{t("map.instanceEntrance.questRewards")}</DatabaseSectionTitle>}
      {completionRewards.map(({ quest, sections }) => <div key={quest.id} className="space-y-2">
        {completionRewards.length > 1 && <p className="text-xs font-medium text-zinc-200">{quest.name}</p>}
        <ReferenceSections sections={completionRewards.length === 1 ? sections.map((section) => ({
          ...section,
          title: section.title === "reference.labels.rewards" ? "map.instanceEntrance.questRewards" : section.title,
        })) : sections} />
      </div>)}
    </section>}
    {(["enemies", "characters"] as const).map((kind) => {
      const links = destination.dungeonContents?.[kind] ?? [];
      return links.length > 0 && <section key={kind} className="space-y-3">
        <DatabaseSectionTitle>{t(`reference.adventure.contentKinds.${kind}`)}</DatabaseSectionTitle>
        <DungeonCreatureList links={links} dungeonId={destination.id} />
      </section>;
    })}
  </div>;
};

export default MapInstanceEntrance;
