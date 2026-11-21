import { useTranslation } from "react-i18next";
import TravelMarkerContent from "./travel-marker-content";
import type { ReferenceSummary } from "./reference-types";
import { useReferenceEntries, useReferenceIndex } from "./use-reference-data";

const MarkerTravelEntries = ({ summary, mapId, markerId }: { summary: ReferenceSummary; mapId: string; markerId: string }) => {
  const { t } = useTranslation();
  const state = useReferenceEntries([summary], "travel");
  if (state.status !== "ready") return <p role={state.status === "error" ? "alert" : "status"} className="text-xs text-muted">{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  return <TravelMarkerContent entries={state.data.filter((entry) => entry.category === "travel")} marker={{ mapId, markerId }} />;
};

const MapMarkerTravel = ({ reference, mapId, markerId }: { reference?: { category: string; id: string }; mapId: string; markerId: string }) => {
  const { t } = useTranslation();
  const index = useReferenceIndex();
  if (index.status !== "ready") return <p className="mt-3 text-xs text-muted" role={index.status === "error" ? "alert" : "status"}>{t(index.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const summary = index.data.entries.find((entry) => entry.id === reference?.id);
  return summary ? <MarkerTravelEntries key={summary.id} summary={summary} mapId={mapId} markerId={markerId} /> : <p className="mt-3 text-xs text-muted">{t("reference.travel.noDetails")}</p>;
};

export default MapMarkerTravel;
