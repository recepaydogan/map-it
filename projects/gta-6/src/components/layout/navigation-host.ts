import { useEffect, useState, type ReactNode } from "react";
import type { SidebarItem } from "./navigation-sidebar";

/** The Map It shell supplies account and support navigation to its game frames. */
const params = new URLSearchParams(window.location.search);
export const IS_MAP_IT_HOSTED = window.parent !== window && params.get("host-sidebar") === "true";

const gameLabel = params.get("host-game-label");
const icon = params.get("host-game-icon");
const fallbackIcon = params.get("host-game-icon-fallback");
const library = params.get("host-library-label");
const support = params.get("host-support-label");
const account = params.get("host-account-label");
const unread = params.get("host-unread-label");

export const hostedNavigation = IS_MAP_IT_HOSTED && gameLabel && icon && library && support && account
  ? { gameLabel, icon, fallbackIcon, library, support, account, unread }
  : null;

type NavigationState = { pane: "support" | "account" | null; unread: boolean };

export function sendNavigationAction(action: "open-library" | "open-account" | "open-support" | "leave-shared-page" | "navigation-ready") {
  window.parent.postMessage({ type: `map-it:${action}` }, window.location.origin);
}

export function useHostedNavigationState() {
  const [state, setState] = useState<NavigationState>({ pane: null, unread: false });
  useEffect(() => {
    if (!hostedNavigation) return;
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== window.location.origin || event.data?.type !== "map-it:navigation-state") return;
      setState({ pane: event.data.pane, unread: event.data.unread });
    };
    window.addEventListener("message", receive);
    sendNavigationAction("navigation-ready");
    return () => window.removeEventListener("message", receive);
  }, []);
  return state;
}

/** Reuse the active flag and underlying locale setter in the sidebar. */
export function sidebarLanguage<Id extends string>(
  label: string,
  current: string,
  options: readonly { id: Id; label: string; icon: ReactNode }[],
  select: (id: Id) => void,
  currentIcon?: ReactNode,
): SidebarItem {
  return {
    id: "language",
    tour: "language",
    label,
    icon: currentIcon ?? (options.find(option => option.id === current) ?? options[0])?.icon,
    subItems: options.map(option => ({
      ...option,
      active: option.id === current,
      onSelect: () => select(option.id),
    })),
  };
}

/** Library-hosted apps get these rows from Map It. Standalone apps use their own routes. */
export function standaloneSidebarFooter(
  support: Omit<Extract<SidebarItem, { onSelect: () => void }>, "id" | "tour">,
  account: Omit<Extract<SidebarItem, { onSelect: () => void }>, "id" | "tour">,
): SidebarItem[] {
  if (IS_MAP_IT_HOSTED) return [];
  return [
    { ...support, id: "support", tour: "support" },
    { ...account, id: "account", tour: "account" },
  ];
}
