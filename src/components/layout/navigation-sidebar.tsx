import {
  ArrowLeft, Bell, BookOpen, CalendarDays, ChevronDown, CircleHelp, Compass, Database, Fish, FlaskConical,
  Hammer, History, ListOrdered, Map, MapPin, MessageSquareText, PawPrint, Pin, PanelLeft, ScrollText, Settings,
  Shield, Skull, Sprout, Swords, Trophy, UserRound, Users, Wind, type LucideIcon,
} from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from "react";
import { hostedNavigation, sendNavigationAction, useHostedNavigationState } from "./navigation-host";
import "./navigation-sidebar.css";

type SidebarDestination = {
  id: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  tour?: string;
  indicator?: ReactNode;
};

export type SidebarItem = SidebarDestination & (
  { onSelect: () => void; subItems?: never } |
  { onSelect?: never; subItems: readonly SidebarItem[] }
);

type NavigationSidebarProps = {
  label: string;
  pinLabel: string;
  storageKey: string;
  items: readonly SidebarItem[];
  footer?: readonly SidebarItem[];
  systemFooter?: readonly SidebarItem[];
  tour?: string;
  brandIcon?: ReactNode;
  onBrandSelect?: () => void;
  panelRef?: Ref<HTMLElement>;
};

const icons: Record<string, LucideIcon> = {
  map: Map, items: Database, database: Database, quests: ScrollText, achievements: Trophy,
  dungeons: Skull, bosses: Skull, pets: PawPrint, wings: Wind, titles: ScrollText,
  leaderboard: Trophy, events: CalendarDays, activities: Compass, "tier-lists": ListOrdered,
  professions: Hammer, crafting: Hammer, building: Hammer, recipes: FlaskConical,
  classes: Swords, "talent-calculator": Swords, characters: Users, races: Users, weapons: Swords,
  farming: Sprout, fishing: Fish, seeds: Sprout, journeys: History, guide: BookOpen,
  updates: Bell, zones: MapPin, settings: Settings, support: MessageSquareText, account: UserRound, faq: CircleHelp,
  "world-bosses": Skull, "weekly-missions": CalendarDays, transmog: Shield,
};

const compactViewport = window.matchMedia("(max-width: 680px)");
const subscribeCompact = (update: () => void) => {
  compactViewport.addEventListener("change", update);
  return () => compactViewport.removeEventListener("change", update);
};
const getCompact = () => compactViewport.matches;

export default function NavigationSidebar({ label, pinLabel, storageKey, items, footer = [], systemFooter = [], tour, brandIcon, onBrandSelect, panelRef }: NavigationSidebarProps) {
  const hostState = useHostedNavigationState();
  const title = hostedNavigation?.gameLabel ?? label;
  const compact = useSyncExternalStore(subscribeCompact, getCompact);
  const [storedPin, setStoredPin] = useState(() => localStorage.getItem(storageKey) === "true");
  const [manualOpen, setManualOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const pinned = storedPin && !compact;
  const expanded = pinned || manualOpen || hovered || keyboardOpen;
  const contentId = useId();
  const footerMenu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = footerMenu.current;
    const entry = menu?.parentElement;
    const panel = entry?.closest(".app-navigation-panel");
    if (!menu || !entry || !panel) return;

    const fitMenu = () => {
      const available = entry.getBoundingClientRect().top - panel.getBoundingClientRect().top;
      menu.style.setProperty("--app-nav-submenu-space", `${Math.max(0, available - 12)}px`);
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !entry.contains(event.target)) setOpenGroup(null);
    };
    fitMenu();
    const observer = new ResizeObserver(fitMenu);
    observer.observe(panel);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [expanded, openGroup]);

  const closePreview = () => {
    setManualOpen(false);
    setHovered(false);
    setKeyboardOpen(false);
  };

  const togglePin = () => {
    if (compact) {
      if (expanded) closePreview();
      else setManualOpen(true);
      return;
    }
    localStorage.setItem(storageKey, String(!storedPin));
    setStoredPin(!storedPin);
  };

  const renderItem = (item: SidebarItem, hostAction = false, opensUp = false): ReactNode => {
    const Icon = icons[item.id] ?? BookOpen;
    const groupOpen = item.subItems ? expanded && openGroup === item.id : undefined;
    return (
      <div key={item.id} className="app-navigation-entry">
        <button
          type="button"
          className="app-navigation-item"
          aria-label={item.label}
          title={expanded ? undefined : item.label}
          aria-current={item.active && (hostAction || !hostState.pane) ? "page" : undefined}
          aria-expanded={groupOpen}
          data-tour={item.tour}
          onClick={event => {
            if (item.subItems) {
              if (!expanded) setManualOpen(true);
              setOpenGroup(groupOpen ? null : item.id);
            } else {
              if (footerMenu.current?.contains(event.currentTarget)) {
                if (event.detail === 0) footerMenu.current.parentElement?.querySelector("button")?.focus();
                setOpenGroup(null);
              }
              if (hovered && event.detail > 0) {
                setManualOpen(false);
                setKeyboardOpen(false);
              } else if (compact && !hovered) {
                closePreview();
              }
              if (!hostAction && hostedNavigation) sendNavigationAction("leave-shared-page");
              item.onSelect();
            }
          }}
        >
          <span className="app-navigation-icon" aria-hidden="true">{item.icon ?? <Icon size={18} />}</span>
          <span className="app-navigation-label">{item.label}</span>
          {item.subItems && <ChevronDown className="app-navigation-chevron" size={14} aria-hidden="true" />}
          {item.indicator != null && <span className="app-navigation-indicator">{item.indicator}</span>}
        </button>
        {groupOpen && <div className="app-navigation-submenu" ref={opensUp ? footerMenu : undefined}>
          {item.subItems?.map(child => renderItem(child))}
        </div>}
      </div>
    );
  };

  const sharedFooter: readonly SidebarItem[] = hostedNavigation ? [
    { id: "host-support", label: hostedNavigation.support, icon: <MessageSquareText size={18} />,
      active: hostState.pane === "support", onSelect: () => sendNavigationAction("open-support"),
      indicator: hostState.unread ? <span className="app-navigation-dot" aria-label={hostedNavigation.unread ?? undefined} /> : undefined },
    { id: "host-account", label: hostedNavigation.account, icon: <UserRound size={18} />,
      active: hostState.pane === "account", onSelect: () => sendNavigationAction("open-account") },
  ] : systemFooter;
  const hostIcon = hostedNavigation && (
    <img src={hostedNavigation.icon} alt="" draggable={false} onError={({ currentTarget: image }) => {
      const fallback = hostedNavigation?.fallbackIcon;
      if (fallback && !image.dataset.fallback) {
        image.dataset.fallback = "true";
        image.src = fallback;
      }
    }} />
  );

  const brand = <>
    <span className="app-navigation-icon" aria-hidden="true">{hostIcon ?? brandIcon ?? <PanelLeft size={19} />}</span>
    <span className="app-navigation-label">{title}</span>
  </>;

  return (
    <aside className="app-navigation-sidebar" data-pinned={pinned}>
      <nav
        ref={panelRef}
        className="app-navigation-panel"
        aria-label={title}
        data-map-it-game-navigation={hostedNavigation ? "" : undefined}
        data-expanded={expanded}
        data-tour={tour}
        onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }}
        onPointerLeave={event => { if (event.pointerType === "mouse") setHovered(false); }}
        onFocusCapture={event => { if (event.target.matches(":focus-visible") && (!compact || !event.target.closest(".app-navigation-toggle"))) setKeyboardOpen(true); }}
        onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setKeyboardOpen(false); }}
        onKeyDown={event => {
          if (event.key === "Escape" && footerMenu.current) {
            event.stopPropagation();
            footerMenu.current.parentElement?.querySelector("button")?.focus();
            setOpenGroup(null);
            return;
          }
          if (event.key === "Escape" && !pinned && expanded) {
            event.stopPropagation();
            closePreview();
            if (event.target instanceof HTMLElement && event.target.closest(".app-navigation-submenu")) {
              event.currentTarget.querySelector<HTMLButtonElement>(".app-navigation-toggle")?.focus();
              setKeyboardOpen(false);
            }
          }
        }}
      >
        {onBrandSelect ? (
          <div className="app-navigation-brand-row">
            <button type="button" className="app-navigation-item app-navigation-brand" aria-label={title} onClick={onBrandSelect}>
              {brand}
            </button>
            <button type="button" className="app-navigation-item app-navigation-toggle app-navigation-brand-pin"
              aria-label={pinLabel} title={pinLabel} aria-controls={contentId} aria-expanded={expanded}
              aria-pressed={compact ? undefined : pinned} onClick={togglePin}>
              {compact ? <PanelLeft size={16} aria-hidden="true" /> : <Pin className="app-navigation-pin" size={14} aria-hidden="true" />}
            </button>
          </div>
        ) : (
          <button
            className="app-navigation-item app-navigation-toggle"
            type="button"
            aria-label={compact ? title : pinLabel}
            aria-controls={contentId}
            aria-expanded={expanded}
            aria-pressed={compact ? undefined : pinned}
            title={compact ? title : pinLabel}
            onClick={togglePin}
          >
            {brand}
            {!compact && <Pin className="app-navigation-pin" size={14} aria-hidden="true" />}
          </button>
        )}
        <div className="app-navigation-list" id={contentId}>{items.map(item => renderItem(item))}</div>
        {hostedNavigation && (
          <div className="app-navigation-return">
            {renderItem({
              id: "host-library",
              label: hostedNavigation.library,
              icon: <ArrowLeft size={18} />,
              onSelect: () => sendNavigationAction("open-library"),
            }, true)}
          </div>
        )}
        {footer.length > 0 && <div className="app-navigation-footer" data-popup-groups={footer.some(item => item.subItems)}>
          {footer.map(item => renderItem(item, false, true))}
        </div>}
        {sharedFooter.length > 0 && (
          <div className="app-navigation-host-footer">{sharedFooter.map(item => renderItem(item, Boolean(hostedNavigation)))}</div>
        )}
      </nav>
    </aside>
  );
}
