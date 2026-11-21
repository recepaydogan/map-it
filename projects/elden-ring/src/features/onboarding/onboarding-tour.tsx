import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { onboardingNavigationSelector, placeOnboardingNavigationCard, useOnboardingNavigationStep } from "./onboarding-navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";
import { cn } from "../../lib/cn";
import type { Game } from "../../data/types";
import { useMapStore } from "../../store/map-store";
import { useUiStore } from "../../store/ui-store";
import { IS_OVERWOLF, useIsMobile } from "../../utils/platform";
import { shouldAutoStartOnboarding, useOnboarding } from "./use-onboarding";

/**
 * Tour cards stay inside the content frame, clear of the ad rail.
 * Only the card captures clicks. Map target rings are clipped to the content frame.
 */

type Placement = "bottom" | "top" | "left" | "right" | "center";

interface Step {
  key: string;
  /** CSS selector of the element to spotlight. Omit for a centered card. */
  target?: string;
  placement?: Placement;
  navigationItemId?: string;
  /** Restrict a step to one game (e.g. bookmarks are Elden-Ring-only). */
  game?: Game;
  /** Overwolf-only step (e.g. the in-game global hotkeys); dropped in the web build. */
  owOnly?: boolean;
  /**
   * Some steps point at title-bar chrome that exists in only ONE layout: the
   * desktop tab strip and control cluster, or the drawer trigger that replaces
   * them below `lg`. A step flagged here is dropped in the other layout, so the
   * tour never spotlights an element that isn't on screen.
   */
  chrome?: "desktop" | "mobile";
}

// Title + body copy lives in the i18n catalog under
// `onboarding.step_<key>_title` / `_body`, resolved at render from each step key.
const STEPS: Step[] = [
  {
    key: "welcome",
    placement: "center",
  },
  {
    key: "world",
    target: '[data-tour="world"]',
    placement: "bottom",
  },
  {
    key: "seed",
    target: '[data-tour="seed"]',
    placement: "bottom",
    game: "nightreign",
  },
  {
    key: "filters",
    target: '[data-tour="filters"]',
    placement: "right",
  },
  {
    key: "search",
    target: '[data-tour="search"]',
    placement: "bottom",
  },
  {
    key: "add-marker",
    target: '[data-tour="add-marker"]',
    placement: "bottom",
  },
  {
    key: "bookmarks",
    target: '[data-tour="bookmarks"]',
    placement: "bottom",
    game: "elden-ring",
  },
  {
    key: "patterns",
    target: '[data-tour="patterns"]',
    placement: "bottom",
    game: "nightreign",
  },
  {
    key: "nav-er",
    target: '[data-tour="nav"]',
    placement: "bottom",
    game: "elden-ring",
    chrome: "desktop",
  },
  {
    key: "nav-nr",
    target: '[data-tour="nav"]',
    placement: "bottom",
    game: "nightreign",
    chrome: "desktop",
  },
  { key: "language", navigationItemId: "language", placement: "right", chrome: "desktop" },
  { key: "account", navigationItemId: "account", placement: "right", chrome: "desktop" },
  { key: "settings", navigationItemId: "settings", placement: "right", chrome: "desktop" },
  // Phone stand-in for the five steps above: everything they point at is folded
  // into the drawer at this width, so one step introduces the drawer instead.
  {
    key: "menu",
    target: '[data-tour="menu"]',
    placement: "bottom",
    chrome: "mobile",
  },
  // Settings steps explain the available controls from the sidebar.
  { key: "settings-map", navigationItemId: "settings", placement: "right" },
  { key: "settings-shortcuts", navigationItemId: "settings", placement: "right" },
  { key: "settings-game", navigationItemId: "settings", placement: "right", owOnly: true },
  { key: "settings-hotkeys", navigationItemId: "settings", placement: "right", owOnly: true },
  { key: "settings-replay", navigationItemId: "settings", placement: "right" },
  {
    key: "finish",
    placement: "center",
  },
];

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

const toBox = (r: DOMRect): Box => ({
  top: r.top,
  left: r.left,
  width: r.width,
  height: r.height,
  right: r.right,
  bottom: r.bottom,
});

const inflate = (b: Box, p: number): Box => ({
  top: b.top - p,
  left: b.left - p,
  right: b.right + p,
  bottom: b.bottom + p,
  width: b.width + p * 2,
  height: b.height + p * 2,
});

/** Clip a box to the content frame so the highlight never reaches past it. */
const clampTo = (b: Box, c: Box): Box => {
  const top = Math.max(b.top, c.top);
  const left = Math.max(b.left, c.left);
  const right = Math.min(b.right, c.right);
  const bottom = Math.min(b.bottom, c.bottom);
  return { top, left, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
};

const boxEq = (a: Box | null, b: Box | null): boolean => {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
};

const HOLE_PAD = 8;
/** Smooth morph of the spotlight + ring as the tour moves between targets. */
const SPOT_TRANSITION = "top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease";

/**
 * Mount gate + first-run auto-start. Keeping the body in a separate component
 * means each open is a fresh mount, so the step index resets to zero naturally —
 * no reset-via-effect needed.
 */
const OnboardingTour = () => {
  const active = useOnboarding((s) => s.active);
  const start = useOnboarding((s) => s.start);

  useEffect(() => {
    if (!shouldAutoStartOnboarding()) return;
    if (useUiStore.getState().activeOverlay !== null) return;
    // Let the map + controls settle before the spotlight measures them.
    const t = window.setTimeout(() => {
      if (useUiStore.getState().activeOverlay === null) start();
    }, 700);
    return () => window.clearTimeout(t);
  }, [start]);

  return active ? <TourBody /> : null;
};

const TourBody = () => {
  const { t } = useTranslation();
  const finish = useOnboarding((s) => s.finish);
  const game = useMapStore((s) => s.game);

  // Game-scoped step list (bookmarks fold out for Nightreign), minus any Overwolf-
  // only steps (the in-game hotkeys section) when running as the plain web build,
  // minus the title-bar steps that belong to the other layout (see Step.chrome).
  const isMobile = useIsMobile();
  const steps = useMemo(
    () =>
      STEPS.filter(
        (s) =>
          (!s.game || s.game === game) &&
          (!s.owOnly || IS_OVERWOLF) &&
          (!s.chrome || (s.chrome === "mobile") === isMobile),
      ),
    [game, isMobile],
  );
  const stepsLen = steps.length;

  const [stepIndex, setStepIndex] = useState(0);
  // Always read a clamped index, so a mid-tour game swap shrinking the list can
  // never point past the end (no clamp-via-effect needed).
  const current = Math.min(stepIndex, stepsLen - 1);
  const step = steps[current];
  const last = current >= stepsLen - 1;

  const next = useCallback(() => {
    setStepIndex((i) => {
      const cur = Math.min(i, stepsLen - 1);
      if (cur >= stepsLen - 1) {
        finish();
        return cur;
      }
      return cur + 1;
    });
  }, [stepsLen, finish]);
  const back = useCallback(() => setStepIndex((i) => Math.max(0, Math.min(i, stepsLen - 1) - 1)), [stepsLen]);



  // ── Live geometry: the content frame (<main>) and the current target ────────
  const [content, setContent] = useState<Box | null>(null);
  const [target, setTarget] = useState<Box | null>(null);
  const navigationItemId = step?.navigationItemId ?? null;
  useOnboardingNavigationStep(navigationItemId);
  const targetSelector = navigationItemId ? onboardingNavigationSelector(navigationItemId) : step?.target;
  const scrolledForRef = useRef<string | null>(null);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      const main = document.querySelector("main");
      const c = main ? toBox(main.getBoundingClientRect()) : null;
      setContent((prev) => (boxEq(prev, c) ? prev : c));

      let t: Box | null = null;
      if (targetSelector) {
        const el = document.querySelector(targetSelector);
        if (el) {
          if (navigationItemId && scrolledForRef.current !== targetSelector) {
            scrolledForRef.current = targetSelector;
            el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
          }
          t = toBox(el.getBoundingClientRect());
        }
      }
      setTarget((prev) => (boxEq(prev, t) ? prev : t));

      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [targetSelector, navigationItemId]);

  // ESC closes the tour first (capture + stopImmediatePropagation so the app-wide
  // ESC handlers don't also fire). Arrows / Enter step through it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        finish();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [next, back, finish]);

  // ── Popover sizing (measured so it can be clamped inside the content frame) ──
  const popRef = useRef<HTMLDivElement | null>(null);
  const [popSize, setPopSize] = useState({ w: 340, h: 188 });
  useLayoutEffect(() => {
    if (!popRef.current) return;
    const r = popRef.current.getBoundingClientRect();
    setPopSize((p) => (Math.abs(p.w - r.width) < 1 && Math.abs(p.h - r.height) < 1 ? p : { w: r.width, h: r.height }));
  }, [current]);

  if (!content || !step) return null;

  const isCenter = step.placement === "center" || !targetSelector;
  const targetBox = !isCenter && target ? inflate(target, HOLE_PAD) : null;
  // Title-bar targets keep their ring above the content frame and their card below it.
  const headerTarget = !navigationItemId && (targetBox ? targetBox.top < content.top - 1 : false);
  const highlight = !navigationItemId && targetBox && !headerTarget ? clampTo(targetBox, content) : null;

  // Popover placement, then clamp fully inside the content frame so it can never
  // drift over the ad rail or up into the header.
  const gap = 14;
  const margin = 12;
  let popTop: number;
  let popLeft: number;
  if (isCenter || !targetBox) {
    popLeft = content.left + (content.width - popSize.w) / 2;
    popTop = content.top + (content.height - popSize.h) / 2;
  } else {
    const place: Placement = headerTarget ? "bottom" : step.placement ?? "bottom";
    if (place === "right") {
      popLeft = targetBox.right + gap;
      popTop = targetBox.top;
    } else if (place === "left") {
      popLeft = targetBox.left - gap - popSize.w;
      popTop = targetBox.top;
    } else if (place === "top") {
      popLeft = targetBox.left;
      popTop = targetBox.top - gap - popSize.h;
    } else {
      popLeft = targetBox.left;
      popTop = targetBox.bottom + gap;
    }
  }
  popLeft = Math.min(Math.max(popLeft, content.left + margin), content.right - margin - popSize.w);
  popTop = Math.min(Math.max(popTop, content.top + margin), content.bottom - margin - popSize.h);

  const navigationCard = navigationItemId && targetBox ? placeOnboardingNavigationCard(content, targetBox, popSize.h) : null;

  const primaryLabel = last
    ? t("onboarding.btn_done")
    : current === 0
      ? t("onboarding.btn_start")
      : t("onboarding.btn_next");

  return (
    <div
      data-game={game}
      className="pointer-events-none fixed inset-0 z-[1900]"
      role="dialog"
      aria-modal="false"
      aria-label={t("onboarding.aria_dialog")}
    >
      {highlight && highlight.width > 0 && highlight.height > 0 && (
        <div
          aria-hidden="true"
          className="absolute overflow-hidden"
          style={{ top: content.top, left: content.left, width: content.width, height: content.height }}
        >
          <div
            className="animate-tour-ring absolute rounded-[12px]"
            style={{
              top: highlight.top - content.top,
              left: highlight.left - content.left,
              width: highlight.width,
              height: highlight.height,
              transition: SPOT_TRANSITION,
            }}
          />
        </div>
      )}

      {/* Header targets (nav / settings) sit above the map frame and on the left,
          far from the ad rail — ring them with an unclipped element so the halo
          shows on the title bar. pointer-events stays none, so the title-bar
          controls remain fully clickable. */}
      {headerTarget && targetBox && (
        <div
          className="animate-tour-ring absolute rounded-[12px]"
          style={{
            top: targetBox.top,
            left: targetBox.left,
            width: targetBox.width,
            height: targetBox.height,
            transition: SPOT_TRANSITION,
          }}
        />
      )}

      {/* Popover — the only interactive piece of the overlay. */}
      <div
        ref={popRef}
        data-tour-card={step.key}
        className="pointer-events-auto absolute w-[340px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl shadow-black/60 animate-fade-in"
        style={{ top: navigationCard?.top ?? popTop, left: navigationCard?.left ?? popLeft, maxWidth: navigationCard?.maxWidth }}
      >
        <div className="p-4">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft text-accent">
              {last ? <Check size={15} aria-hidden="true" /> : <Compass size={15} aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                {t("onboarding.progress", { current: current + 1, total: stepsLen })}
              </p>
              {/* text-balance evens out the two lines of a wrapped title instead
                  of leaving a lone trailing word. */}
              <h3 className="mt-0.5 text-balance text-[15px] font-semibold leading-snug text-white">
                {t(`onboarding.step_${step.key}_title`)}
              </h3>
            </div>
            <button
              onClick={finish}
              aria-label={t("onboarding.aria_close")}
              className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/8 hover:text-white cursor-pointer"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>

          {/* text-pretty stops orphans / awkward last-line breaks; the brighter
              zinc-300 (theme "body copy") keeps the description easy to read. */}
          <p className="mt-2 text-pretty text-[13px] leading-[1.6] text-zinc-300">
            {t(`onboarding.step_${step.key}_body`)}
          </p>

          {/* Dots ABOVE the buttons, not beside them: the tour has grown to 16
              steps, and a single row of that many dots pushed the buttons past
              the popover's fixed 340px — which `overflow-hidden` then clipped,
              cutting "Next" in half. On its own row the dot strip can grow (and
              wrap) without ever costing the actions their space. */}
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
              {steps.map((s, i) => (
                <span
                  key={s.key}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === current ? "w-4 bg-accent" : "w-1.5 bg-white/20",
                  )}
                />
              ))}
            </div>

            <div className="flex items-center justify-end gap-1.5">
              {current > 0 && (
                <button
                  onClick={back}
                  className="flex items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[12.5px] font-medium text-zinc-300 transition-colors hover:bg-white/8 hover:text-white cursor-pointer"
                >
                  <ArrowLeft size={13} aria-hidden="true" /> {t("onboarding.btn_back")}
                </button>
              )}
              <button
                onClick={next}
                className="flex items-center gap-1 rounded-[var(--radius-md)] bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-on-accent transition-colors hover:bg-accent/90 cursor-pointer"
              >
                {primaryLabel}
                {!last && <ArrowRight size={13} aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>

        {!last && (
          <button
            onClick={finish}
            className="block w-full border-t border-border py-2 text-center text-[11.5px] font-medium text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300 cursor-pointer"
          >
            {t("onboarding.btn_skip")}
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardingTour;
