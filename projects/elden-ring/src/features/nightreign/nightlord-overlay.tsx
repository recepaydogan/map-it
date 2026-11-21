import { useState } from "react";
import { ChevronLeft, Crown, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { nrNightlords, nrNightlordMeta } from "../../data/nightreign-data";
import { Emblem, NightlordDetail } from "./nightlord-detail";
import { cn } from "../../lib/cn";
import { useIsMobile } from "../../utils/platform";

/**
 * The Nightlord codex — a full-screen browser over the 8 final-night bosses, mirroring the
 * Nightfarer roster's chrome (masthead, left rail, detail page). The same NightlordDetail that
 * lives cramped inside the seed-bar dropdown gets the full window here, so a player can study a
 * boss's weaknesses, vitals and resistance table at a glance before building toward it.
 */
const NightlordOverlay = ({ onClose, initialName }: { onClose: () => void; initialName?: string | null }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(
    () => (initialName && nrNightlords.includes(initialName) ? initialName : nrNightlords[0]),
  );
  const meta = nrNightlordMeta.get(selected);

  // Phone layout is single-pane master/detail, identical to the Nightfarer roster: the boss list
  // and the detail page never share the row. `isMobile` is always false in Overwolf (≥1300px), so
  // the desktop two-column layout is untouched there.
  const isMobile = useIsMobile();
  const [mobileDetail, setMobileDetail] = useState(!!initialName);
  const pick = (name: string) => {
    setSelected(name);
    setMobileDetail(true); // slide to the detail pane on phones (no-op on desktop)
  };

  return (
    <div data-game="nightreign" className="absolute inset-0 z-[1500] flex flex-col bg-background animate-fade-in">
      <header className="relative flex items-center gap-3 border-b border-border px-4 py-3.5 sm:px-6 sm:py-4">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/[0.07] to-transparent" />
        <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
          <Crown size={18} className="text-accent" aria-hidden="true" />
        </div>
        <div className="relative min-w-0">
          <h1 className="font-display text-[16px] font-semibold uppercase leading-none tracking-[0.14em] text-white sm:text-[19px] sm:tracking-[0.18em]">{t("nightreign.nightlords")}</h1>
          <p className="mt-1 truncate text-[11px] tracking-wide text-muted">{t("nightreign.nightlordsSubtitle")}</p>
        </div>
        <div className="flex-1" />
        <button
          onClick={onClose}
          aria-label={t("nightreign.closeNightlords")}
          className="relative grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white cursor-pointer"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 px-3 pb-3 pt-[18px]">
        {(!isMobile || !mobileDetail) && (
          <nav className={cn(
            "shrink-0 overflow-y-auto border-border p-2",
            isMobile ? "w-full" : "w-56 border-r",
          )}>
            <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{t("nightreign.nightlords")}</p>
            {nrNightlords.map((n) => {
              const m = nrNightlordMeta.get(n);
              const active = n === selected;
              return (
                <button
                  key={n}
                  onClick={() => pick(n)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "group relative flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors cursor-pointer",
                    active ? "bg-accent-soft" : "hover:bg-white/5",
                  )}
                >
                  <span aria-hidden="true" className={cn("absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent transition-opacity", active ? "opacity-100" : "opacity-0")} />
                  <Emblem id={m?.iconId} size={36} />
                  <div className="min-w-0">
                    <p className={cn("truncate text-[13px] font-medium", active ? "text-white" : "text-zinc-300")}>{n}</p>
                    <p className="truncate text-[11px] text-zinc-500">{m?.bossForm ?? "—"}</p>
                  </div>
                </button>
              );
            })}
          </nav>
        )}

        {(!isMobile || mobileDetail) && (
          <div className="flex min-w-0 flex-1 flex-col">
            {isMobile && (
              <button
                onClick={() => setMobileDetail(false)}
                className="flex shrink-0 items-center gap-1.5 border-b border-border px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white cursor-pointer"
              >
                <ChevronLeft size={16} aria-hidden="true" />
                {t("nightreign.nightlords")}
              </button>
            )}
            {/* The detail card is single-column by design (combat-tip sentences read best at one
                width) and left-aligned — it sits flush against the boss-list rail rather than
                floating centred in the roomy window, which left a dead gap between the two and
                read as broken. The max width still keeps the prose from stretching too wide. */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="max-w-2xl px-2 py-2 sm:px-4 sm:py-4">
                <NightlordDetail name={selected} m={meta} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NightlordOverlay;
