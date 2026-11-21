import { useTranslation } from "react-i18next";
import RiftScheduleTimer from "../events/rift-schedule-timer";
import type { ScheduleData } from "../intelligence/intelligence-types";
import { useIntelligenceData } from "../reference/use-reference-data";

const MapRiftSchedule = ({ mapId, sourceActor, entityId }: { mapId: string; sourceActor?: string; entityId?: string }) => {
  const { t } = useTranslation();
  const state = useIntelligenceData<ScheduleData>("schedules", !!sourceActor || !!entityId);
  if ((!sourceActor && !entityId) || state.status === "loading") return null;
  if (state.status === "error") return <p role="alert" className="mt-4 text-xs text-danger-text">{t("reference.error")}</p>;
  const schedule = state.data.schedules.find((entry) => entry.kind === "rift"
    && (entry.spawnerName === sourceActor || entry.entityId === entityId)
    && entry.points.some((point) => point.mapId === mapId));
  if (!schedule?.cycleMinutes) return null;
  return <RiftScheduleTimer schedule={schedule} withDivider />;
};

export default MapRiftSchedule;
