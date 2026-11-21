export const SAVED_DATA_CHANGE_EVENT = "phantom-blade-app:user-data-changed";
export const SAVED_DATA_REFRESH_EVENT = "phantom-blade-app:account-data-refreshed";
export const notifySavedDataChange = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SAVED_DATA_CHANGE_EVENT));
};
