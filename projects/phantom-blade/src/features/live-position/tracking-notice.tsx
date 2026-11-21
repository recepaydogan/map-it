import { GAME_CONFIG } from "../../game-config";
import { LocateFixed, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLivePosition } from "./live-position-store";
import { useTrackingStatus } from "./tracking-status";

export default function TrackingNotice({ compact = false, inline = false }: { compact?: boolean; inline?: boolean }) {
  const { t } = useTranslation();
  const status = useTrackingStatus();
  const livePosition = useLivePosition();
  const [dismissed, setDismissed] = useState(false);
  if (!GAME_CONFIG.features.livePosition || dismissed || status === "live" || livePosition.status === "live") return null;
  return (
    <div className={`tracking-notice${compact ? " tracking-notice-compact" : ""}${inline ? " tracking-notice-inline" : ""}`} role="status" data-map-ui>
      <LocateFixed size={compact ? 15 : 18} aria-hidden="true" className="shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <strong className="block text-xs text-white">{t("positionAddon.trackingTitle")}</strong>
        <p className="mt-1 text-xs leading-relaxed text-muted">{t(`positionAddon.status.${status}`)}</p>
        {status === "reload-required" && <code className="mt-1.5 inline-block rounded border border-border bg-white/5 px-2 py-0.5 text-xs text-white">/reload</code>}
      </div>
      <button type="button" onClick={() => setDismissed(true)}
        aria-label={t("positionAddon.dismissTrackingNotice")}
        className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded text-muted hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
