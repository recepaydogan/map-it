import * as RD from "@radix-ui/react-dropdown-menu";
import {
  AlertTriangle,
  Bug,
  Building2,
  Crown,
  Droplets,
  Flame,
  Scale,
  Skull,
  Sparkles,
  Swords,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { getPortalRoot } from "../../lib/portal";
import type { NrEvent } from "../../data/nightreign-events";

// One icon per event type so a glance reads the twist; amber is the shared "event" accent.
// Exported so the Pattern Finder speaks the same visual language as this chip.
export const EVENT_ICON: Record<string, LucideIcon> = {
  "Night Horde": Swords,
  "Meteor Strike": Zap,
  "Morgott Invasion": Crown,
  "Extra Night Boss": Skull,
  "Maris Bubbles": Droplets,
  "Frenzy Tower": Flame,
  "Gnoster Plague": Bug,
  "Libra Curse": Scale,
  "Difficult Sorcerer's Rise": Sparkles,
  "Walking Mausoleum": Building2,
};

export const AMBER = "#e8a13b";

/** Fallback for any event without a dedicated icon. */
export const EVENT_FALLBACK_ICON = AlertTriangle;

/**
 * Seed-bar chip for a pattern's Special Event. Mirrors the Nightlord picker's popover
 * language (Radix dropdown, portal into the non-ads region) so every seed-bar control
 * opens the same kind of rich card. Only rendered when the current pattern has an event.
 */
const EventChip = ({ event }: { event: NrEvent }) => {
  const { t } = useTranslation();
  const Icon = EVENT_ICON[event.name] ?? AlertTriangle;
  const eventLabel = event.day
    ? t("nightreign.specialEventWithDay", { day: event.day })
    : t("nightreign.specialEvent");
  // Event name + description are app-authored (nightreign-events.ts); localize by the
  // English name key, falling back to the English text for any unmapped event.
  const name = t(`nrEvent.${event.name}`, { defaultValue: event.name });
  const description = t(`nrEventDesc.${event.name}`, { defaultValue: event.description });

  return (
    <RD.Root>
      <RD.Trigger asChild>
        <button
          aria-label={`${eventLabel}: ${name}`}
          title={`${eventLabel}: ${name}`}
          className="grid h-full w-8 place-items-center outline-none transition-colors hover:bg-white/5 cursor-pointer"
        >
          <Icon size={15} style={{ color: AMBER }} aria-hidden="true" />
        </button>
      </RD.Trigger>

      <RD.Portal container={getPortalRoot()}>
        <RD.Content
          align="start"
          sideOffset={6}
          className="z-[1400] w-[min(18.75rem,calc(100vw-1.5rem))] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl shadow-black/60 animate-fade-in"
        >
          <div className="relative overflow-hidden px-4 pb-3 pt-3.5">
            <div
              className="pointer-events-none absolute -left-8 -top-12 h-36 w-36 opacity-50 blur-xl"
              style={{ background: `radial-gradient(circle, ${AMBER}66, transparent 70%)` }}
              aria-hidden="true"
            />
            <div className="relative flex items-center gap-2.5">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-full)]"
                style={{ backgroundColor: `${AMBER}26`, boxShadow: `inset 0 0 0 1px ${AMBER}44` }}
              >
                <Icon size={18} style={{ color: AMBER }} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: AMBER }}>
                  {eventLabel}
                </p>
                <h3 className="truncate text-sm font-semibold leading-tight text-white">{name}</h3>
              </div>
            </div>
          </div>
          <p className="px-4 pb-4 text-[12.5px] leading-relaxed text-zinc-300">{description}</p>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
};

export default EventChip;
