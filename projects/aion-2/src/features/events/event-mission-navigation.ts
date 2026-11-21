export const EVENT_MISSIONS_NAVIGATION_EVENT = "open-event-missions";
export const EVENT_GUIDE_NAVIGATION_EVENT = "open-event-guide";
export const EVENT_SCHEDULE_NAVIGATION_EVENT = "open-event-schedule";
export type EventGuideTarget = "looks";

export const openEventMissions = () => {
  window.dispatchEvent(new Event(EVENT_MISSIONS_NAVIGATION_EVENT));
};

export const openEventGuide = () => {
  window.dispatchEvent(new CustomEvent(EVENT_GUIDE_NAVIGATION_EVENT));
};

export const openEventGuideAt = (target: EventGuideTarget) => {
  window.dispatchEvent(new CustomEvent(EVENT_GUIDE_NAVIGATION_EVENT, { detail: target }));
};

export const openEventSchedule = () => {
  window.dispatchEvent(new Event(EVENT_SCHEDULE_NAVIGATION_EVENT));
};
