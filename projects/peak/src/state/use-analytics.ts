import { useEffect } from "react";
import {
  capturePageview,
  initAnalytics,
  setGameRunning,
} from "../utils/analytics/analytics";
import type { AnalyticsSurface } from "../utils/analytics/app-context";
import { IS_OVERWOLF } from "../utils/platform";
import { usePeakSession } from "./peak-session-store";

export const useAnalytics = (surface: AnalyticsSurface = "desktop", activeScreen?: string): void => {
  useEffect(() => {
    initAnalytics(IS_OVERWOLF ? surface : "web");
  }, [surface]);

  useEffect(() => {
    if (activeScreen) {
      capturePageview(`/${activeScreen}`);
    }
  }, [activeScreen]);

  const { isGameRunning } = usePeakSession();

  useEffect(() => {
    setGameRunning(isGameRunning);
  }, [isGameRunning]);
};
