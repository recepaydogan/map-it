export const SAVED_DATA_CHANGE_EVENT = "map-it:user-data-changed";
export const SAVED_DATA_REFRESH_EVENT = "map-it:account-data-refreshed";
export const notifySavedDataChange = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SAVED_DATA_CHANGE_EVENT));
};
