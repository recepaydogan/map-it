import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import ItemIcon from "../../components/item-icon";
import { useOnboarding, shouldAutoStartOnboarding } from "../onboarding/use-onboarding";
import { useUiStore } from "../../store/ui-store";
import { shouldAutoOpenWhatsNew, useWhatsNew } from "./use-whats-new";

/**
 * The release announcement — the app's own voice, once per release.
 *
 * It obeys the same two hard rules as the guided tour: the dim never covers the
 * Overwolf ad rail (it is clipped to the <main> map region), and it never blocks
 * the title-bar controls. Everything else is deliberately unlike a coach-mark:
 * it takes the middle of the map, it SHOWS the feature moving instead of
 * describing it, and it waits for a real acknowledgement.
 */

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Delay before it speaks up, so the map and panels have settled first. */
const OPEN_DELAY_MS = 900;

/**
 * The demo is the advisor's REAL output, frozen: Fire Giant at rune level 100 and
 * 150, straight from recommendBossBuild (weapon, upgrade, boss-adjusted AR, the
 * +10% physical weakness, the stat spread). Invented numbers in a screenshot of
 * your own feature are a lie you have to keep telling, so these are the ones the
 * app actually produces.
 */
const BUILDS = [
  { level: "100", upgrade: "+7", ar: "458", stats: ["48", "13", "29", "48"] },
  { level: "150", upgrade: "+10", ar: "593", stats: ["56", "34", "50", "48"] },
] as const;

const WEAPON_ICON_ID = 10322; // Hand of Malenia
const STAT_KEYS = ["vig", "mind", "end", "dex"] as const;

/**
 * One state of the recommendation. Both states occupy the SAME grid cell and
 * cross-fade, so the box grows to whichever is taller on its own — no hand-tuned
 * pixel height to get wrong (the earlier `h-[96px]` guess is exactly what clipped
 * the stat row).
 */
const MockBuild = ({
  swap,
  build,
}: {
  swap: string;
  build: (typeof BUILDS)[number];
}) => {
  const { t } = useTranslation();
  return (
    <div className={`${swap} col-start-1 row-start-1 rounded-[8px] border border-accent/25 bg-black/35 p-3`}>
      <div className="flex items-center gap-2.5">
        <ItemIcon iconId={WEAPON_ICON_ID} category="weapon" color="#d4af69" glyph="sword" size={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight text-zinc-50">
            Hand of Malenia
          </span>
          <span className="mt-0.5 block truncate text-[10px] leading-tight text-zinc-500">
            {t("detail.buildAdvisor.affinityNone")} · {build.upgrade}
          </span>
        </span>
      </div>

      {/* Reads like the real card: the boss-adjusted number leads, the damage
          channel sits beside it as a coloured chip. */}
      <div className="mt-2.5 flex items-end justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-[8.5px] font-semibold uppercase tracking-[0.13em] text-zinc-500">
            {t("detail.buildAdvisor.bossAr")}
          </span>
          <span className="mt-1 block font-display text-[26px] font-bold leading-none tabular-nums text-accent">
            {build.ar}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2 py-1">
            <span className="h-2 w-2 rounded-full bg-[#94a3b8]" />
            <span className="text-[10px] text-zinc-300">{t("combatType.Physical")}</span>
          </span>
          <span className="rounded-full bg-accent/15 px-2 py-1 text-[10px] font-bold tabular-nums text-accent">
            +10%
          </span>
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {STAT_KEYS.map((stat, index) => (
          <span key={stat} className="rounded-[6px] bg-black/40 py-1.5 text-center">
            <span className="block text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
              {t(`detail.buildAdvisor.stat.${stat}`)}
            </span>
            <span className="mt-0.5 block text-[13px] font-bold leading-tight tabular-nums text-zinc-100">
              {build.stats[index]}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
};

/**
 * A living miniature of the feature: the rune level moves, and the whole
 * recommendation re-fits to it — a stronger weapon, a different damage split, a
 * different stat spread. Both loops run on one shared 5s clock (see the `wn*`
 * keyframes in index.css) so the slider and the card never drift apart.
 * Motion-reduce freezes it on the first build, which still reads as "here is a
 * build for this boss".
 */
const BossBuildDemo = () => {
  const { t } = useTranslation();
  return (
    /* Height comes from the content — a fixed one clipped the build card the
       moment the tab bar was added. */
    <div className="relative overflow-hidden rounded-[var(--radius-md)] border border-white/8 bg-[#100e0a] p-4">
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(120% 90% at 15% 0%, rgba(212,175,105,0.13), transparent 60%), radial-gradient(90% 80% at 90% 100%, rgba(120,140,180,0.10), transparent 60%)",
        }}
        aria-hidden="true"
      />

      {/* A miniature of the real detail panel — the boss it is for, its tab bar,
          and the build underneath — so it doubles as the answer to "where do I
          find this?". */}
      <div className="relative rounded-[12px] border border-white/12 bg-surface/95 p-3 shadow-lg shadow-black/40">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-display text-[14px] font-semibold text-zinc-100">Fire Giant</span>
          <span className="shrink-0 text-[9px] uppercase tracking-[0.14em] text-zinc-500">
            {t("detail.combatTab.beta")}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <span className="rounded-[6px] bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-on-accent">
            {t("detail.combatTab.build")}
          </span>
          <span className="rounded-[6px] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {t("detail.combatTab.intel")}
          </span>
        </div>

        {/* The one input: your rune level. */}
        <div className="mt-3 flex items-center gap-2.5">
          <span className="grid shrink-0 rounded-[7px] border border-accent/25 bg-black/45 px-2 py-1 text-[11px] font-bold tabular-nums text-white">
            <span className="animate-wn-swap-a col-start-1 row-start-1 motion-reduce:opacity-100">
              RL {BUILDS[0].level}
            </span>
            <span className="animate-wn-swap-b col-start-1 row-start-1 motion-reduce:opacity-0">
              RL {BUILDS[1].level}
            </span>
          </span>
          <span className="relative h-2 flex-1 rounded-full bg-white/10">
            <span className="animate-wn-level absolute inset-y-0 left-0 w-[30%] rounded-full bg-accent/70">
              <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-accent shadow shadow-black/50" />
            </span>
          </span>
        </div>

        {/* The build that answers it. Both states share one grid cell, so this box
            is exactly as tall as the taller card — never a pixel less. */}
        <div className="mt-3 grid">
          <MockBuild swap="animate-wn-swap-a motion-reduce:opacity-100" build={BUILDS[0]} />
          <MockBuild swap="animate-wn-swap-b motion-reduce:opacity-0" build={BUILDS[1]} />
        </div>
      </div>
    </div>
  );
};

const WhatsNewCard = ({ frame }: { frame: Box | null }) => {
  const { t } = useTranslation();
  const dismiss = useWhatsNew((s) => s.dismiss);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation(); // the map's own Esc handlers must not also fire
      dismiss();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dismiss]);

  if (!frame) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[1600]">
      {/* Dim — clipped to the map region, so the ad rail and the title bar are
          untouched. Clicking it acknowledges the note like the button does. */}
      <button
        type="button"
        aria-label={t("whatsNew.dismiss")}
        onClick={dismiss}
        className="pointer-events-auto absolute cursor-default bg-black/60 animate-fade-in"
        style={{ top: frame.top, left: frame.left, width: frame.width, height: frame.height }}
      />

      <div
        className="absolute flex items-center justify-center px-4 py-4"
        style={{ top: frame.top, left: frame.left, width: frame.width, height: frame.height }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="whats-new-title"
          className="pointer-events-auto max-h-full w-[466px] max-w-full overflow-y-auto rounded-[var(--radius-lg)] border border-accent/25 bg-surface shadow-2xl shadow-black/70 animate-fade-up"
        >
          <div className="flex items-start gap-2.5 px-5 pt-5">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                {t("whatsNew.eyebrow")}
              </p>
              <h2 id="whats-new-title" className="mt-0.5 text-balance font-display text-[17px] font-semibold leading-snug text-white">
                {t("whatsNew.bossBuilds_title")}
              </h2>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label={t("whatsNew.dismiss")}
              className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/8 hover:text-white cursor-pointer"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>

          <div className="px-5 pt-4">
            <BossBuildDemo />
          </div>

          {/* Three short lines, no paragraph: the demo above already shows what
              this does, so the copy only has to name the parts. */}
          <ul className="space-y-2.5 px-5 pt-4">
            {["bossBuilds_point1", "bossBuilds_point2", "bossBuilds_point3"].map((key) => (
              <li key={key} className="flex items-center gap-2.5 text-[13px] leading-[1.35] text-zinc-300">
                <Check size={14} className="shrink-0 text-accent" aria-hidden="true" />
                {t(`whatsNew.${key}`)}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.07] px-5 py-3.5">
            <p className="min-w-0 truncate text-[11px] text-subtle">{t("whatsNew.footnote")}</p>
            <button
              type="button"
              onClick={dismiss}
              className="shrink-0 rounded-[var(--radius-md)] bg-accent px-4 py-2 text-[12.5px] font-semibold text-on-accent transition-colors hover:bg-accent/90 cursor-pointer"
            >
              {t("whatsNew.cta")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

/**
 * Mount gate: measures the map region, auto-opens once per release, and stays out
 * of the way of anything that already owns the screen (the first-run tour, an
 * open full-window overlay).
 */
const WhatsNewDialog = () => {
  const open = useWhatsNew((s) => s.open);
  const show = useWhatsNew((s) => s.show);
  const tourActive = useOnboarding((s) => s.active);
  const [frame, setFrame] = useState<Box | null>(null);

  useEffect(() => {
    // ?whatsnew=1 forces it open — the announcement is otherwise a one-shot, and
    // reviewing it shouldn't mean clearing localStorage.
    if (typeof location !== "undefined" && new URLSearchParams(location.search).has("whatsnew")) {
      show();
      return;
    }
    if (!shouldAutoOpenWhatsNew(!shouldAutoStartOnboarding())) return;
    const timer = window.setTimeout(() => {
      if (useUiStore.getState().activeOverlay === null && !useOnboarding.getState().active) show();
    }, OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [show]);

  // The map region is the only place this may paint; it moves when the ad rail
  // hides (Account / Settings) or the window resizes.
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const main = document.querySelector("main");
      if (!main) return;
      const rect = main.getBoundingClientRect();
      setFrame((prev) =>
        prev
        && Math.abs(prev.top - rect.top) < 0.5
        && Math.abs(prev.left - rect.left) < 0.5
        && Math.abs(prev.width - rect.width) < 0.5
        && Math.abs(prev.height - rect.height) < 0.5
          ? prev
          : { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      );
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  if (!open || tourActive) return null;
  return <WhatsNewCard frame={frame} />;
};

export default WhatsNewDialog;
