import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { OVERWOLF_STORE_URL } from "../../utils/external-links";
import { useGetApp } from "./get-app-store";

/**
 * The title bar's download CTA — the only filled control up there, because it
 * is the one thing on the page asking for a decision rather than offering
 * navigation.
 *
 * Web only: Overwolf never renders it (its window floor is 1300px AND the mount
 * site gates on `!IS_OVERWOLF`), since telling someone to install the app they
 * are already running is nonsense.
 *
 * It sits immediately left of the hamburger on a phone and left of the Discord
 * glyph on a desktop — last in the row either way, where the eye lands after
 * the navigation. The drawer carries the same offer as a card for anyone who
 * opens it, but the CTA should not depend on that.
 *
 * It opens the pitch rather than the store: "download" is a big ask for a
 * visitor who has not yet been told what the desktop build does differently.
 */
const GetAppButton = () => {
  const { t } = useTranslation();
  const show = useGetApp((state) => state.show);

  if (!OVERWOLF_STORE_URL) return null;

  return (
    <button
      data-ow-no-drag
      type="button"
      onClick={() => show("header")}
      aria-label={t("getApp.buttonHint")}
      title={t("getApp.buttonHint")}
      className={cn(
        "mr-1 flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-md)] bg-accent font-semibold leading-none tracking-wide text-on-accent transition-colors hover:bg-accent/90 cursor-pointer",
        // Thumb-sized next to the 40px hamburger, mouse-sized in the 40px
        // desktop bar — the same two-heights split the whole title bar makes.
        "h-9 px-3 text-[12px] max-[359px]:px-2.5 lg:h-[26px] lg:px-2.5 lg:text-[11px]",
      )}
    >
      <Download size={13} aria-hidden="true" />
      {/* The full name is what sells it, but a 360px title bar has ~120px to
          spare between the wordmark and the hamburger. So below `lg` the
          destination folds away and the verb carries the button — the pitch it
          opens says "Download on Overwolf" in full, and aria-label keeps the
          control whole for anyone not reading the pixels.
          Under 360px even the verb has to go: measured at 320 (the old iPhone
          SE / a folded cover screen) it pushed the hamburger 33px off the edge,
          and losing the menu is worse than losing a word. */}
      <span className="max-[359px]:hidden lg:hidden">{t("getApp.buttonShort")}</span>
      <span className="hidden lg:inline">{t("getApp.button")}</span>
    </button>
  );
};

export default GetAppButton;
