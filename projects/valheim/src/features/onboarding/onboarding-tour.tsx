import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { onboardingNavigationSelector, placeOnboardingNavigationCard, useOnboardingNavigationStep } from "./onboarding-navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { shouldAutoStartOnboarding, useOnboarding } from "./use-onboarding";

type Placement = "bottom" | "top" | "left" | "right" | "center";

interface Step {
  key: string;
  target?: string;
  placement?: Placement;
  navigationItemId?: string;
}

const STEPS: Step[] = [
  { key: "welcome", placement: "center" },
  { key: "world", target: '[data-map-identity-controls]', placement: "bottom" },
  { key: "filters", target: '[data-tour="filters"]', placement: "right" },
  { key: "spoilers", target: '[data-tour="spoilers"]', placement: "top" },
  { key: "search", target: '[data-tour="search"]', placement: "bottom" },
  { key: "nav", navigationItemId: "database", placement: "right" },
  { key: "settings", navigationItemId: "settings", placement: "right" },
  { key: "finish", placement: "center" },
];

interface Box {
  top: number; left: number; width: number; height: number; right: number; bottom: number;
}

const toBox = (r: DOMRect): Box => ({
  top: r.top, left: r.left, width: r.width, height: r.height, right: r.right, bottom: r.bottom,
});

const inflate = (b: Box, p: number): Box => ({
  top: b.top - p, left: b.left - p, right: b.right + p, bottom: b.bottom + p, width: b.width + p * 2, height: b.height + p * 2,
});

const clampTo = (b: Box, c: Box): Box => {
  const top = Math.max(b.top, c.top);
  const left = Math.max(b.left, c.left);
  const right = Math.min(b.right, c.right);
  const bottom = Math.min(b.bottom, c.bottom);
  return { top, left, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
};

const boxEq = (a: Box | null, b: Box | null): boolean => {
  if (!a || !b) return a === b;
  return Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
};

const HOLE_PAD = 8;
const SPOT_TRANSITION = "top 0.5s cubic-bezier(0.16, 1, 0.3, 1), left 0.5s cubic-bezier(0.16, 1, 0.3, 1), width 0.5s cubic-bezier(0.16, 1, 0.3, 1), height 0.5s cubic-bezier(0.16, 1, 0.3, 1)";

export const OnboardingTour = () => {
  const active = useOnboarding((s) => s.active);
  const start = useOnboarding((s) => s.start);

  useEffect(() => {
    if (!shouldAutoStartOnboarding()) return;
    const t = window.setTimeout(() => start(), 700);
    return () => window.clearTimeout(t);
  }, [start]);

  return active ? <TourBody /> : null;
};

const TourBody = () => {
  const { t } = useTranslation();
  const finish = useOnboarding((s) => s.finish);
  const steps = STEPS;
  const stepsLen = steps.length;

  const [stepIndex, setStepIndex] = useState(0);
  const current = Math.min(stepIndex, stepsLen - 1);
  const step = steps[current];
  const last = current >= stepsLen - 1;

  const next = useCallback(() => {
    setStepIndex((i) => {
      const cur = Math.min(i, stepsLen - 1);
      if (cur >= stepsLen - 1) { finish(); return cur; }
      return cur + 1;
    });
  }, [stepsLen, finish]);
  const back = useCallback(() => setStepIndex((i) => Math.max(0, Math.min(i, stepsLen - 1) - 1)), [stepsLen]);

  const [content, setContent] = useState<Box | null>(null);
  const [target, setTarget] = useState<Box | null>(null);
  const hasTarget = target !== null;
  const navigationItemId = step?.navigationItemId ?? null;
  useOnboardingNavigationStep(navigationItemId);
  const targetSelector = navigationItemId ? onboardingNavigationSelector(navigationItemId) : step?.target;

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      const mainBox = document.getElementById("tour-boundary")?.getBoundingClientRect();
      const c = mainBox ? toBox(mainBox) : null;
      setContent((prev) => (boxEq(prev, c) ? prev : c));

      let tBox: Box | null = null;
      if (targetSelector) {
        const el = document.querySelector(targetSelector);
        if (el) tBox = toBox(el.getBoundingClientRect());
      }
      setTarget((prev) => (boxEq(prev, tBox) ? prev : tBox));

      raf = requestAnimationFrame(measure);
    };
    if (navigationItemId && targetSelector) document.querySelector(targetSelector)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [navigationItemId, targetSelector]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); finish(); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [next, back, finish]);

  const popRef = useRef<HTMLDivElement | null>(null);
  const [popSize, setPopSize] = useState({ w: 340, h: 188 });
  useLayoutEffect(() => {
    if (!popRef.current) return;
    const r = popRef.current.getBoundingClientRect();
    setPopSize((p) => (Math.abs(p.w - r.width) < 1 && Math.abs(p.h - r.height) < 1 ? p : { w: r.width, h: r.height }));
  }, [current, targetSelector, hasTarget]);

  if (!content || !step) return null;

  const isCenter = step.placement === "center" || !targetSelector;
  const targetBox = !isCenter && target ? inflate(target, HOLE_PAD) : null;
  const headerTarget = !navigationItemId && (targetBox ? targetBox.top < content.top - 1 : false);
  const highlight = !navigationItemId && targetBox && !headerTarget ? clampTo(targetBox, content) : null;

  const gap = 14; const margin = 12;
  let popTop: number; let popLeft: number;
  if (isCenter || !targetBox) {
    popLeft = content.left + (content.width - popSize.w) / 2;
    popTop = content.top + (content.height - popSize.h) / 2;
  } else {
    const place: Placement = headerTarget ? "bottom" : step.placement ?? "bottom";
    if (place === "right") { popLeft = targetBox.right + gap; popTop = targetBox.top; }
    else if (place === "left") { popLeft = targetBox.left - gap - popSize.w; popTop = targetBox.top; }
    else if (place === "top") { popLeft = targetBox.left; popTop = targetBox.top - gap - popSize.h; }
    else { popLeft = targetBox.left; popTop = targetBox.bottom + gap; }
  }
  popLeft = Math.min(Math.max(popLeft, content.left + margin), content.right - margin - popSize.w);
  popTop = Math.min(Math.max(popTop, content.top + margin), content.bottom - margin - popSize.h);

  const navigationCard = navigationItemId && targetBox ? placeOnboardingNavigationCard(content, targetBox, popSize.h) : null;

  const primaryLabel = last ? t("onboarding.btn_done", "Done") : current === 0 ? t("onboarding.btn_start", "Start Tour") : t("onboarding.btn_next", "Next");

  return (
    <div className="pointer-events-none fixed inset-0 z-[1900]" role="dialog" aria-modal="false">
      {highlight && highlight.width > 0 && highlight.height > 0 && (
        <div
          aria-hidden="true"
          className="absolute overflow-hidden"
          style={{ top: content.top, left: content.left, width: content.width, height: content.height }}
        >
          <div className="animate-tour-ring absolute rounded-[12px]" style={{ top: highlight.top - content.top, left: highlight.left - content.left, width: highlight.width, height: highlight.height, transition: SPOT_TRANSITION }} />
        </div>
      )}

      {headerTarget && targetBox && (
        <div className="animate-tour-ring absolute rounded-[12px]" style={{ top: targetBox.top, left: targetBox.left, width: targetBox.width, height: targetBox.height, transition: SPOT_TRANSITION }} />
      )}

      <div
        ref={popRef}
        data-tour-card={step.key}
        className="pointer-events-auto absolute w-[340px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--overlay-background)] shadow-2xl shadow-black/60 animate-fade-in backdrop-blur-xl"
        style={{
          top: navigationCard?.top ?? popTop,
          left: navigationCard?.left ?? popLeft,
          maxWidth: navigationCard?.maxWidth,
          transition: navigationItemId ? undefined : "top 0.5s cubic-bezier(0.16, 1, 0.3, 1), left 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div className="p-4">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--accent-text)]">
              {last ? <Check size={15} aria-hidden="true" /> : <Compass size={15} aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-text)]">
                {t("onboarding.progress", { current: current + 1, total: stepsLen, defaultValue: `STEP ${current + 1} OF ${stepsLen}` })}
              </p>
              <h3 className="mt-0.5 text-balance text-[15px] font-semibold leading-snug text-[var(--text)]">
                {t(`onboarding.step_${step.key}_title`, { defaultValue: `Step ${step.key}` })}
              </h3>
            </div>
            <button onClick={finish} aria-label={t("onboarding.aria_close", "Close")} className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-md)] text-[var(--muted)] transition-colors hover:bg-white/8 hover:text-[var(--text)] cursor-pointer">
              <X size={15} aria-hidden="true" />
            </button>
          </div>

          <p className="mt-2 text-pretty text-[13px] leading-[1.6] text-[var(--muted)]">
            {t(step.key === 'spoilers' && !target ? 'onboarding.step_spoilers_unavailable_body' : `onboarding.step_${step.key}_body`, { defaultValue: `Description for ${step.key}` })}
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
              {steps.map((s, i) => (
                <span key={s.key} className={cn("h-1.5 rounded-full transition-all", i === current ? "w-4 bg-[var(--accent)]" : "w-1.5 bg-white/20")} />
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              {current > 0 && (
                <button onClick={back} className="flex items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--muted)] transition-colors hover:bg-white/8 hover:text-[var(--text)] cursor-pointer">
                  <ArrowLeft size={13} aria-hidden="true" /> {t("onboarding.btn_back", "Back")}
                </button>
              )}
              <button onClick={next} className="flex cursor-pointer items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]">
                {primaryLabel}
                {!last && <ArrowRight size={13} aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>

        {!last && (
          <button onClick={finish} className="block w-full border-t border-[var(--border)] py-2 text-center text-[11.5px] font-medium text-[var(--muted)] transition-colors hover:bg-white/5 hover:text-[var(--text)] cursor-pointer">
            {t("onboarding.btn_skip", "Skip Tour")}
          </button>
        )}
      </div>
    </div>
  );
};
