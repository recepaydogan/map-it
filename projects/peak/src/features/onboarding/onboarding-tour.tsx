import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { onboardingNavigationSelector, placeOnboardingNavigationCard, useOnboardingNavigationStep } from "./onboarding-navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { IS_OVERWOLF } from "../../utils/platform";
import {
  finishOnboarding,
  shouldAutoStartOnboarding,
  startOnboarding,
  useOnboardingActive,
} from "./use-onboarding";
import { useTourGeometry, type TourBox } from "./use-tour-geometry";

type Placement = "bottom" | "top" | "left" | "right" | "center";


interface Step {
  key: string;
  target?: string;
  placement?: Placement;
  navigationItemId?: string;
  owOnly?: boolean;
}

const STEPS: Step[] = [
  { key: "welcome", placement: "center" },
  { key: "search", target: '[data-tour="search"]', placement: "bottom" },
  { key: "filters", target: '[data-tour="filters-trigger"]', placement: "bottom" },
  { key: "journal", navigationItemId: "journal", placement: "right" },
  { key: "items", navigationItemId: "items", placement: "right" },
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

const inflate = (box: TourBox, padding: number): TourBox => ({
  top: box.top - padding,
  left: box.left - padding,
  right: box.right + padding,
  bottom: box.bottom + padding,
  width: box.width + padding * 2,
  height: box.height + padding * 2,
});

const clampTo = (box: TourBox, content: TourBox): TourBox => {
  const top = Math.max(box.top, content.top);
  const left = Math.max(box.left, content.left);
  const right = Math.min(box.right, content.right);
  const bottom = Math.min(box.bottom, content.bottom);
  return {
    top,
    left,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
};

const HOLE_PADDING = 8;

interface OnboardingTourProps {
  mapActive: boolean;
  onNavigateMap: () => void;
  autoStart?: boolean;
}

const OnboardingTour = ({ mapActive, onNavigateMap, autoStart = true }: OnboardingTourProps) => {
  const active = useOnboardingActive();
  const mapActiveRef = useRef(mapActive);

  useEffect(() => {
    mapActiveRef.current = mapActive;
  }, [mapActive]);

  useEffect(() => {
    if (!autoStart || !shouldAutoStartOnboarding() || !mapActiveRef.current) return;
    const timer = window.setTimeout(() => {
      if (mapActiveRef.current) startOnboarding();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [autoStart]);

  return active ? <TourBody mapActive={mapActive} onNavigateMap={onNavigateMap} /> : null;
};

const TourBody = ({ mapActive, onNavigateMap }: Omit<OnboardingTourProps, "autoStart">) => {
  const { t } = useTranslation();
  const steps = useMemo(() => STEPS.filter(isStepAvailable), []);
  const stepsLength = steps.length;
  const [stepIndex, setStepIndex] = useState(0);
  const current = Math.min(stepIndex, stepsLength - 1);
  const step = steps[current];
  const last = current >= stepsLength - 1;

  const next = useCallback(() => {
    setStepIndex((index) => {
      const currentIndex = Math.min(index, stepsLength - 1);
      if (currentIndex >= stepsLength - 1) {
        finishOnboarding();
        return currentIndex;
      }
      return currentIndex + 1;
    });
  }, [stepsLength]);

  const back = useCallback(
    () => setStepIndex((index) => Math.max(0, Math.min(index, stepsLength - 1) - 1)),
    [stepsLength],
  );

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        finishOnboarding();
      } else if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [next, back]);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverSize, setPopoverSize] = useState({ width: 340, height: 188 });
  useLayoutEffect(() => {
    if (!popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    setPopoverSize((currentSize) =>
      Math.abs(currentSize.width - rect.width) < 1 && Math.abs(currentSize.height - rect.height) < 1
        ? currentSize
        : { width: rect.width, height: rect.height },
    );
  }, [current]);

  if (!content || !step) return null;

  const ready = surfaceReady && (!targetSelector || target !== null);
  const centered = step.placement === "center" || !targetSelector;
  const targetBox = !centered && target ? inflate(target, HOLE_PADDING) : null;
  const headerTarget = !navigationItemId && (targetBox ? targetBox.top < content.top - 1 : false);
  const highlight = !navigationItemId && targetBox && !headerTarget ? clampTo(targetBox, content) : null;

  const gap = 14;
  const margin = 12;
  let popoverTop: number;
  let popoverLeft: number;

  if (centered || !targetBox) {
    popoverLeft = content.left + (content.width - popoverSize.width) / 2;
    popoverTop = content.top + (content.height - popoverSize.height) / 2;
  } else {
    const placement: Placement = headerTarget ? "bottom" : step.placement ?? "bottom";
    if (placement === "right") {
      popoverLeft = targetBox.right + gap;
      popoverTop = targetBox.top;
    } else if (placement === "left") {
      popoverLeft = targetBox.left - gap - popoverSize.width;
      popoverTop = targetBox.top;
    } else if (placement === "top") {
      popoverLeft = targetBox.left;
      popoverTop = targetBox.top - gap - popoverSize.height;
    } else {
      popoverLeft = targetBox.left;
      popoverTop = targetBox.bottom + gap;
    }
  }

  popoverLeft = Math.min(
    Math.max(popoverLeft, content.left + margin),
    content.right - margin - popoverSize.width,
  );
  popoverTop = Math.min(
    Math.max(popoverTop, content.top + margin),
    content.bottom - margin - popoverSize.height,
  );

  const navigationCard = navigationItemId && targetBox ? placeOnboardingNavigationCard(content, targetBox, popoverSize.height) : null;

  const primaryLabel = last
    ? t("onboarding.btn_done")
    : current === 0
      ? t("onboarding.btn_start")
      : t("onboarding.btn_next");

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
            className="tour-ring absolute rounded-[var(--radius-md)]"
            style={{
              top: highlight.top - content.top,
              left: highlight.left - content.left,
              width: highlight.width,
              height: highlight.height,
            }}
          />
        </div>
      )}

      {headerTarget && targetBox && (
        <div
          className="tour-ring absolute rounded-[var(--radius-md)]"
          style={{
            top: targetBox.top,
            left: targetBox.left,
            width: targetBox.width,
            height: targetBox.height,
          }}
        />
      )}

      <div
        ref={popoverRef}
        data-tour-card={step.key}
        aria-hidden={!ready}
        className="pointer-events-auto absolute w-[340px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl shadow-black/60 animate-fade-in"
        style={{
          top: navigationCard?.top ?? popoverTop,
          left: navigationCard?.left ?? popoverLeft,
          maxWidth: navigationCard?.maxWidth,
          visibility: ready ? "visible" : "hidden",
        }}
      >
        <div className="p-4">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft text-accent">
              {last ? <Check size={15} aria-hidden="true" /> : <Compass size={15} aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                {t("onboarding.progress", { current: current + 1, total: stepsLength })}
              </p>
              <h3 className="mt-0.5 text-balance text-[15px] font-semibold leading-snug text-primary">
                {t(`onboarding.step_${step.key}_title`)}
              </h3>
            </div>
            <button
              type="button"
              onClick={finishOnboarding}
              aria-label={t("onboarding.aria_close")}
              className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-subtle transition-colors hover:bg-primary/[0.08] hover:text-primary"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>

          <p className="mt-2 text-pretty text-[13px] leading-[1.6] text-muted">
            {t(`onboarding.step_${step.key}_body`)}
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
              {steps.map((tourStep, index) => (
                <span
                  key={tourStep.key}
                  className={twMerge(
                    "h-1.5 rounded-[var(--radius-full)] transition-all",
                    index === current ? "w-4 bg-accent" : "w-1.5 bg-primary/20",
                  )}
                />
              ))}
            </div>

            <div className="flex min-w-0 items-center justify-end gap-1.5">
              {current > 0 && (
                <button
                  type="button"
                  onClick={back}
                  className="flex cursor-pointer items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:bg-primary/[0.08] hover:text-primary"
                >
                  <ArrowLeft size={13} aria-hidden="true" /> {t("onboarding.btn_back")}
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="flex cursor-pointer items-center gap-1 rounded-[var(--radius-md)] bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-background transition-colors hover:bg-accent-bright"
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
            className="block w-full cursor-pointer border-t border-border py-2 text-center text-[11.5px] font-medium text-subtle transition-colors hover:bg-primary/[0.04] hover:text-muted"
          >
            {t("onboarding.btn_skip")}
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardingTour;
