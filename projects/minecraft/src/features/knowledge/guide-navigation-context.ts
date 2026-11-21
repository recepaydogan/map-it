import { createContext, useContext } from "react";
import type { InspectorSubject } from "../inspector/inspector-controller.ts";

export const GuideNavigationContext = createContext<((subject: InspectorSubject) => void) | null>(null);

export const useGuideNavigation = () => {
  const navigate = useContext(GuideNavigationContext);
  if (!navigate) throw new Error("Guide navigation is unavailable outside the guide detail page.");
  return navigate;
};
