import { useTranslation } from "react-i18next";
import RiftScheduleTimer from "../events/rift-schedule-timer";
import type { ScheduleData } from "../intelligence/intelligence-types";
import { useIntelligenceData } from "./use-reference-data";

export default function RiftTravelSchedule({ riftId }: { riftId: string }) {
  const { t } = useTranslation();
  const state = useIntelligenceData<ScheduleData>("schedules");
  if (state.status === "loading") return null;
  if (state.status === "error") return <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>;
  const schedule = state.data.schedules.find((entry) => entry.kind === "rift" && entry.riftId === riftId);
  return schedule ? <RiftScheduleTimer schedule={schedule} /> : null;
}
