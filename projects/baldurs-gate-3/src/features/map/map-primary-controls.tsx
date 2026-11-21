import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

interface MapPrimaryControlsProps {
  filtersOpen: boolean;
  onToggleFilters: () => void;
}

/** The top-left menu button reports whether the filter panel is open. */
const MapPrimaryControls = ({
  filtersOpen,
  onToggleFilters,
}: MapPrimaryControlsProps) => {
  const { t } = useTranslation();

  return (
    <div className="map-primary-controls" data-map-ui>
      <div className="map-primary-control-bar">
        <button
          type="button"
          data-tour="filters-trigger"
          onClick={onToggleFilters}
          aria-expanded={filtersOpen}
          className={cn(filtersOpen && "map-primary-control-active")}
        >
          <Menu size={16} aria-hidden="true" />
          <span>{t("map.sidebar.menu")}</span>
        </button>
      </div>
    </div>
  );
};

export default MapPrimaryControls;
