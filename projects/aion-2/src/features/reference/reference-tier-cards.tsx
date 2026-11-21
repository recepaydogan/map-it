import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { sameReferenceTarget, useReferenceNavigation, useSelectedReference } from "./reference-navigation-context";
import type { ReferenceSection } from "./reference-types";

const ReferenceTierCards = ({ cards }: { cards: NonNullable<ReferenceSection["tierCards"]> }) => {
  const { t } = useTranslation();
  const open = useReferenceNavigation();
  const selected = useSelectedReference();
  return <div className="@container">
    <div className="grid gap-2 @min-[620px]:grid-cols-3">{cards.tiers.map((tier) => {
      const active = sameReferenceTarget(selected, tier.link);
      const countLabel = t(cards.countLabel);
      const valueLabel = t(cards.valueLabel);
      return <button key={tier.link.id} type="button" onClick={() => open(tier.link)}
        aria-label={`${tier.count} ${countLabel}: ${tier.value} ${valueLabel}`}
        aria-pressed={selected !== undefined ? active : undefined}
        className={cn("group flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-md)] border px-3 py-3 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent @min-[620px]:min-h-24 @min-[620px]:flex-col @min-[620px]:items-stretch",
          active ? "border-accent/60 bg-accent-soft" : "border-border bg-white/[0.025]")}>
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-accent/25 bg-accent/10 text-[13px] font-semibold tabular-nums text-accent">{tier.count}</span>
          <span className="min-w-0 text-[12px] font-medium leading-snug text-zinc-100">{countLabel}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-accent @min-[620px]:justify-between">
          <span className="flex flex-col items-end gap-0.5">
            <span className="text-[19px] font-semibold tabular-nums leading-none">{tier.value}</span>
            <span className="text-[10px] font-normal leading-none text-subtle">{valueLabel}</span>
          </span>
          <ChevronRight size={14} className="text-accent/60" aria-hidden="true" />
        </span>
      </button>;
    })}</div>
  </div>;
};

export default ReferenceTierCards;
