import { Info } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../components/tooltip";
import { cn } from "../../lib/cn";
import type { MapCharacterProfile } from "./map-character-profiles";

interface MapCharacterFilterProps {
  selectedCharacter: MapCharacterProfile | null;
  enabled: boolean;
  onToggle: () => void;
}

/** Character selection belongs to the toolbar; this switch only controls map filtering. */
export default function MapCharacterFilter({ selectedCharacter, enabled, onToggle }: MapCharacterFilterProps) {
  const { t } = useTranslation();
  const descriptionId = useId();
  const label = selectedCharacter
    ? t("map.characters.filterSelected", { charName: selectedCharacter.name })
    : t("map.characters.filterFor");
  const description = t(selectedCharacter ? "map.characters.filterInfo" : "map.characters.selectForFilter");

  return (
    <div className="map-character-filter">
      <button type="button" role="switch" aria-checked={enabled}
        aria-label={label}
        title={selectedCharacter ? label : description}
        disabled={!selectedCharacter} onClick={onToggle}
        className={cn("map-character-filter-control", enabled && "map-character-filter-control-active")}>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {label}
        </span>
        <span aria-hidden="true" className="map-character-filter-switch"><span /></span>
      </button>
      <Tooltip label={description} side="bottom" align="end" wrap openOnClick className="shrink-0">
        <button type="button" className="map-character-filter-info"
          aria-label={t("map.characters.filterInfoLabel")} aria-describedby={descriptionId}>
          <Info size={14} aria-hidden="true" />
        </button>
      </Tooltip>
      <span id={descriptionId} className="sr-only">{description}</span>
    </div>
  );
}
