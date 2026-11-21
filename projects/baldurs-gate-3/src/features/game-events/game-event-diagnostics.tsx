import { AlertTriangle, Download, LoaderCircle, Radio } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { downloadGameEventLog } from "./game-event-recorder";
import { useGameTrackerState } from "./game-tracker-store";

const GameEventDiagnostics = () => {
  const { t } = useTranslation();
  const tracker = useGameTrackerState();
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const observedMap = tracker.subMap || tracker.mainMap;

  const exportLog = async () => {
    setExporting(true);
    setExportFailed(false);
    try {
      await downloadGameEventLog(tracker.sessionId ?? undefined);
    } catch (error) {
      console.error("[Game events] Failed to export the event log.", error);
      setExportFailed(true);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn(
          "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] border",
          tracker.status === "listening"
            ? "border-success/40 bg-success-soft text-success-text"
            : "border-accent/30 bg-accent-soft text-accent",
        )}>
          <Radio size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-white">{t("settings.eventRecorder")}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted" aria-live="polite">
            {t(`settings.eventRecorderStatus.${tracker.status}`)}
            {observedMap ? ` · ${t("settings.eventRecorderMap", { map: observedMap })}` : ""}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-subtle">
            {t("settings.eventRecorderCalibration")}
          </p>
          {exportFailed && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-danger-text" role="alert">
              <AlertTriangle size={12} aria-hidden="true" />
              {t("settings.eventRecorderExportFailed")}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void exportLog()}
        disabled={exporting}
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-black/30 px-3 py-2 text-[12px] font-semibold text-zinc-200 transition-colors hover:bg-white/8 hover:text-white disabled:cursor-wait disabled:text-white/70"
      >
        {exporting
          ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
          : <Download size={14} aria-hidden="true" />}
        {t(exporting ? "settings.eventRecorderExporting" : "settings.eventRecorderExport")}
      </button>
    </div>
  );
};

export default GameEventDiagnostics;
