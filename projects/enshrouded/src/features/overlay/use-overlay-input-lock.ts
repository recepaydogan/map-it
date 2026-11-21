import { useCallback, useEffect, useState } from "react";
import {
  OVERLAY_INPUT_LOCK_EVENT,
  OVERLAY_INPUT_LOCK_STORAGE_KEY,
  readOverlayInputLocked,
} from "./overlay-preferences";

export const useOverlayInputLocked = () => {
  const [inputLocked, setInputLocked] = useState(readOverlayInputLocked);
  const refresh = useCallback(() => setInputLocked(readOverlayInputLocked()), []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== OVERLAY_INPUT_LOCK_STORAGE_KEY && event.key !== null) return;
      refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(OVERLAY_INPUT_LOCK_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(OVERLAY_INPUT_LOCK_EVENT, refresh);
    };
  }, [refresh]);

  return inputLocked;
};
