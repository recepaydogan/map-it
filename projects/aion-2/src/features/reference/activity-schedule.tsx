import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import ScheduleDetailPanel from "./schedule-detail-panel";
import type { ReferenceLink } from "./reference-types";
import { useReferenceEntries, useReferenceIndex } from "./use-reference-data";

const ActivitySchedule = ({ links }: { links: ReferenceLink[] }) => {
  const { t } = useTranslation();
  const index = useReferenceIndex();
  const ids = new Set(links.map((link) => link.id));
  const summaries = index.status === "ready"
    ? index.data.entries.filter((entry) => ids.has(entry.id) && entry.category === "schedules") : [];
  const schedules = useReferenceEntries(summaries);
  const status = index.status === "error" || index.status === "ready" && summaries.length !== ids.size || schedules.status === "error"
    ? "error" : index.status === "loading" || schedules.status === "loading" ? "loading" : "ready";

  return <section>
    <DatabaseSectionTitle>{t("reference.labels.schedule")}</DatabaseSectionTitle>
    {status !== "ready" ? <p role={status === "error" ? "alert" : "status"} className="text-sm text-subtle">
      {t(status === "error" ? "reference.error" : "reference.loading")}
    </p> : schedules.status === "ready" && <div className="space-y-4">
      {schedules.data.map((entry) => <ScheduleDetailPanel key={entry.id} entry={entry} showActivities={false} />)}
    </div>}
  </section>;
};

export default ActivitySchedule;
