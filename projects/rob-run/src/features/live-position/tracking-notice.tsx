import { LocateFixed, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLivePosition } from "./live-position-store";
import { useTrackingStatus } from "./tracking-status";

const MINIMAP_DISMISSED_KEY = "wfm:minimap-tracking-notice-dismissed:v1";
const readMinimapDismissed = () => {
  try { return localStorage.getItem(MINIMAP_DISMISSED_KEY) === "1"; }
  catch { return false; }
};

export default function TrackingNotice({ compact = false, inline = false }: { compact?: boolean; inline?: boolean }) {
  const { t } = useTranslation();
  const status = useTrackingStatus();
  const livePosition = useLivePosition();
  const [dismissed, setDismissed] = useState(() => compact && readMinimapDismissed());
  if (dismissed || (!compact && status === "disabled") || status === "live" || livePosition.status === "live") return null;
  return (
    <div className={`tracking-notice${compact ? " tracking-notice-compact" : ""}${inline ? " tracking-notice-inline" : ""}`} role="status" data-map-ui>
      <LocateFixed size={compact ? 15 : 18} aria-hidden="true" className="shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <strong className="block text-xs text-white">{t("positionAddon.trackingTitle")}</strong>
        <p className="mt-1 text-xs leading-relaxed text-zinc-200">{t(compact ? "announcements.liveTracking.minimapBody" : `gepSync.tracking.${status}`)}</p>
      </div>
      <button type="button" onClick={() => {
        setDismissed(true);
        if (compact) {
          try { localStorage.setItem(MINIMAP_DISMISSED_KEY, "1"); }
          catch { /* Session dismissal still works when storage is unavailable. */ }
        }
      }}
        aria-label={t("positionAddon.dismissTrackingNotice")}
        className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded text-muted hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
