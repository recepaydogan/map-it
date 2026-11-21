import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { mergeLocationLootProfile } from "./map-loot-utils";
import MapLootProfile from "./map-loot-profile";
import type { MapLocation, MapMetadata } from "./types";

interface OverlayLootPanelProps {
  location: MapLocation;
  data: MapMetadata;
  onClose: () => void;
}

/** A deliberately narrow minimap detail: the selected location is already
 * identified by its highlighted pin, so only its possible loot earns space. */
const OverlayLootPanel = ({ location, data, onClose }: OverlayLootPanelProps) => {
  const { t } = useTranslation();
  const profile = mergeLocationLootProfile(location, data);
  if (!profile) return null;

  return (
    <aside className="overlay-loot-panel" data-map-ui>
      <button
        type="button"
        onClick={onClose}
        className="overlay-loot-panel-close"
        aria-label={t("chrome.close")}
        title={t("chrome.close")}
      >
        <X size={14} aria-hidden="true" />
      </button>
      <MapLootProfile profile={profile} compact />
    </aside>
  );
};

export default OverlayLootPanel;
