import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";
import { GAME_CONFIG } from "../../game-config";
import { cn } from "../../lib/cn";
import {
  finishOnboarding,
  shouldAutoStartOnboarding,
  startOnboarding,
  useOnboardingActive,
} from "./use-onboarding";
import { useTourGeometry, type TourBox } from "./use-tour-geometry";
import { placeTourPopover, type TourPlacement } from "./tour-popover-placement";

/**
 * Tour cards stay inside the content frame, clear of the ad rail and window
 * controls. Highlight rings are visual and only the card captures clicks.
 */

interface Step {
  key: string;
  /** CSS selector of the element to spotlight. Omit for a centered card. */
  target?: string;
  placement?: TourPlacement;
  map?: boolean;
  navigationItemId?: string;
}

const STEPS: Step[] = [
  { key: "welcome", map: true, placement: "center" },
  { key: "filters", map: true, target: '[data-tour="filters-panel"]', placement: "right" },
  { key: "map-tools", map: true, target: '[data-tour="map-tools"]', placement: "bottom" },
  ...["items", "professions", "spells", "talent-calculator", "guides", "classes", "races"].map((id): Step => ({
    key: id,
    navigationItemId: id,
    target: `[data-tour="nav-${id}"]`,
    placement: "right",
  })),
  { key: "finish", placement: "center" },
];

const inflate = (b: TourBox, p: number): TourBox => ({
  top: b.top - p,
  left: b.left - p,
  right: b.right + p,
  bottom: b.bottom + p,
  width: b.width + p * 2,
  height: b.height + p * 2,
});

/** Clip the highlight to the content frame. */
const clampTo = (b: TourBox, c: TourBox): TourBox => {
  const top = Math.max(b.top, c.top);
  const left = Math.max(b.left, c.left);
  const right = Math.min(b.right, c.right);
  const bottom = Math.min(b.bottom, c.bottom);
  return { top, left, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
};

const HIGHLIGHT_PADDING = 8;

interface OnboardingTourProps {
  mapActive: boolean;
  onNavigateMap: () => void;
  onNavigationHighlightChange: (itemId: string | null) => void;
  onFilterStepChange: (active: boolean) => void;
  /** The in-game app supports replay but must not interrupt play on launch. */
  autoStart?: boolean;
}

/**
 * Mount gate + first-run auto-start. Keeping the body in a separate component
 * means each open is a fresh mount, so the step index resets to zero naturally.
 */
const OnboardingTour = ({ autoStart = true, ...props }: OnboardingTourProps) => {
  const active = useOnboardingActive();

  // The timeout must see the current page at fire time, not at mount.
  const mapActiveRef = useRef(props.mapActive);
  useEffect(() => {
    mapActiveRef.current = props.mapActive;
  }, [props.mapActive]);

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

  return active ? <TourBody {...props} /> : null;
};

const TourBody = ({ mapActive, onNavigateMap, onNavigationHighlightChange, onFilterStepChange }: Omit<OnboardingTourProps, "autoStart">) => {
  const { t } = useTranslation();

  const steps = STEPS;
  const stepsLen = steps.length;

  const [stepIndex, setStepIndex] = useState(0);
  const current = Math.min(stepIndex, stepsLen - 1);
  const step = steps[current];
  const last = current >= stepsLen - 1;
  const popRef = useRef<HTMLDivElement | null>(null);
  const [popSize, setPopSize] = useState({ w: 340, h: 188 });

  const close = finishOnboarding;
  const next = useCallback(() => {
    if (stepIndex >= stepsLen - 1) close();
    else setStepIndex((i) => Math.min(i + 1, stepsLen - 1));
  }, [close, stepIndex, stepsLen]);
  const back = useCallback(() => setStepIndex((i) => Math.max(0, Math.min(i, stepsLen - 1) - 1)), [stepsLen]);

  const mapStep = step?.map === true;
  const filterStep = step?.key === "filters";
  const navigationItemId = step?.navigationItemId ?? null;
  useLayoutEffect(() => {
    if (mapStep && !mapActive) onNavigateMap();
  }, [mapStep, mapActive, onNavigateMap]);
  useLayoutEffect(() => {
    onNavigationHighlightChange(navigationItemId);
    return () => onNavigationHighlightChange(null);
  }, [navigationItemId, onNavigationHighlightChange]);

  useLayoutEffect(() => {
    onFilterStepChange(filterStep);
    return () => onFilterStepChange(false);
  }, [filterStep, onFilterStepChange]);

  const targetSelector = step?.target;
  const surfaceReady = !mapStep || mapActive;
  const { content, target } = useTourGeometry({
    targetSelector: surfaceReady ? targetSelector : undefined,
    scrollTargetIntoView: navigationItemId !== null,
  });
  const ready = surfaceReady && (!targetSelector || target !== null);

  // ESC closes the tour first (capture + stopImmediatePropagation so the app-wide
  // ESC handlers don't also fire). Arrows / Enter step through it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      } else if (e.key === "ArrowRight" || (e.key === "Enter" && !(e.target instanceof HTMLElement && e.target.closest("button, input, textarea, select")))) {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [next, back, close]);

  // Popover sizing (measured so it can be clamped inside the content frame).
  useLayoutEffect(() => {
    const popover = popRef.current;
    if (!popover) return;
    const measure = () => {
      const r = popover.getBoundingClientRect();
      setPopSize((p) => (Math.abs(p.w - r.width) < 1 && Math.abs(p.h - r.height) < 1 ? p : { w: r.width, h: r.height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(popover);
    return () => observer.disconnect();
  }, [current, content?.width]);

  if (!content || !step) return null;

  const isCenter = step.placement === "center" || !step.target;
  const targetBox = ready && !isCenter && target ? inflate(target, HIGHLIGHT_PADDING) : null;
  // Place the card below title-bar controls and highlight them in place.
  const headerTarget = targetBox && target ? target.top < content.top - 1 : false;
  const highlight = mapStep && targetBox && !headerTarget ? clampTo(targetBox, content) : null;
  const headerRing = mapStep && headerTarget && targetBox ? {
    ...targetBox,
    left: Math.max(targetBox.left, content.left),
    right: Math.min(targetBox.right, content.right),
    width: Math.max(0, Math.min(targetBox.right, content.right) - Math.max(targetBox.left, content.left)),
  } : null;

  const sidebar = mapStep
    ? document.querySelector<HTMLElement>(".map-filter-panel, .map-details-panel")?.getBoundingClientRect()
    : undefined;
  const navigation = navigationItemId
    ? document.querySelector(".app-navigation-panel")?.getBoundingClientRect()
    : undefined;
  const filterBox = filterStep ? targetBox : null;
  const stackFilterCard = filterBox && content.right - filterBox.right < 260;
  const cardLeft = Math.max(content.left, navigation?.right ?? content.left,
    filterBox && !stackFilterCard ? filterBox.right : content.left);
  const cardTop = filterBox && stackFilterCard ? Math.max(content.top, filterBox.bottom) : content.top;
  const popover = placeTourPopover({
    content: {
      ...content,
      left: cardLeft,
      top: cardTop,
      width: Math.max(0, content.right - cardLeft),
      height: Math.max(0, content.bottom - cardTop),
    },
    target: isCenter ? null : targetBox,
    size: popSize,
    placement: headerTarget || stackFilterCard ? "bottom" : step.placement,
    avoid: sidebar ? [sidebar] : [],
  });

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
      {highlight && (
        <div
          className="absolute overflow-hidden"
          style={{ top: content.top, left: content.left, width: content.width, height: content.height }}
        >
          <div
            key={current}
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
      {headerRing && headerRing.width > 0 && (
        <div
          key={current}
          className="tour-ring absolute rounded-[12px]"
          style={{
            top: headerRing.top,
            left: headerRing.left,
            width: headerRing.width,
            height: headerRing.height,
          }}
        />
      )}

      {/* Popover — the only interactive piece of the overlay. */}
      <div
        key={current}
        ref={popRef}
        data-tour-card={step.key}
        aria-hidden={!ready}
        className={cn(
          "absolute w-[340px] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl shadow-black/60",
          ready && "tour-card-enter",
        )}
        style={{ top: popover.top, left: popover.left, maxWidth: popover.maxWidth, maxHeight: popover.maxHeight, opacity: ready ? 1 : 0, pointerEvents: ready ? "auto" : "none" }}
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
              onClick={close}
              aria-label={t("onboarding.aria_close")}
              className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/8 hover:text-white"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>

          <p aria-live="polite" className="mt-2 text-pretty text-[13px] leading-[1.6] text-zinc-300">
            {t(`onboarding.step_${step.key}_body`, copyParams)}
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
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
            onClick={close}
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
