import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { getLivePosition, subscribeLivePosition } from "./live-position-store";

// Subscribe to the state string only; coordinate samples do not render settings.
const getState = () => getLivePosition().state;
export const LivePositionStatus = () => {
  const { t } = useTranslation();
  const state = useSyncExternalStore(subscribeLivePosition, getState, getState);
  const key = state === "identity-unverified" ? "identifying" : state === "tracking" ? "tracking" : state === "access-denied" ? "accessDenied"
    : state === "game-not-running" ? "waiting" : state === "unsupported-map" ? "unsupported"
      : ["reader-error", "reader-timeout", "plugin-unavailable"].includes(state) ? "error" : "locating";
  return <div className="border-t border-border px-4 py-4">
    <p className="text-[13px] font-medium text-white">{t("map.livePosition.title")}</p>
    <p className="mt-1 text-[12px] text-muted">{t(`map.livePosition.${key}`)}</p>
  </div>;
};
