import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { onboardingNavigationSelector, placeOnboardingNavigationCard, useOnboardingNavigationStep } from "./onboarding-navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";
import { GAME_CONFIG } from "../../game-config";
import { cn } from "../../lib/cn";
import { IS_OVERWOLF } from "../../utils/platform";
import {
  finishOnboarding,
  shouldAutoStartOnboarding,
  startOnboarding,
  useOnboardingActive,
} from "./use-onboarding";
import { useTourGeometry, type TourBox } from "./use-tour-geometry";

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
  /** Step for controls that are only available in Overwolf. */
  owOnly?: boolean;
}

const STEPS: Step[] = [
  { key: "welcome", placement: "center" },
  { key: "search", target: '[data-tour="search"]', placement: "bottom" },
  { key: "filters", target: '[data-tour="filters-trigger"]', placement: "bottom" },
  { key: "map-tools", target: '[data-tour="map-tools"]', placement: "left" },
  { key: "settings-game", navigationItemId: "settings", placement: "right", owOnly: true },
  { key: "settings-hotkeys", navigationItemId: "settings", placement: "right", owOnly: true },
  { key: "finish", placement: "center" },
];

const isStepAvailable = (step: Step): boolean => {
  if (step.owOnly && !IS_OVERWOLF) return false;
  if (!(step.navigationItemId || step.target)) return true;
  const selector = step.navigationItemId ? onboardingNavigationSelector(step.navigationItemId) : step.target;
  const target = selector ? document.querySelector(selector) : null;
  return Boolean(target && target.getClientRects().length > 0);
};

const inflate = (b: TourBox, p: number): TourBox => ({
  top: b.top - p,
  left: b.left - p,
  right: b.right + p,
  bottom: b.bottom + p,
  width: b.width + p * 2,
  height: b.height + p * 2,
});

/** Clip a box to the content frame so the highlight never reaches past it. */
const clampTo = (b: TourBox, c: TourBox): TourBox => {
  const top = Math.max(b.top, c.top);
  const left = Math.max(b.left, c.left);
  const right = Math.min(b.right, c.right);
  const bottom = Math.min(b.bottom, c.bottom);
  return { top, left, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
};

const HOLE_PAD = 8;

interface OnboardingTourProps {
  /** Which dashboard surface is open, so the tour can walk into Settings. */
  mapActive: boolean;
  onNavigateMap: () => void;
  /** The in-game app supports replay but must not interrupt play on launch. */
  autoStart?: boolean;
}

/**
 * Mount gate + first-run auto-start. Keeping the body in a separate component
 * means each open is a fresh mount, so the step index resets to zero naturally.
 */
const OnboardingTour = ({ mapActive, onNavigateMap, autoStart = true }: OnboardingTourProps) => {
  const active = useOnboardingActive();

  // Read the current map state when the first-run timer fires.
  const mapActiveRef = useRef(mapActive);
  useEffect(() => {
    mapActiveRef.current = mapActive;
  }, [mapActive]);

  useEffect(() => {
    if (!autoStart) return;
    if (!shouldAutoStartOnboarding()) return;
    if (!mapActiveRef.current) return;
    // Let the map + controls settle before the spotlight measures them.
    const t = window.setTimeout(() => {
      if (mapActiveRef.current) startOnboarding();
    }, 700);
    return () => window.clearTimeout(t);
  }, [autoStart]);

  return active ? <TourBody mapActive={mapActive} onNavigateMap={onNavigateMap} /> : null;
};

const TourBody = ({ mapActive, onNavigateMap }: Omit<OnboardingTourProps, "autoStart">) => {
  const { t } = useTranslation();

  // Resolve the map steps once per tour. Controls hidden by the current state
  // are skipped instead of showing an untethered card for a missing target.
  const steps = useMemo(() => STEPS.filter(isStepAvailable), []);
  const stepsLen = steps.length;

  const [stepIndex, setStepIndex] = useState(0);
  const current = Math.min(stepIndex, stepsLen - 1);
  const step = steps[current];
  const last = current >= stepsLen - 1;

  const next = useCallback(() => {
    setStepIndex((i) => {
      const cur = Math.min(i, stepsLen - 1);
      if (cur >= stepsLen - 1) {
        finishOnboarding();
        return cur;
      }
      return cur + 1;
    });
  }, [stepsLen]);
  const back = useCallback(() => setStepIndex((i) => Math.max(0, Math.min(i, stepsLen - 1) - 1)), [stepsLen]);

  const navigationItemId = step?.navigationItemId ?? null;
  useOnboardingNavigationStep(navigationItemId);
  const mapStep = navigationItemId === null && step?.key !== "finish";
  useLayoutEffect(() => {
    if (mapStep && !mapActive) onNavigateMap();
  }, [mapStep, mapActive, onNavigateMap]);

  const targetSelector = navigationItemId ? onboardingNavigationSelector(navigationItemId) : step?.target;
  const surfaceReady = !mapStep || mapActive;
  const { content, target } = useTourGeometry({
    targetSelector: surfaceReady ? targetSelector : undefined,
    scrollTargetIntoView: navigationItemId !== null,
  });

  // ESC closes the tour first (capture + stopImmediatePropagation so the app-wide
  // ESC handlers don't also fire). Arrows / Enter step through it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        finishOnboarding();
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
  }, [next, back]);

  // Popover sizing (measured so it can be clamped inside the content frame).
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
  const copyParams = { app: GAME_CONFIG.appName, game: GAME_CONFIG.gameName };

  return (
    <div
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
            className="tour-ring absolute rounded-[12px]"
            style={{
              top: highlight.top - content.top,
              left: highlight.left - content.left,
              width: highlight.width,
              height: highlight.height,
            }}
          />
        </div>
      )}

      {/* Header targets sit above the map frame: ring them with an unclipped
          element so the halo shows on the title bar. */}
      {headerTarget && targetBox && (
        <div
          className="tour-ring absolute rounded-[12px]"
          style={{
            top: targetBox.top,
            left: targetBox.left,
            width: targetBox.width,
            height: targetBox.height,
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
              <h3 className="mt-0.5 text-balance text-[15px] font-semibold leading-snug text-white">
                {t(`onboarding.step_${step.key}_title`, copyParams)}
              </h3>
            </div>
            <button
              type="button"
              onClick={finishOnboarding}
              aria-label={t("onboarding.aria_close")}
              className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/8 hover:text-white"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>

          <p className="mt-2 text-pretty text-[13px] leading-[1.6] text-zinc-300">
            {t(`onboarding.step_${step.key}_body`, copyParams)}
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
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

            <div className="flex min-w-0 items-center justify-end gap-1.5">
              {current > 0 && (
                <button
                  type="button"
                  onClick={back}
                  className="flex cursor-pointer items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[12.5px] font-medium text-zinc-300 transition-colors hover:bg-white/8 hover:text-white"
                >
                  <ArrowLeft size={13} aria-hidden="true" /> {t("onboarding.btn_back")}
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="flex cursor-pointer items-center gap-1 rounded-[var(--radius-md)] bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-on-accent transition-colors hover:bg-accent/90"
              >
                {primaryLabel}
                {!last && <ArrowRight size={13} aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>

        {!last && (
          <button
            type="button"
            onClick={finishOnboarding}
            className="block w-full cursor-pointer border-t border-border py-2 text-center text-[11.5px] font-medium text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300"
          >
            {t("onboarding.btn_skip")}
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardingTour;
