import { useTranslation } from "react-i18next";
import { MapPinPlus, X } from "lucide-react";
import MapActionButton from "../../components/map-action-button";
import { useCustomMarkerUi } from "./custom-marker-ui";

/**
 * The entry point for user markers: a header button that arms "placing mode". While
 * armed the map cursor is a crosshair (see MarkerPlacer) and a centered hint tells the
 * user to click the map; the next click opens the create dialog at that spot. Clicking
 * the button again (or ESC) cancels.
 */
const AddMarkerButton = () => {
  const { t } = useTranslation();
  const placing = useCustomMarkerUi((s) => s.placing);
  const arm = useCustomMarkerUi((s) => s.arm);
  const disarm = useCustomMarkerUi((s) => s.disarm);

  return (
    <>
      <MapActionButton
        data-tour="add-marker"
        onClick={placing ? disarm : arm}
        aria-pressed={placing}
        title={placing ? t("tracking.cancelPlacing") : t("tracking.addAMarker")}
        aria-label={placing ? t("tracking.cancelPlacing") : t("tracking.addAMarker")}
        active={placing}
      >
        <MapPinPlus size={16} aria-hidden="true" />
      </MapActionButton>

      {placing && (
        <div className="pointer-events-auto fixed left-1/2 top-16 z-[1400] flex -translate-x-1/2 items-center gap-3 rounded-[var(--radius-full)] border border-accent/40 bg-surface/95 py-2 pl-4 pr-2 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fade-in">
          <MapPinPlus size={15} className="text-accent" aria-hidden="true" />
          <span className="text-[13px] font-medium text-zinc-100">
            {t("tracking.placeHint")}
          </span>
          <button
            onClick={disarm}
            className="flex items-center gap-1 rounded-[var(--radius-full)] px-2.5 py-1 text-[12px] font-medium text-zinc-400 transition-colors hover:bg-white/8 hover:text-white cursor-pointer"
          >
            <X size={13} aria-hidden="true" /> {t("tracking.cancel")}
          </button>
        </div>
      )}
    </>
  );
};

export default AddMarkerButton;
