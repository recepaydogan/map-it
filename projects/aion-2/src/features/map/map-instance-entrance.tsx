import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import CategoryDropdown from "../../components/category-dropdown";
import DatabaseSectionTitle from "../database/database-section-title";
import AdventureRewards from "../reference/adventure-rewards";
import { adventureFacts } from "../reference/adventure-presentation";
import DungeonCreatureList from "../reference/dungeon-creature-list";
import InstanceLayerDetails from "../reference/instance-layer-details";
import ReferenceFactBadges from "../reference/reference-fact-badges";
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
  const gameText = useGameText();
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
  if (index.status === "error" || source.status === "error" || destinations.status === "error"
    || (index.status === "ready" && !sourceSummary)
    || (source.status === "ready" && (!destinationIds.length || destinationSummaries.length !== destinationIds.length))) {
    return <p role="alert" className="mt-4 text-xs text-danger-text">{t("reference.error")}</p>;
  }
  if (index.status !== "ready" || source.status !== "ready" || destinations.status !== "ready") {
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
  return <div className="mt-4 space-y-6 border-t border-border pt-4">
    {availableDestinations.length > 1 && <CategoryDropdown ariaLabel={t("reference.adventure.selectVariant")}
      value={destination.id} onChange={setSelectedId}
      options={availableDestinations.map((entry) => ({ key: entry.id, label: gameText(entry.name) }))} />}
    <ReferenceFactBadges facts={entryFacts} layout="grid" />
    {destination.instanceLayer && <InstanceLayerDetails details={destination.instanceLayer} />}
    {!!bosses.length && <section>
      <DungeonCreatureList links={bosses} dungeonId={destination.id} bosses />
    </section>}
    {!!factionRewards.length && <div className="space-y-6">
      <AdventureRewards sections={factionRewards} />
    </div>}
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
