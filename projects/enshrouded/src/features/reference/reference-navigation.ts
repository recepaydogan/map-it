import type { ReferenceTarget } from "./reference-types";

/** Keeps links usable inside map panels and the standalone item browser. */
export const REFERENCE_NAVIGATION_EVENT = "open-reference-entry";
export const openReference = (target: ReferenceTarget) => {
  window.dispatchEvent(new CustomEvent<ReferenceTarget>(REFERENCE_NAVIGATION_EVENT, { detail: target }));
};
