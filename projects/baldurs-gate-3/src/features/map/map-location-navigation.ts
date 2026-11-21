export interface MapLocationNavigationTarget {
  mapId: string;
  locationId: string;
  /** Set by links inside an open detail panel: the target stacks on top of the
   *  panel that requested it instead of replacing it. */
  drill?: boolean;
}

const EVENT_NAME = "game-maps:navigate-to-location";

export const requestMapLocationNavigation = (target: MapLocationNavigationTarget) => {
  window.dispatchEvent(new CustomEvent<MapLocationNavigationTarget>(EVENT_NAME, { detail: target }));
};

export const subscribeToMapLocationNavigation = (
  listener: (target: MapLocationNavigationTarget) => void,
) => {
  const handleEvent = (event: Event) => listener(
    (event as CustomEvent<MapLocationNavigationTarget>).detail,
  );
  window.addEventListener(EVENT_NAME, handleEvent);
  return () => window.removeEventListener(EVENT_NAME, handleEvent);
};
