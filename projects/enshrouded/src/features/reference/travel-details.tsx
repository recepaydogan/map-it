import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import ReferenceLocations from "./reference-locations";
import ReferenceSections, { ReferenceFacts } from "./reference-sections";
import TravelDestination from "./travel-destination";
import TravelWaypointDetails from "./travel-waypoint-details";
import { travelValueKey } from "./travel-presentation";
import TravelPortalAccess from "./travel-portal-access";
import { hasNoPortalCurrencyCost } from "./travel-portal-cost";
import RiftTravelSchedule from "./rift-travel-schedule";
import type { ReferenceEntry } from "./reference-types";

const TravelDetails = ({ entry, onOpenMap }: {
  entry: ReferenceEntry; onOpenMap?: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const destination = entry.sections.find((section) => section.title === "reference.labels.destination");
  const cost = entry.sections.find((section) => section.title === "reference.labels.travel-cost");
  const quest = entry.sections.find((section) => section.title === "reference.labels.unlock-quest");
  const remaining = entry.sections.filter((section) => ![destination, cost, quest].includes(section));
  const facts = entry.facts.filter((fact) => fact.value !== 0 && fact.value !== false && fact.value !== "None"
    && !(cost?.links?.length && ["reference.labels.travel-cost", "reference.labels.travel-item-cost"].includes(fact.label)))
    .map((fact) => ({ ...fact, value: typeof fact.value === "string" ? t(travelValueKey(fact.value) ?? fact.value) : fact.value }));
  return <div className="space-y-5">
    {entry.travel?.kind === "rift" && <RiftTravelSchedule riftId={entry.id} />}
    {entry.travel?.kind === "teleport" ? <TravelWaypointDetails /> : <section className="space-y-2 rounded-[var(--radius-md)] border border-accent/20 bg-accent-soft p-3">
      <DatabaseSectionTitle>{t("reference.labels.destination")}</DatabaseSectionTitle>
      <TravelDestination entry={entry} />
      {entry.description && <p className="whitespace-pre-line text-[12px] leading-relaxed text-zinc-300">{entry.description}</p>}
    </section>}
    {cost ? <ReferenceSections sections={[cost]} /> : entry.travel?.kind !== "rift" && !hasNoPortalCurrencyCost(entry) && <p className="text-xs text-muted">{t("reference.travel.costUnknown")}</p>}
    {entry.travel?.kind === "portal" ? <>
      <TravelPortalAccess entry={entry} />
      {quest && <ReferenceSections sections={[quest]} />}
    </> : <section>
      <DatabaseSectionTitle>{t("reference.travel.requirements")}</DatabaseSectionTitle>
      <ReferenceFacts facts={facts} />
      {quest && <div className="mt-3"><ReferenceSections sections={[quest]} /></div>}
    </section>}
    {onOpenMap && <section>
      {entry.travel?.kind !== "teleport" && entry.travel?.kind !== "rift" && <p className="mb-2 text-[11px] text-muted">{t(entry.locations.length ? "reference.travel.sourceLocations" : "reference.travel.noMarker")}</p>}
      {entry.locations.length > 0 && <ReferenceLocations locations={entry.locations} onOpenMap={onOpenMap} />}
    </section>}
    {remaining.length > 0 && <ReferenceSections sections={remaining} />}
  </div>;
};

export default TravelDetails;
