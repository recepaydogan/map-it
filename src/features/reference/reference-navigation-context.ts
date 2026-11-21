import { createContext, useContext } from "react";
import { openReference } from "./reference-navigation";
import type { OpenReference, ReferenceTarget } from "./reference-types";

/** Embedded details keep every linked entry inside their host panel. */
export const ReferenceNavigationContext = createContext<OpenReference | null>(null);

export const useReferenceNavigation = () => useContext(ReferenceNavigationContext) ?? openReference;

/** The linked entry currently shown beside a primary map detail panel. */
export const SelectedReferenceContext = createContext<ReferenceTarget | null | undefined>(undefined);

export const useSelectedReference = () => useContext(SelectedReferenceContext);

export const sameReferenceTarget = (left: ReferenceTarget | null | undefined, right: ReferenceTarget) =>
  left?.category === right.category && left.id === right.id && left.group === right.group;
