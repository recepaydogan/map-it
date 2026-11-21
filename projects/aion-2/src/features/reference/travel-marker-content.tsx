import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import TravelDestination from "./travel-destination";
import TravelDetails from "./travel-details";
import TravelPortalAccess from "./travel-portal-access";
import type { ReferenceEntry, ReferenceLocation } from "./reference-types";

const TravelMarkerContent = ({ entries, marker }: {
  entries: ReferenceEntry[]; marker: Pick<ReferenceLocation, "mapId" | "markerId">;
}) => {
  const { t } = useTranslation();
  return <div className="mt-4 space-y-4">
    {entries.length === 0 && <p className="text-xs text-muted">{t("reference.travel.noDetails")}</p>}
    {entries.map((entry) => <section key={entry.id} className="space-y-2">
      {entry.travel?.kind === "teleport"
      ? <TravelDetails entry={entry} />
      : <>
        <DatabaseSectionTitle>{t("reference.labels.destination")}</DatabaseSectionTitle>
        <TravelDestination entry={entry} currentMarker={marker} />
        {entry.travel?.kind === "portal" && <TravelPortalAccess entry={entry} />}
      </>}
    </section>)}
  </div>;
};

export default TravelMarkerContent;
