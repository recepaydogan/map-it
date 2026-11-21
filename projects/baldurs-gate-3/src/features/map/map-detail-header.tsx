import { MapPin, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import MapPointIcon from "./map-point-icon";
import type { MapItemSprite } from "./use-map-item-visuals";

interface MapDetailHeaderProps {
  title: ReactNode;
  label: string;
  location: string;
  markerClass: string;
  icon: LucideIcon;
  nativeIconPath?: string;
  sprite?: MapItemSprite;
  /** Set when a back link sits directly above, which owns the top spacing. */
  tightTop?: boolean;
  onClose: () => void;
}

/** Fixed marker identity card, matching the Elden Ring detail-panel header. */
const MapDetailHeader = ({
  title,
  label,
  location,
  markerClass,
  icon,
  nativeIconPath,
  sprite,
  tightTop = false,
  onClose,
}: MapDetailHeaderProps) => {
  const { t } = useTranslation();

  return (
    <header className={cn(
      "relative mb-4 flex shrink-0 items-start gap-3 border-b border-border bg-surface/95 px-4 pb-4 backdrop-blur-xl",
      tightTop ? "pt-2.5" : "pt-4",
    )}>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("map.details.back")}
        className="absolute right-3 top-3 grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/8 hover:text-white"
      >
        <X size={16} aria-hidden="true" />
      </button>

      <span className={cn("map-detail-header-icon", markerClass)}>
        <MapPointIcon fallback={icon} source={nativeIconPath} sprite={sprite} size={28} />
      </span>
      <div className="min-w-0 flex-1 pr-8">
        {title}
        {label && <p className="mt-0.5 text-xs text-muted">{label}</p>}
        {location && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-subtle">
            <MapPin size={11} className="text-accent" aria-hidden="true" />
            {location}
          </p>
        )}
      </div>
    </header>
  );
};

export default MapDetailHeader;
