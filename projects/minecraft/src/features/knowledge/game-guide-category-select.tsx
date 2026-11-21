import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { GUIDE_KIND_ICONS, GUIDE_MENU_KINDS, type GuideKind } from "./game-guide-categories";

export type { GuideKind } from "./game-guide-categories";

const GameGuideCategorySelect = ({ value, counts, total, onChange }: {
  value: GuideKind;
  counts: Readonly<Record<Exclude<GuideKind, "all">, number>>;
  total: number;
  onChange: (kind: GuideKind) => void;
}) => {
  const { t } = useTranslation();
  const details = useRef<HTMLDetailsElement>(null);
  const ActiveIcon = GUIDE_KIND_ICONS[value];
  return <details ref={details} className="group relative">
    <summary className="flex w-full cursor-pointer list-none items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent/40 [&::-webkit-details-marker]:hidden">
      <ActiveIcon size={15} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-100">{t(`inspector.subjectKinds.${value}`)}</span>
      <span className="text-[11px] tabular-nums text-subtle">{value === "all" ? total : counts[value]}</span>
      <span aria-hidden="true" className="text-[10px] text-muted transition-transform group-open:rotate-180">▼</span>
    </summary>
    <div className="absolute inset-x-0 top-[calc(100%+4px)] z-30 max-h-44 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--panel-shadow)]">
      {GUIDE_MENU_KINDS.map(kind => {
        const Icon = GUIDE_KIND_ICONS[kind];
        return <button key={kind} type="button" aria-current={value === kind ? "true" : undefined}
          onClick={() => { onChange(kind); details.current?.removeAttribute("open"); }}
          className={cn("flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-white/[0.05]",
            value === kind && "bg-accent-soft")}>
          <Icon size={15} className={value === kind ? "text-accent" : "text-zinc-400"} aria-hidden="true" />
          <span className={cn("min-w-0 flex-1 truncate text-[13px]", value === kind ? "font-medium text-white" : "text-zinc-200")}>
            {t(`inspector.subjectKinds.${kind}`)}
          </span>
          <span className="text-[11px] tabular-nums text-subtle">{kind === "all" ? total : counts[kind]}</span>
        </button>;
      })}
    </div>
  </details>;
};

export default GameGuideCategorySelect;
