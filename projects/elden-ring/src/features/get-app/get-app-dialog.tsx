import { ExternalLink, Gamepad2, type LucideIcon, RefreshCw, Rocket, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import { OVERWOLF_STORE_URL } from "../../utils/external-links";
import { IS_OVERWOLF, openExternalUrl } from "../../utils/platform";
import { useGetApp } from "./get-app-store";

/**
 * The three things the desktop build does that a browser tab cannot, in the
 * order they matter: the overlay is the whole reason to install, the launch
 * behaviour is what makes it effortless, and the shared account is what makes
 * leaving the website cost nothing.
 *
 * `keys` is the manifest's DEFAULT binding for that hotkey (see the `hotkeys`
 * block in public/manifest.json) — a key combination is the same in every
 * language, so it stays out of i18n exactly as the Settings hotkey rows do.
 */
const BENEFITS: { key: string; icon: LucideIcon; keys?: string }[] = [
  { key: "overlay", icon: Gamepad2, keys: "Ctrl + M" },
  { key: "launch", icon: Rocket },
  { key: "progress", icon: RefreshCw },
];

/**
 * The website's pitch for the Overwolf desktop app: a download button that
 * first answers "why would I install this when the site already works?".
 *
 * WEB ONLY, and it self-guards rather than trusting its mount site — inside
 * Overwolf the app is already installed, and a centred dialog would sit over
 * the ad rail, which AGENTS.md forbids outright.
 *
 * Portalled to `document.body` for the same reason the navigation drawer is:
 * the title bar that owns the trigger is `relative z-20`, so a dialog rendered
 * in place paints UNDER the map's own floating column (z-1350). z-1700 puts it
 * above every full-window surface (1500) and below the first-run tour (1900).
 */
const GetAppDialog = () => {
  const { t } = useTranslation();
  const source = useGetApp((state) => state.source);
  const hide = useGetApp((state) => state.hide);

  useEffect(() => {
    if (!source) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation(); // the map's own Esc handlers must not also fire
      hide();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [source, hide]);

  if (IS_OVERWOLF || !source || !OVERWOLF_STORE_URL) return null;

  const download = () => {
    track(EVENTS.GET_APP_CLICKED, { source });
    openExternalUrl(OVERWOLF_STORE_URL);
    hide();
  };

  return createPortal(
    // FLEX centring, not `grid place-items-center` (what the app's other dialogs
    // use): an implicit grid track is sized to max-content, so the card's own
    // `max-w-full` would resolve against its 432px width instead of the 358px a
    // 390px phone actually has — measured hanging 74px off the right edge. A flex
    // container resolves the percentage against itself, so the card gives way.
    <div className="fixed inset-0 z-[1700] flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={hide}
        className="absolute inset-0 h-full w-full cursor-default bg-black/65 backdrop-blur-[2px] animate-fade-in"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="get-app-title"
        // max-h-full + a scrolling middle: the phone is the viewport this has to
        // survive, and its keyboard-free height is whatever the browser chrome
        // leaves. Header and footer stay put; only the copy scrolls.
        className="relative flex max-h-full w-[27rem] max-w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-accent/25 bg-surface shadow-2xl shadow-black/70 animate-fade-up"
      >
        <div className="flex shrink-0 items-start gap-2.5 px-5 pt-5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              {t("getApp.eyebrow")}
            </p>
            <h2
              id="get-app-title"
              className="mt-0.5 text-balance font-display text-[17px] font-semibold leading-snug text-white"
            >
              {t("getApp.title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={hide}
            aria-label={t("common.close")}
            className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/8 hover:text-white cursor-pointer"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3">
          <p className="text-[13px] leading-relaxed text-zinc-400">{t("getApp.intro")}</p>

          <ul className="mt-4 space-y-3.5">
            {BENEFITS.map(({ key, icon: Icon, keys }) => (
              <li key={key} className="flex gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/25 bg-accent/10 text-accent">
                  <Icon size={15} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-[13.5px] font-semibold leading-tight text-zinc-100">
                      {t(`getApp.${key}Title`)}
                    </span>
                    {/* Same keycap chrome as the Settings hotkey list, so the
                        combination reads as a key and not as prose. */}
                    {keys && (
                      <kbd className="shrink-0 rounded-[var(--radius-sm)] border border-border bg-black/30 px-2 py-1 font-mono text-[11px] text-zinc-200">
                        {keys}
                      </kbd>
                    )}
                  </span>
                  <span className="mt-1 block text-[12.5px] leading-[1.45] text-zinc-400">
                    {t(`getApp.${key}Body`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 shrink-0 border-t border-white/[0.07] px-5 py-4">
          <button
            type="button"
            onClick={download}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-[13.5px] font-semibold text-on-accent transition-colors hover:bg-accent/90 cursor-pointer"
          >
            {t("getApp.cta")}
            <ExternalLink size={15} aria-hidden="true" />
          </button>
          {/* The install really does bring the Overwolf client with it and the
              app really is ad-supported — saying so here is cheaper than a
              surprise on the store page. */}
          <p className="mt-2.5 text-center text-[11px] leading-relaxed text-subtle">
            {t("getApp.footnote")}
          </p>
        </div>
      </section>
    </div>,
    document.body,
  );
};

export default GetAppDialog;
