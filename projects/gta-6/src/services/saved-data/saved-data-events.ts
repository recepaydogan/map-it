export const SAVED_DATA_CHANGE_EVENT = "gta6-app:user-data-changed";
export const SAVED_DATA_REFRESH_EVENT = "gta6-app:account-data-refreshed";
export const notifySavedDataChange = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SAVED_DATA_CHANGE_EVENT));
};
