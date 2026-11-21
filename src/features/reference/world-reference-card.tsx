import { useTranslation } from "react-i18next";
import { useReferenceEntry, useReferenceIndex } from "./use-reference-data";
import WorldEntryContent from "./world-entry-content";

const WorldReferenceCard = ({ id, showLocations = true }: { id: string; showLocations?: boolean }) => {
  const { t } = useTranslation();
  const index = useReferenceIndex();
  const summary = index.status === "ready" ? index.data.entries.find((entry) => entry.id === id) : undefined;
  const state = useReferenceEntry(summary);
  if (index.status === "error" || state.status === "error" || (index.status === "ready" && !summary)) return <p role="alert" className="text-sm text-subtle">{t("reference.error")}</p>;
  if (state.status !== "ready") return <p role="status" className="text-sm text-subtle">{t("reference.loading")}</p>;
  return <WorldEntryContent entry={state.data} showLocations={showLocations} />;
};
export default WorldReferenceCard;
