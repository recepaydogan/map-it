import { initAnalytics, setGameRunning } from "../services/analytics/analytics";

/** Keep game context current for background events such as the first GEP position. */
export const reportGameRunning = (running: boolean, title?: string | null): void => {
  setGameRunning(running, title);
};

/** Initialize the background client without tracking window or session lifecycles. */
export const startBackgroundAnalytics = (): void => {
  initAnalytics("background");
};
