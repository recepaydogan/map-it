import type { ReferenceTarget } from "./reference-types";

/** Capture the visible selection before following a link, including search results. */
export const navigateReferenceHistory = (
  history: ReferenceTarget[],
  current: ReferenceTarget | null,
  target: ReferenceTarget,
): ReferenceTarget[] => {
  const trail = current?.id ? [...history.slice(0, -1), current] : [];
  const existing = trail.findIndex((entry) => entry.category === target.category && entry.id === target.id && entry.group === target.group);
  return existing >= 0 ? trail.slice(0, existing + 1) : [...trail, target].slice(-32);
};
