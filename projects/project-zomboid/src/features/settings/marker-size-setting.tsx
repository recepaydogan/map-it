import { useId, type CSSProperties } from "react";
import { Soup } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  MARKER_SIZE_MAX_PERCENT,
  MARKER_SIZE_MIN_PERCENT,
} from "../map/map-display-preferences";

interface MarkerSizeSettingProps {
  value: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}

const MarkerSizeSetting = ({ value, onChange, onCommit }: MarkerSizeSettingProps) => {
  const { t } = useTranslation();
  const sliderId = useId();
  const previewScale = value / 100;

  return (
    <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={sliderId} className="text-[13px] font-medium text-white">
            {t("settings.markerSize")}
          </label>
          <output
            htmlFor={sliderId}
            aria-live="polite"
            className="min-w-12 rounded-[var(--radius-sm)] bg-black/30 px-2 py-1 text-center font-mono text-[12px] font-semibold text-accent"
          >
            {value}%
          </output>
        </div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
          {t("settings.markerSizeDesc")}
        </p>
        <input
          id={sliderId}
          type="range"
          min={MARKER_SIZE_MIN_PERCENT}
          max={MARKER_SIZE_MAX_PERCENT}
          step={5}
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          onPointerUp={(event) => onCommit(Number(event.currentTarget.value))}
          onKeyUp={(event) => onCommit(Number(event.currentTarget.value))}
          aria-valuetext={`${value}%`}
          className="settings-marker-size-range mt-3 block w-full"
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-500" aria-hidden="true">
          <span>{MARKER_SIZE_MIN_PERCENT}%</span>
          <span>{MARKER_SIZE_MAX_PERCENT}%</span>
        </div>
      </div>

      <div
        className="relative grid h-20 w-24 shrink-0 place-items-center self-center overflow-hidden rounded-[var(--radius-md)] border border-border bg-black/25 shadow-inner shadow-black/30"
        aria-hidden="true"
      >
        <span className="absolute inset-x-3 top-1/2 h-px bg-white/5" />
        <span className="absolute inset-y-3 left-1/2 w-px bg-white/5" />
        <span
          className="map-marker map-marker-food pointer-events-none"
          style={{ "--map-marker-size": `${24 * previewScale}px` } as CSSProperties}
        >
          <Soup size={14 * previewScale} strokeWidth={2.4} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
};

export default MarkerSizeSetting;
