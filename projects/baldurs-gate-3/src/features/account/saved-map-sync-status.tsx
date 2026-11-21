import { useSyncExternalStore } from "react";
import { getSavedMapSyncStatus, subscribeSavedMapSync } from "../map/saved-map-sync";

const LABELS = {
  idle: "Map saves are stored on this device.",
  syncing: "Syncing your map saves…",
  synced: "Your map saves are synced to your account.",
  error: "Your changes are saved on this device. Cloud sync will retry automatically.",
};

const SavedMapSyncStatus = () => {
  const status = useSyncExternalStore(subscribeSavedMapSync, getSavedMapSyncStatus, () => "idle" as const);
  return <p role="status" className="mt-3 text-[12px] leading-relaxed text-subtle">{LABELS[status]}</p>;
};

export default SavedMapSyncStatus;
