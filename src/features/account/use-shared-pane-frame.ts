import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

const themeTokens = {
  "--map-it-background": "--app-nav-bg",
  "--map-it-surface": "--app-nav-surface",
  "--map-it-elevated": "--app-nav-raised",
  "--map-it-border": "--app-nav-line",
  "--map-it-text": "--app-nav-text",
  "--map-it-secondary": "--app-nav-muted",
  "--map-it-muted": "--app-nav-muted",
  "--map-it-accent": "--app-nav-accent",
} as const;

const sidebarSelector = "[data-map-it-game-navigation]";
const sidebarWidthProperty = "--map-it-shared-sidebar-width";
export const sharedSidebarInset = `var(${sidebarWidthProperty}, 0px)`;

/** Keep the game sidebar interactive while the shared page replaces the map beside it. */
export default function useSharedPaneFrame(content: RefObject<HTMLElement | null>, open: boolean, gameId: string | undefined) {
  const [theme, setTheme] = useState<CSSProperties>();
  const measureSidebar = useCallback(() => {
    const container = content.current;
    const frame = container?.querySelector<HTMLIFrameElement>("iframe[data-map-app]");
    const nav = frame?.contentDocument?.querySelector(sidebarSelector);
    container?.style.setProperty(sidebarWidthProperty, `${nav ? Math.ceil(nav.getBoundingClientRect().width) : 0}px`);
  }, [content]);

  useLayoutEffect(() => {
    if (!open || !gameId) return;
    const container = content.current;
    const frame = container?.querySelector<HTMLIFrameElement>("iframe[data-map-app]");
    if (!frame) return;

    const previous = new Map<HTMLElement, boolean>();
    const lock = (element: HTMLElement) => {
      previous.set(element, element.inert);
      element.inert = true;
    };
    const unlock = () => {
      previous.forEach((inert, element) => { element.inert = inert; });
      previous.clear();
    };
    const resize = new ResizeObserver(measureSidebar);
    // The game sidebar can expand instantly when reduced motion is enabled.
    const expanded = new MutationObserver(measureSidebar);
    const connect = () => {
      unlock();
      resize.disconnect();
      expanded.disconnect();
      const nav = frame.contentDocument?.querySelector<HTMLElement>(sidebarSelector);
      measureSidebar();
      const styles = nav ? nav.ownerDocument.defaultView?.getComputedStyle(nav) : undefined;
      setTheme(styles && Object.fromEntries(Object.entries(themeTokens)
        .map(([surface, token]) => [surface, styles.getPropertyValue(token).trim()])
        .filter(([, value]) => value)) as CSSProperties | undefined);
      if (!nav) {
        lock(frame);
        return;
      }

      resize.observe(nav, { box: "border-box" });
      expanded.observe(nav, { attributes: true, attributeFilter: ["data-expanded"] });
      for (let branch: HTMLElement | null = nav; branch?.parentElement && branch.parentElement !== frame.contentDocument?.documentElement; branch = branch.parentElement) {
        for (const sibling of branch.parentElement.children) {
          if (sibling !== branch && "inert" in sibling && !/^(SCRIPT|STYLE|LINK)$/.test(sibling.tagName)) lock(sibling as HTMLElement);
        }
      }
    };
    connect();
    frame.addEventListener("load", connect);
    return () => {
      frame.removeEventListener("load", connect);
      resize.disconnect();
      expanded.disconnect();
      unlock();
      container?.style.removeProperty(sidebarWidthProperty);
      setTheme(undefined);
    };
  }, [content, open, gameId, measureSidebar]);

  return { theme, measureSidebar };
}
