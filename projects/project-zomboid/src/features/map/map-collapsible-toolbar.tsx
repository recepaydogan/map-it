import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

interface MapCollapsibleToolbarProps {
  expanded: boolean;
  children: ReactNode;
}

const MapCollapsibleToolbar = ({
  expanded,
  children,
}: MapCollapsibleToolbarProps) => {
  return (
    <div className={cn("map-collapsible-toolbar", !expanded && "map-collapsible-toolbar-collapsed")}>
      <div
        id="map-collapsible-toolbar-content"
        className="map-collapsible-toolbar-content"
        aria-hidden={!expanded}
      >
        {children}
      </div>
    </div>
  );
};

export const MapToolbarToggle = ({
  expanded,
  onExpandedChange,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) => {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      className="map-collapsible-toolbar-toggle"
      onClick={() => onExpandedChange(!expanded)}
      aria-controls="map-collapsible-toolbar-content"
      aria-expanded={expanded}
      aria-label={t(expanded ? "map.controls.hideToolbar" : "map.controls.showToolbar")}
    >
      <ChevronDown
        size={16}
        className={cn(!expanded && "rotate-180")}
        aria-hidden="true"
      />
    </button>
  );
};

export default MapCollapsibleToolbar;
