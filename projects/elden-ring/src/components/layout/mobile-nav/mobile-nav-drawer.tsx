import { IS_MAP_IT_HOSTED } from "../navigation-host";
import { CircleUserRound, MessageSquareText, MessagesSquare, Settings, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import DiscordIcon from "../../discord-icon";
import { GetAppCard } from "../../../features/get-app";
import { cn } from "../../../lib/cn";
import { useNotesAdminBadge } from "../../../state/use-notes-admin";
import { useSupportBadges } from "../../../state/use-support";
import { type OverlayKey, useUiStore } from "../../../store/ui-store";
import { DISCORD_INVITE_URL } from "../../../utils/external-links";
import { openExternalUrl } from "../../../utils/platform";
import { markSupportNudgeSeen } from "../support-nudge-state";
import { ELDEN_RING_TABS, NIGHTREIGN_TABS, type NavTab } from "../nav-tabs";
import MobileNavLanguage from "./mobile-nav-language";
import MobileNavRow from "./mobile-nav-row";
import MobileNavSection from "./mobile-nav-section";

interface MobileNavDrawerProps {
  onClose: () => void;
}

/**
 * The phone / small-tablet navigation sheet. Everything the desktop title bar
 * spreads across its width — the game tabs, language, account, settings, support
 * and Discord — stacked as full-width rows a thumb can actually hit.
 *
 * Slides in from the right and covers the app at z-1800: above every full-window
 * surface (1500) and confirm dialog (1700), below the first-run tour (1900) so a
 * running tour still owns the screen.
 *
 * Portalled to `document.body` on purpose. The title bar that owns the trigger is
 * `relative z-20`, which makes it a stacking context the map's own floating
 * layers (z-1350) sit above — a drawer rendered in place would paint UNDER the
 * filter rail. The ads-overlap rule in AGENTS.md doesn't apply: this whole
 * component is gated on `!IS_OVERWOLF` and `lg:hidden`, so the Overwolf build
 * (1300px window floor, ad rail present) never mounts it.
 */
const MobileNavDrawer = ({ onClose }: MobileNavDrawerProps) => {
  const { t } = useTranslation();
  const activeOverlay = useUiStore((s) => s.activeOverlay);
  const openOverlay = useUiStore((s) => s.openOverlay);
  const closeOverlay = useUiStore((s) => s.closeOverlay);
  const { unreadReplies, inboxPending, isAdmin } = useSupportBadges();
  // Staff see the queue waiting on them; everyone else sees replies waiting on them.
  const supportBadge = isAdmin ? unreadReplies + inboxPending : unreadReplies;
  const notes = useNotesAdminBadge();

  /** Navigating closes the sheet — the surface behind it is the whole point. */
  const go = (key: OverlayKey | null) => {
    if (key) openOverlay(key);
    else closeOverlay();
    onClose();
  };

  const tabRow = (tab: NavTab) => (
    <MobileNavRow
      key={tab.tKey}
      icon={tab.icon}
      label={t(tab.tKey)}
      active={activeOverlay === tab.key}
      onClick={() => go(tab.key)}
    />
  );

  return createPortal(
    <div className="fixed inset-0 z-[1800] lg:hidden">
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-[2px] animate-fade-in"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.menu")}
        className="absolute inset-y-0 right-0 flex w-[min(20rem,86vw)] flex-col border-l border-border bg-surface shadow-2xl shadow-black/60 animate-slide-in-right"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
          <img src="/icon.png" alt="" draggable={false} className="pointer-events-none h-7 w-7" />
          <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold tracking-wide text-zinc-100">
            {t("app.name")}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="-mr-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
          {/* The desktop strip fits both groups on one line, so it can leave them
              unlabelled. Stacked vertically they need the split spelled out — and
              it's an honest one: Map and Archive each host BOTH games behind their
              own in-surface switcher, while the three below are Nightreign-only. */}
          <MobileNavSection label={t("nav.browse")}>
            {ELDEN_RING_TABS.map(tabRow)}
          </MobileNavSection>

          {/* data-game flips the accent tokens to NR's spectral cyan for everything
              inside, exactly as the desktop strip does for the same three tabs. */}
          <div data-game="nightreign">
            <MobileNavSection label={t("game.nightreign")}>
              {NIGHTREIGN_TABS.map(tabRow)}
            </MobileNavSection>
          </div>

          <div className="mx-4 border-t border-border" />

          <MobileNavSection label={t("nav.preferences")}>
            {!IS_MAP_IT_HOSTED && (
              <MobileNavRow
                icon={CircleUserRound}
                label={t("nav.account")}
                active={activeOverlay === "account"}
                onClick={() => go("account")}
              />
            )}
            <MobileNavRow
              icon={Settings}
              label={t("nav.settings")}
              active={activeOverlay === "settings"}
              onClick={() => go("settings")}
            />
            <MobileNavLanguage />
            {/* Staff only, so it costs every other player nothing. */}
            {notes.isAdmin && (
              <MobileNavRow
                icon={MessagesSquare}
                label={t("notesAdmin.buttonLabel")}
                active={activeOverlay === "notesAdmin"}
                dot={notes.reported > 0 || notes.unreviewed > 0}
                onClick={() => go("notesAdmin")}
              />
            )}
          </MobileNavSection>
        </div>

        {/* The desktop bar's "Get the app" pill, as a card. Outside the scroll
            area on purpose: it is the one thing here that has to be seen without
            scrolling past the navigation to reach it. */}
        <GetAppCard onOpen={onClose} />

        <footer className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-3">
          {!IS_MAP_IT_HOSTED && (
            <button
              type="button"
              onClick={() => {
                markSupportNudgeSeen();
                go("support");
              }}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] border px-3 text-[13.5px] font-medium transition-colors cursor-pointer",
                activeOverlay === "support" || supportBadge > 0
                  ? "border-accent/60 bg-accent-soft text-accent"
                  : "border-border text-zinc-300 hover:border-accent/60 hover:bg-accent/10 hover:text-accent",
              )}
            >
              <MessageSquareText size={15} aria-hidden="true" />
              <span className="truncate">{t("nav.support")}</span>
              {supportBadge > 0 && (
                <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              )}
            </button>
          )}
          {DISCORD_INVITE_URL && (
            <button
              type="button"
              onClick={() => openExternalUrl(DISCORD_INVITE_URL)}
              aria-label={t("chrome.discord")}
              title={t("chrome.discord")}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-md)] border border-border text-zinc-400 transition-colors hover:bg-[#5865f2]/15 hover:text-[#8b93f7] cursor-pointer"
            >
              <DiscordIcon className="h-[18px] w-[18px]" />
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
};

export default MobileNavDrawer;
