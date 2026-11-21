import { useTranslation } from "react-i18next";
import {
  MINIMAP_OPACITY_MAX_PERCENT,
  MINIMAP_OPACITY_MIN_PERCENT,
  MINIMAP_OPACITY_STEP_PERCENT,
} from "./map-display-preferences";
import { useMapDisplayPreferences } from "./use-map-display-preferences";

const MinimapOpacitySlider = () => {
  const { t, i18n } = useTranslation();
  const { preferences, update } = useMapDisplayPreferences();
  const percent = preferences.minimapOpacityPercent;
  const displayPercent = new Intl.NumberFormat(i18n.language, { style: "percent" }).format(percent / 100);

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={MINIMAP_OPACITY_MIN_PERCENT}
        max={MINIMAP_OPACITY_MAX_PERCENT}
        step={MINIMAP_OPACITY_STEP_PERCENT}
        value={percent}
        onChange={(event) => update({ minimapOpacityPercent: Number(event.currentTarget.value) })}
        aria-label={t("settings.minimapOpacity")}
        aria-valuetext={displayPercent}
        className="w-full min-w-0 cursor-pointer accent-neutral-300"
      />
      <span aria-hidden="true" className="w-[5ch] shrink-0 text-end text-xs font-semibold tabular-nums text-white">
        {displayPercent}
      </span>
    </div>
  );
};

export default MinimapOpacitySlider;
