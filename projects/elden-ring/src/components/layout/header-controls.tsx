import { IS_MAP_IT_HOSTED } from "./navigation-host";
import { CircleUserRound, MessageSquareText, MessagesSquare, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../../features/settings/language-switcher";
import { useNotesAdminBadge } from "../../state/use-notes-admin";
import { useSupportBadges } from "../../state/use-support";
import { useUiStore } from "../../store/ui-store";
import { cn } from "../../lib/cn";
import { IS_OVERWOLF } from "../../utils/platform";
import SupportNudge from "./support-nudge";
import { markSupportNudgeSeen } from "./support-nudge-state";

/**
 * The right-side header control cluster: language picker, account, settings. Split
 * out of HeaderTabs so the title bar can pin it flush with the ad-rail edge (see
 * WindowHeader) while the game tabs stay on the left. Position-agnostic — the parent
 * decides where it sits (ad-boundary on the dashboard, in flow at the far right of
 * the ad-free in-game overlay). Shared by the desktop header and the in-game
 * overlay-map header.
 *
 * Performance mode used to live here as a header pill; it now sits in Settings (with
 * an onboarding step pointing the way), keeping the title bar to navigation only.
 */
const ICON_BTN = "grid h-full w-9 place-items-center transition-colors cursor-default outline-none";

interface HeaderControlsProps {
  /** Rendered in the header's flex flow (web, or a rail-less Overwolf window such
   *  as the in-game overlay map) rather than pinned to the ad-rail edge. In flow,
   *  the Support button takes real width like every other control; only the
   *  rail-pinned cluster hangs it out of flow. Defaults to pinned in Overwolf. */
  inline?: boolean;
}

const HeaderControls = ({ inline = !IS_OVERWOLF }: HeaderControlsProps = {}) => {
  const { t } = useTranslation();
  const activeOverlay = useUiStore((s) => s.activeOverlay);
  const openOverlay = useUiStore((s) => s.openOverlay);
  const { unreadReplies, inboxPending, isAdmin } = useSupportBadges();
  // Staff see the queue waiting on them; everyone else sees replies waiting on them.
  const supportBadge = isAdmin ? unreadReplies + inboxPending : unreadReplies;
  const notes = useNotesAdminBadge();

  return (
    <div data-ow-no-drag className="relative flex h-full items-center gap-1">
      <LanguageSwitcher compact />

      {/* Staff only, so it costs every other player nothing. Two states, because
          they mean different things: a flagged note is someone waiting on a
          decision (rose), unread ones are only reading to catch up (accent). */}
      {notes.isAdmin && (
        <button
          onClick={() => openOverlay("notesAdmin")}
          aria-current={activeOverlay === "notesAdmin" ? "page" : undefined}
          aria-label={t("notesAdmin.buttonLabel")}
          title={t("notesAdmin.buttonLabel")}
          className={cn(
            ICON_BTN,
            "relative",
            activeOverlay === "notesAdmin"
              ? "bg-accent-soft text-accent"
              : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
          )}
        >
          <MessagesSquare size={15} aria-hidden="true" />
          {(notes.reported > 0 || notes.unreviewed > 0) && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full",
                notes.reported > 0 ? "bg-rose-400" : "bg-accent",
              )}
            />
          )}
        </button>
      )}
      <button
        data-tour="settings"
        onClick={() => openOverlay("settings")}
        aria-current={activeOverlay === "settings" ? "page" : undefined}
        aria-label={t("nav.settings")}
        title={t("nav.settings")}
        className={cn(
          ICON_BTN,
          activeOverlay === "settings"
            ? "bg-accent-soft text-accent"
            : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
        )}
      >
        <Settings size={15} aria-hidden="true" />
      </button>
      {!IS_MAP_IT_HOSTED && (
        <button
          data-tour="account"
          onClick={() => openOverlay("account")}
          aria-current={activeOverlay === "account" ? "page" : undefined}
          aria-label={t("nav.account")}
          title={t("nav.account")}
          className={cn(
            ICON_BTN,
            activeOverlay === "account"
              ? "bg-accent-soft text-accent"
              : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
          )}
        >
          <CircleUserRound size={15} aria-hidden="true" />
        </button>
      )}

      {/* Support is the one title-bar control that has to be FOUND rather than
          recognised — someone with a problem doesn't scan a row of grey glyphs
          for a life-ring. So it's the only LABELLED button up here, and it CLOSES
          the icon run on the right, reading as an action against the chrome.

          In Overwolf the cluster is pinned to the content↔ad-rail boundary by its
          RIGHT edge, so anything added in flow shoves the icons left. This button
          therefore sits OUT of flow (absolute, left-full): every icon keeps the
          exact position it had, and the label overhangs the rail — which is fine,
          the rail's own frame starts below the title bar. */}
      {!IS_MAP_IT_HOSTED && (
        <div
          className={cn(
            "shrink-0",
            inline ? "relative ml-1.5" : "absolute left-full top-1/2 z-20 ml-1.5 -translate-y-1/2",
          )}
        >
          <button
            data-ow-no-drag
            data-tour="support"
            onClick={() => {
              markSupportNudgeSeen();
              openOverlay("support");
            }}
            aria-current={activeOverlay === "support" ? "page" : undefined}
            aria-label={supportBadge > 0 ? t("support.buttonWaiting") : t("support.buttonIdle")}
            title={supportBadge > 0 ? t("support.buttonWaiting") : t("support.buttonIdle")}
            className={cn(
              "flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-md)] border px-2.5 text-[11px] font-medium leading-none tracking-wide transition-colors cursor-pointer",
              // No resting fill: the button reads from its frame and label, and the
              // tint is kept for hover (and for the open state) alone.
              activeOverlay === "support"
                ? "border-accent/60 bg-accent-soft text-accent"
                : supportBadge > 0
                  ? "border-accent/60 text-accent hover:bg-accent/15"
                  : "border-border text-zinc-400 hover:border-accent/60 hover:bg-accent/10 hover:text-accent",
            )}
          >
            <MessageSquareText size={13} aria-hidden="true" />
            <span>{t("nav.support")}</span>
            {supportBadge > 0 && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />}
          </button>
          {/* One-time pointer at this button: sits in the title-bar row just left
              of it, arrow on the bubble's right edge aimed at the button. */}
          <SupportNudge onOpen={() => openOverlay("support")} />
        </div>
      )}
    </div>
  );
};

export default HeaderControls;
