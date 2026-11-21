import { useTranslation } from "react-i18next";
import type { ReferenceSummary } from "../reference/reference-types";
import { useReferenceEntry } from "../reference/use-reference-data";
import MapItemPanel from "./map-item-panel";

const MapRecipePanel = ({ summary, onOpenMap }: {
  summary: ReferenceSummary;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const state = useReferenceEntry(summary);
  if (state.status !== "ready") return <p className="p-4 text-sm text-subtle" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const output = state.data.sections.find((section) => section.title === "reference.labels.produces")
    ?.links?.find((link) => link.category === "items");
  return output ? <MapItemPanel itemId={output.id} initialRecipeId={summary.id} onOpenMap={onOpenMap} />
    : <p className="p-4 text-sm text-subtle">{t("database.noSectionData")}</p>;
};

export default MapRecipePanel;
