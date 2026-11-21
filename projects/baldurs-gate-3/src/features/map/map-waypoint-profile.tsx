import { MapPinned } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapWaypointProfile as MapWaypointProfileData } from "./types";

const MapWaypointProfile = ({ waypoint }: { waypoint: MapWaypointProfileData }) => {
  const { t } = useTranslation();

  return (
    <section className="map-waypoint-profile" aria-labelledby={`waypoint-${waypoint.shrineId}`}>
      <div className="flex items-center gap-2">
        <MapPinned size={14} className="text-sky-300" aria-hidden="true" />
        <h3 id={`waypoint-${waypoint.shrineId}`}>{t("map.waypoint.title")}</h3>
        <span>{t(`map.waypoint.groups.${waypoint.group}`, { defaultValue: waypoint.group })}</span>
      </div>
    </section>
  );
};

export default MapWaypointProfile;
