import { useEffect, useRef, useState } from "react";
import { Minus, PackageSearch, Swords, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import CompanionAd from "../../components/ads/companion-ad";
import { useCompanionHotkey } from "../../features/settings/use-companion-hotkey";
import { cn } from "../../lib/cn";
import {
  bindDragMoveElement,
  closeCurrentWindow,
  minimizeCurrentWindow,
} from "../../overwolf-utils/window-manager";
import { IS_OVERWOLF } from "../../utils/platform";
import CompanionBossAdvisor from "./companion-boss-advisor";
import CompanionItemFinder from "./companion-item-finder";
import { readCompanionTab, writeCompanionTab, type CompanionTab } from "./companion-prefs";
import { useCompanionAnalytics } from "./use-companion-analytics";

const TABS: { key: CompanionTab; icon: typeof Swords }[] = [
  { key: "boss", icon: Swords },
  { key: "find", icon: PackageSearch },
];

/**
 * The Roundtable companion: a narrow, always-available window that answers
 * "I'm stuck on this boss — what do I bring?" without opening the map.
 *
 * Shares app.html with the other visible windows (App.tsx routes by window name).
 * Frameless + transparent like the overlay, so it draws its own draggable
 * chrome. It parks beside the dashboard (see open-companion) and, unlike the map
 * overlay, is meant to STAY up for a whole attempt loop — which is also why the
 * ad footer is fixed rather than scrolling away.
 */
const CompanionWindow = () => {
  const { t } = useTranslation();
  const headerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => bindDragMoveElement(headerRef.current, { disableDoubleClickMaximize: true }), []);

  useCompanionAnalytics();

  // Closing the window is only safe if the player knows how to get it back, so
  // the live binding rides in the title bar next to the close button.
  const hotkey = useCompanionHotkey();

  const [tab, setTab] = useState<CompanionTab>(() => readCompanionTab());
  const selectTab = (next: CompanionTab) => {
    setTab(next);
    writeCompanionTab(next);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden rounded-xl border border-border bg-background text-zinc-100 shadow-2xl">
      <div
        ref={headerRef}
        className="flex h-9 shrink-0 cursor-grab select-none items-center gap-2 border-b border-border px-2.5 active:cursor-grabbing"
      >
        <img src="/icon.png" alt="" draggable={false} className="pointer-events-none h-5 w-5" />
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85">
          {t("companion.title")}
        </span>
        <div className="flex-1" />
        {IS_OVERWOLF && (
          <>
            <kbd
              title={t("companion.hotkeyHint")}
              className="mr-1 rounded-[3px] border border-border bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
            >
              {hotkey}
            </kbd>
            <button
              data-ow-no-drag
              onClick={(event) => {
                event.stopPropagation();
                minimizeCurrentWindow();
              }}
              aria-label={t("chrome.minimize")}
              className="grid h-6 w-6 place-items-center rounded-[3px] text-white/40 transition-colors hover:bg-white/10 hover:text-white/85 cursor-default"
            >
              <Minus size={13} aria-hidden="true" />
            </button>
            <button
              data-ow-no-drag
              onClick={(event) => {
                event.stopPropagation();
                closeCurrentWindow();
              }}
              aria-label={t("chrome.close")}
              className="grid h-6 w-6 place-items-center rounded-[3px] text-white/40 transition-colors hover:bg-rose-500/20 hover:text-rose-300 cursor-default"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-border bg-black/20 p-1">
        {TABS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => selectTab(key)}
            aria-pressed={tab === key}
            className={cn(
              "flex h-7 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] text-[11px] font-semibold transition-colors cursor-pointer",
              tab === key
                ? "bg-white/[0.09] text-white shadow-sm"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <Icon size={12} aria-hidden="true" />
            {t(`companion.tab.${key}`)}
          </button>
        ))}
      </div>

      {/* ONE scroll container for the whole page, and the only one.
          The pages below are the app's own panel components, which split
          themselves into a pinned identity header + a scrolling body — right for
          a tall desktop panel, wrong for a 440px window where a stuck header
          eats a third of the view. Rendering them in a BLOCK context (not a flex
          column) is what undoes that: their `flex-1 min-h-0` bodies fall back to
          auto height, so nothing scrolls inside and the header simply scrolls
          away with everything else. `scroll-none` drops the bar; the column
          can't spare 8px of its 358.

          358px is the measure those components pin their content to (22.5rem −
          2px for the marker/item pages, the same 358 for the build page's
          20.5rem − 2px inside px-4) — so content sits flush at the minimum
          window size, and a widened window centres the column instead of
          stranding it on the left. */}
      <div
        data-companion-scroll
        className="companion-page scroll-none mx-auto min-h-0 w-full max-w-[358px] flex-1 overflow-y-auto overflow-x-hidden"
      >
        {tab === "boss" ? <CompanionBossAdvisor /> : <CompanionItemFinder />}
      </div>

      {/* Overwolf-only: the OwAds SDK needs the Overwolf client. On the web
          preview the footer simply isn't rendered. */}
      {IS_OVERWOLF && <CompanionAd />}
    </div>
  );
};

export default CompanionWindow;
