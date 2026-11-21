import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { useOnboarding } from "../onboarding/use-onboarding";
import { useKeyHints, type KeyHintId } from "./use-key-hints";

/** Exit animation length — must match `--animate-hint-out` in index.css. */
const EXIT_MS = 200;

/** A physical-looking key cap. `lit` marks the key the hint is actually about. */
const Kbd = ({
  children,
  lit,
  delay,
}: {
  children: string;
  lit?: boolean;
  /** Stagger for the tap loop, so a cluster ripples instead of pulsing as one. */
  delay?: number;
}) => (
  <kbd
    style={delay ? { animationDelay: `${delay}ms` } : undefined}
    className={cn(
      "grid h-[22px] min-w-[22px] place-items-center rounded-[6px] border px-1.5",
      "font-sans text-[10.5px] font-bold uppercase leading-none tracking-[0.06em]",
      "animate-key-tap motion-reduce:animate-none",
      lit
        ? "border-accent/55 bg-accent/18 text-accent shadow-[inset_0_-2px_0_rgba(0,0,0,0.4)]"
        : "border-white/15 bg-white/[0.06] text-zinc-200 shadow-[inset_0_-2px_0_rgba(0,0,0,0.4)]",
    )}
  >
    {children}
  </kbd>
);

/** The key art for each lesson. Single row, always — the card is one line tall,
 * so the W/A/S/D keys sit side by side instead of in a keyboard cluster. The Esc
 * cap is localized (French keyboards say "Échap"); W A S D are physical keys and
 * read the same everywhere. */
const HintKeys = ({ id, escLabel }: { id: KeyHintId; escLabel: string }) =>
  id === "wasdNav" ? (
    <div className="flex items-center gap-1">
      <Kbd lit>W</Kbd>
      <Kbd lit delay={120}>A</Kbd>
      <Kbd lit delay={240}>S</Kbd>
      <Kbd lit delay={360}>D</Kbd>
    </div>
  ) : (
    <Kbd lit>{escLabel}</Kbd>
  );

const KeyHintToast = ({ id }: { id: KeyHintId }) => {
  const { t } = useTranslation();
  const learned = useKeyHints((s) => s.learned);
  const learn = useKeyHints((s) => s.learn);
  const leaving = useKeyHints((s) => s.current) !== id;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        // One line, content-width: a thin bar of keys + a single sentence. No
        // gradient, no second line of copy — the less it says, the less it
        // interrupts. Flat surface + hairline border reads as chrome, not a toast.
        "pointer-events-auto relative flex max-w-full items-center gap-2.5 overflow-hidden",
        "rounded-[var(--radius-full)] border border-white/12 bg-surface/92 py-2.5 pl-3 pr-2",
        "shadow-xl shadow-black/50 backdrop-blur-xl",
        leaving ? "animate-hint-out" : "animate-hint-in",
        "motion-reduce:animate-none",
      )}
    >
      <div className="flex shrink-0 items-center">
        {learned ? (
          <span className="grid h-[22px] w-[22px] place-items-center rounded-full border border-accent/50 bg-accent/15 text-accent animate-hint-in motion-reduce:animate-none">
            <Check size={13} strokeWidth={3} aria-hidden="true" />
          </span>
        ) : (
          <HintKeys id={id} escLabel={t("keyHints.escKey")} />
        )}
      </div>

      <p className="min-w-0 truncate text-[12.5px] font-medium leading-none tracking-[-0.005em] text-white">
        {learned ? t("keyHints.learnedTitle") : t(`keyHints.${id}_title`)}
      </p>

      <button
        onClick={() => learn(id)}
        aria-label={t("keyHints.dismiss")}
        title={t("keyHints.dismiss")}
        className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
      >
        <X size={12} aria-hidden="true" />
      </button>

      {/* No countdown bar: the pill is small enough to read at a glance and fades
          out on its own (see DURATION_MS), so a draining hairline was one moving
          part too many for something this quiet. */}
    </div>
  );
};

/**
 * Host for the contextual key hints: renders whichever hint the store has on
 * screen, keeps it around for its exit animation, and — the part that matters —
 * retires a lesson the moment the player uses the key it teaches.
 *
 * Mounted once per map surface; positioned bottom-centre over the map, clear of
 * the ad rail and the title bar.
 */
const KeyHintLayer = () => {
  const current = useKeyHints((s) => s.current);
  const tourActive = useOnboarding((s) => s.active);
  // Keep the card mounted through its exit animation after the store clears it.
  // A newly shown hint is adopted during render (React's documented state-
  // adjustment pattern) so it paints in the same commit the store changed in;
  // only the delayed unmount needs a timer.
  const [rendered, setRendered] = useState<KeyHintId | null>(current);
  if (current && current !== rendered) setRendered(current);

  useEffect(() => {
    if (current || !rendered) return;
    const id = setTimeout(() => setRendered(null), EXIT_MS);
    return () => clearTimeout(id);
  }, [current, rendered]);

  // NOTE: this layer deliberately does NOT listen for Esc / W A S D.
  //
  // It used to, so a hint could retire the moment the player used the key. But a
  // store write from a raw keydown listener makes React re-render synchronously,
  // which tears down and re-registers every other keydown listener — and a
  // listener removed mid-dispatch never runs for that event. The result: the
  // first Esc dismissed the hint and left the detail panel open, because the
  // panel's own handler was unregistered at that instant. Deferring the write to
  // a microtask did not help. A hint that eats the key it teaches is worse than
  // no hint, so the listener is gone: hints time out on their own, and the X
  // button retires them for good.

  // The guided tour owns the screen while it runs — no second voice under it.
  if (!rendered || tourActive) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(1rem+var(--anchor-ad-height))] z-[1450] flex justify-center px-4">
      <KeyHintToast id={rendered} />
    </div>
  );
};

export default KeyHintLayer;
