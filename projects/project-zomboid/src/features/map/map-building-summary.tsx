import { Building2, Layers3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapLocation } from "./types";

interface MapBuildingSummaryProps {
  location: MapLocation;
}

const MapBuildingSummary = ({ location }: MapBuildingSummaryProps) => {
  const { t } = useTranslation();
  if (!location.roomCount && !location.roomTypes?.length) return null;
  const floors = location.floors ?? [];
  const floorLabel = floors.length > 0
    ? floors.length === 1 ? String(floors[0]) : `${floors[0]}–${floors.at(-1)}`
    : "–";

  return (
    <section className="mt-3 rounded-[var(--radius-md)] border border-white/8 bg-black/15 p-3">
      <div className="flex items-center gap-3 text-[12px] text-zinc-300">
        <span className="flex items-center gap-1.5">
          <Building2 size={13} className="text-accent" aria-hidden="true" />
          {t("map.details.roomCount", { count: location.roomCount ?? location.roomTypes?.length ?? 0 })}
        </span>
        <span className="flex items-center gap-1.5">
          <Layers3 size={13} className="text-accent" aria-hidden="true" />
          {t("map.details.floors")}: {floorLabel}
        </span>
      </div>
      {location.roomTypes && location.roomTypes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1" aria-label={t("map.details.rooms")}>
          {location.roomTypes.map((room) => (
            <span key={room} className="rounded-[6px] bg-white/6 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {room}
            </span>
          ))}
        </div>
      )}
    </section>
  );
};

export default MapBuildingSummary;
