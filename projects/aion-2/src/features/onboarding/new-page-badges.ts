import { useSyncExternalStore } from "react";
import { EVENTS_DISCOVERY_CAMPAIGN } from "../../game-config";

type NewPage = "wings" | "events" | "profile" | "quests" | "titles" | "activities" | "achievements";
type BadgeState = Record<NewPage, boolean> & { eventsCampaign: string };

const STORAGE_KEY = "gm:new-page-badges-v1";
const ONBOARDING_KEY = "gm:onboarded-v2";

const readState = (): BadgeState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const value: unknown = JSON.parse(saved);
      if (typeof value === "object" && value !== null && "wings" in value && "profile" in value
        && typeof value.wings === "boolean" && typeof value.profile === "boolean") {
        const events = "eventsCampaign" in value && value.eventsCampaign === EVENTS_DISCOVERY_CAMPAIGN
          && "events" in value && typeof value.events === "boolean" ? value.events : true;
        const quests = "quests" in value && typeof value.quests === "boolean" ? value.quests : true;
        const titles = "titles" in value && typeof value.titles === "boolean" ? value.titles : true;
        const activities = "activities" in value && typeof value.activities === "boolean" ? value.activities : true;
        const achievements = "achievements" in value && typeof value.achievements === "boolean" ? value.achievements : true;
        const state = { wings: value.wings, events, eventsCampaign: EVENTS_DISCOVERY_CAMPAIGN, profile: value.profile, quests, titles, activities, achievements };
        if (!("eventsCampaign" in value) || value.eventsCampaign !== EVENTS_DISCOVERY_CAMPAIGN
          || !("events" in value) || typeof value.events !== "boolean"
          || !("quests" in value) || typeof value.quests !== "boolean"
          || !("titles" in value) || typeof value.titles !== "boolean"
          || !("activities" in value) || typeof value.activities !== "boolean"
          || !("achievements" in value) || typeof value.achievements !== "boolean") {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }
        return state;
      }
    }
    // A new Events campaign reintroduces its dot even if an earlier Events
    // page was visited; the other page badges retain their previous state.
    const isExistingUser = localStorage.getItem(ONBOARDING_KEY) === "1";
    const initial = { wings: isExistingUser, events: true, eventsCampaign: EVENTS_DISCOVERY_CAMPAIGN, profile: isExistingUser,
      quests: true, titles: true, activities: true, achievements: true };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  } catch (error) {
    console.warn("Could not read page discovery state", error);
    return { wings: false, events: true, eventsCampaign: EVENTS_DISCOVERY_CAMPAIGN, profile: false,
      quests: true, titles: true, activities: true, achievements: true };
  }
};

let badges = readState();
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    badges = readState();
    notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
};

export const useNewPageBadge = (page: NewPage): boolean =>
  useSyncExternalStore(subscribe, () => badges[page], () => false);

export const markNewPageVisited = (page: NewPage): void => {
  if (!badges[page]) return;
  badges = { ...badges, [page]: false };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(badges)); }
  catch (error) { console.warn("Could not save page discovery state", error); }
  notify();
};
