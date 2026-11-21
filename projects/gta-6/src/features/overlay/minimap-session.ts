/** A manual hide suppresses automatic reopening for this running game process. */
const HIDDEN_PROCESS_KEY = "gta6-app:minimap-hidden-process";

export const isMinimapAutoOpenBlocked = (processId: number) =>
  Number(localStorage.getItem(HIDDEN_PROCESS_KEY)) === processId;

export const blockMinimapAutoOpen = (processId: number) => {
  if (Number.isSafeInteger(processId) && processId > 0) {
    localStorage.setItem(HIDDEN_PROCESS_KEY, String(processId));
  }
};

export const blockCurrentMinimapAutoOpen = () => {
  if (typeof overwolf === "undefined") return;
  overwolf.games?.getRunningGameInfo?.((info) => {
    if (info?.isRunning && info.processId) blockMinimapAutoOpen(info.processId);
  });
};
