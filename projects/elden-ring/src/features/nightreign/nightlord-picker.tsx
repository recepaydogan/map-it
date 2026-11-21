import * as RD from "@radix-ui/react-dropdown-menu";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getPortalRoot } from "../../lib/portal";
import { nrNightlords, nrNightlordMeta } from "../../data/nightreign-data";
import { useIsMobile } from "../../utils/platform";
import { Emblem, NightlordDetail } from "./nightlord-detail";

/**
 * Rich Nightlord picker for the Nightreign seed bar. Hovering (or keyboard-focusing) a
 * Nightlord previews its full stat page on the right without changing the map; clicking
 * commits it as the expedition seed.
 *
 * A phone can't show two columns at 560px, and the preview is hover-driven — which a
 * phone hasn't got either. So the same panel becomes a single-column MASTER/DETAIL sized
 * to the viewport: the roster first, and picking a Nightlord commits it AND slides to its
 * full stat page, with a back button to the roster. Nothing is dropped; the same numbers
 * are one tap away instead of one hover.
 */
const NightlordPicker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const selected = nrNightlordMeta.get(value);
  const [viewing, setViewing] = useState(value);
  const viewMeta = nrNightlordMeta.get(viewing);
  /** Phone only: the panel is showing the stat page rather than the roster. */
  const [showDetail, setShowDetail] = useState(false);

  return (
    <RD.Root
      onOpenChange={(open) => {
        if (!open) return;
        setViewing(value);
        setShowDetail(false); // always reopen on the roster
      }}
    >
      <RD.Trigger asChild>
        <button
          title={selected?.description ?? undefined}
          aria-label={value}
          className="group flex h-full items-center gap-1.5 self-stretch rounded-l-[var(--radius-full)] pl-1 pr-2 text-left outline-none transition-colors hover:bg-white/5 focus-visible:bg-white/5 cursor-pointer sm:gap-2 sm:pr-2.5"
        >
          <Emblem id={selected?.iconId} size={30} className="ring-1 ring-white/15" />
          <span className="flex items-center gap-1 text-[13px] font-semibold tracking-tight text-white">
            {/* The Nightlord's emblem already identifies them, and this sits in a
                row a phone can't spare the width for — so the name folds away and
                the portrait carries it (aria-label keeps the control readable). */}
            <span className="hidden sm:inline">{value}</span>
            <ChevronDown
              size={13}
              className="text-zinc-500 transition-colors group-hover:text-zinc-300"
              aria-hidden="true"
            />
          </span>
        </button>
      </RD.Trigger>

      <RD.Portal container={getPortalRoot()}>
        <RD.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          // 560px is two columns wide and simply doesn't exist on a phone — it
          // hung off the screen with the stat page cut in half. There the panel
          // takes the viewport width and drops to ONE column (the roster); the
          // stat page is a hover affordance, and hover is what a phone hasn't got.
          className="z-[1400] flex w-[min(35rem,calc(100vw-1.5rem))] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl shadow-black/60 animate-fade-in"
        >
          {/* Left rail: the 8 Nightlords. Hover/focus previews; click commits.
              On a phone it IS the panel until you pick someone, then the stat
              page below takes over (master/detail). */}
          <div
            className={cn(
              "flex max-h-[72vh] w-full shrink-0 flex-col gap-0.5 overflow-y-auto border-border bg-black/25 p-1.5 sm:w-[164px] sm:border-r",
              isMobile && showDetail && "hidden",
            )}
          >
            <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-subtle">
              {t("nightreign.nightlords")}
            </p>
            {nrNightlords.map((n) => {
              const m = nrNightlordMeta.get(n);
              const active = n === value;
              const isViewing = n === viewing;
              return (
                <RD.Item
                  key={n}
                  // Keep the panel open on click so the player can pick and keep comparing —
                  // preventDefault stops Radix's default close-on-select. Esc / click-outside closes.
                  // A phone has no hover, so the pick is also how you ask to SEE a
                  // Nightlord: it commits the seed and slides the panel to that
                  // stat page. Either way the panel stays open.
                  onSelect={(e) => {
                    e.preventDefault();
                    onChange(n);
                    setViewing(n);
                    if (isMobile) setShowDetail(true);
                  }}
                  onPointerEnter={() => setViewing(n)}
                  onFocus={() => setViewing(n)}
                  className={`flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 outline-none transition-colors ${
                    isViewing ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
                  }`}
                >
                  <Emblem id={m?.iconId} size={30} className={active ? "ring-2 ring-accent" : ""} />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className={`truncate text-[12px] font-medium ${active ? "text-accent" : "text-zinc-200"}`}>
                      {n}
                    </span>
                    <span className="truncate text-[10px] text-zinc-500">{m?.bossForm ?? "—"}</span>
                  </span>
                </RD.Item>
              );
            })}
          </div>

          {/* Right: live stat page for the previewed Nightlord. Beside the roster
              on desktop; on a phone it REPLACES the roster once one is picked,
              fronted by a back button — the master/detail half of this panel. */}
          <div
            className={cn(
              "min-w-0 flex-1 overflow-y-auto",
              isMobile && !showDetail && "hidden",
            )}
            style={{ maxHeight: "72vh" }}
          >
            {isMobile && (
              <button
                type="button"
                onClick={() => setShowDetail(false)}
                className="flex min-h-11 w-full shrink-0 items-center gap-1.5 border-b border-border px-3 text-[13px] font-medium text-zinc-300 hover:text-white cursor-pointer"
              >
                <ChevronLeft size={16} aria-hidden="true" />
                {t("nightreign.nightlords")}
              </button>
            )}
            <NightlordDetail name={viewing} m={viewMeta} />
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
};

export default NightlordPicker;
