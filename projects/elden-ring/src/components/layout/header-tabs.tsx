import { useTranslation } from "react-i18next";
import { type OverlayKey, useUiStore } from "../../store/ui-store";
import { cn } from "../../lib/cn";
import { ELDEN_RING_TABS, type NavTab } from "./nav-tabs";
import HeaderDatabaseMenu from "./header-database-menu";

/** Destinations the Database menu owns on the desktop strip, so the strip itself
 *  must not also render them as tabs. The drawer has no such menu and lists the
 *  same keys flat — see nav-tabs.ts for the "lists are complete, consumers
 *  decide the presentation" contract. */
const MENU_KEYS = new Set<OverlayKey>(["codex", "relics", "nightlords", "nightfarers"]);

/**
 * Primary app navigation (the game tabs), hosted in the title bar. Each tab switches
 * the full-window surface below (`activeOverlay`); "Map" returns to the live map. The
 * right-side controls (account / settings / language) live in HeaderControls.
 *
 * Desktop-only strip: below `lg` the whole row folds into the mobile drawer
 * (components/layout/mobile-nav), which reads the SAME tab definitions from
 * nav-tabs.ts. Overwolf's window floor is 1300px, so the desktop layout is the
 * only one that build ever renders.
 *
 * `data-ow-no-drag` opts the strip out of the window-drag handle so clicks reach the
 * tabs instead of starting a window move.
 */
const HeaderTabs = () => {
  const { t } = useTranslation();
  const activeOverlay = useUiStore((s) => s.activeOverlay);
  const openOverlay = useUiStore((s) => s.openOverlay);
  const closeOverlay = useUiStore((s) => s.closeOverlay);

  const go = (key: OverlayKey | null) => (key ? openOverlay(key) : closeOverlay());

  const TabButton = ({ tab }: { tab: NavTab }) => {
    const active = activeOverlay === tab.key;
    const Icon = tab.icon;
    const label = t(tab.tKey);
    return (
      <button
        onClick={() => go(tab.key)}
        aria-current={active ? "page" : undefined}
        aria-label={label}
        title={label}
        className={cn(
          "group flex h-full items-center gap-1.5 px-3 text-[12.5px] font-medium transition-colors cursor-default",
          active
            ? "bg-accent-soft text-white"
            : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
        )}
      >
        {/* Icon carries the game accent: the active tab — and a hovered one, via
            group-hover — both tint to --accent, which the NR group flips to cyan. */}
        <Icon
          size={15}
          className={active ? "text-accent" : "text-zinc-500 group-hover:text-accent"}
          aria-hidden="true"
        />
        <span>{label}</span>
      </button>
    );
  };

  return (
    // Map, then ONE reference menu. Every other destination — both item catalogs,
    // Relics, Nightlords, Nightfarers — lives inside HeaderDatabaseMenu, grouped
    // under its own heading. The phone drawer still lists them flat: it scrolls,
    // so a menu inside a menu there would only cost a tap.
    <nav data-ow-no-drag data-tour="nav" className="hidden h-full items-center gap-1 lg:flex">
      {ELDEN_RING_TABS.filter((tab) => tab.key === null || !MENU_KEYS.has(tab.key)).map((tab) => (
        <TabButton key={tab.tKey} tab={tab} />
      ))}
      <HeaderDatabaseMenu />
    </nav>
  );
};

export default HeaderTabs;
