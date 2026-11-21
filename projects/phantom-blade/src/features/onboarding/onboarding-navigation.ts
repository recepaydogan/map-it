import { useLayoutEffect, useSyncExternalStore } from "react";

let navigationItemId: string | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const setNavigationItemId = (itemId: string | null) => {
  if (itemId === navigationItemId) return;
  navigationItemId = itemId;
  for (const listener of listeners) listener();
};

export const useOnboardingNavigationHighlight = () =>
  useSyncExternalStore(subscribe, () => navigationItemId, () => null);

export const useOnboardingNavigationStep = (itemId: string | null) => {
  useLayoutEffect(() => {
    setNavigationItemId(itemId);
    return () => setNavigationItemId(null);
  }, [itemId]);
};

export const onboardingNavigationSelector = (itemId: string) =>
  '[data-tour-nav="' + itemId + '"]';

export const placeOnboardingNavigationCard = (
  content: { left: number; top: number; right: number; bottom: number },
  target: { right: number; top: number },
  height: number,
) => {
  const margin = 12;
  const left = Math.max(content.left + margin, target.right + 14);
  const top = Math.max(content.top + margin, Math.min(target.top, content.bottom - margin - height));
  return { left, top, maxWidth: Math.max(0, content.right - margin - left) };
};
