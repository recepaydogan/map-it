import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface MapDataStateProps {
  error?: string | null;
  /** The overlay minimap is ~256px tall. The full state card reserves 420px of
   * height, which pushes its centred contents well below the visible middle,
   * so that surface gets a spinner and one line instead. */
  compact?: boolean;
}

const MapDataState = ({ error, compact = false }: MapDataStateProps) => {
  const { t } = useTranslation();
  const icon = error
    ? <AlertTriangle size={compact ? 20 : 28} className="mx-auto text-warning" aria-hidden="true" />
    : <LoaderCircle size={compact ? 20 : 28} className="mx-auto animate-spin text-accent" aria-hidden="true" />;
  const title = error ? t("map.data.errorTitle") : t("map.data.loadingTitle");

  if (compact) {
    return (
      <div
        className="grid h-full min-h-0 place-items-center bg-map-surface p-3 text-center"
        role="status"
        aria-live="polite"
      >
        <div>
          {icon}
          <p className="mt-2 text-xs font-semibold text-white">{title}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-[420px] place-items-center bg-map-surface p-8 text-center">
      <div className="max-w-sm">
        {icon}
        <h2 className="mt-4 text-base font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-5 text-white/70">
          {error ? t("map.data.errorBody") : t("map.data.loadingBody")}
        </p>
        {error && <code className="mt-3 block text-[13px] text-white/70">{error}</code>}
      </div>
    </div>
  );
};

export default MapDataState;
