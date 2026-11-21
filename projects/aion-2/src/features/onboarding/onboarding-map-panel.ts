export type OnboardingMapPanel = "explore" | null;

export const ONBOARDING_MAP_PANEL_EVENT = "gm:onboarding-map-panel";

export const showOnboardingMapPanel = (panel: OnboardingMapPanel): void => {
  window.dispatchEvent(new CustomEvent(ONBOARDING_MAP_PANEL_EVENT, { detail: panel }));
};
