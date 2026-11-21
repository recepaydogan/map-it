import { ChevronDown } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { GUIDE_KIND_ICONS, GUIDE_MENU_KINDS, type GuideKind } from "../../features/knowledge/game-guide-categories";
import { cn } from "../../lib/cn";

const GuideHeaderMenu = ({ active, value, onSelect }: {
  active: boolean;
  value: GuideKind;
  onSelect: (kind: GuideKind) => void;
}) => {
  const { t } = useTranslation();
  const details = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeWhenOutside = (event: PointerEvent) => {
      if (!details.current?.contains(event.target as Node)) details.current?.removeAttribute("open");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !details.current?.hasAttribute("open")) return;
      event.preventDefault();
      details.current.removeAttribute("open");
      details.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return <details ref={details} className="group relative h-full" data-tour="guide">
    <summary aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-full cursor-pointer list-none items-center gap-1.5 border-b-2 border-transparent px-3 pt-0.5 text-[12px] font-semibold text-white/75 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px] [&::-webkit-details-marker]:hidden",
        active && "border-accent text-accent",
      )}>
      {t("inspector.guide")}
      <ChevronDown size={13} className="transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="absolute left-0 top-full z-[1700] mt-1 w-52 overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface py-1 shadow-[var(--panel-shadow)]">
      {GUIDE_MENU_KINDS.map(kind => {
        const Icon = GUIDE_KIND_ICONS[kind];
        const selected = active && value === kind;
        return <button key={kind} type="button" aria-current={selected ? "true" : undefined}
          onClick={() => {
            onSelect(kind);
            details.current?.removeAttribute("open");
          }}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-none",
            selected ? "bg-accent-soft font-medium text-white" : "text-zinc-200",
          )}>
          <Icon size={15} className={selected ? "text-accent" : "text-zinc-400"} aria-hidden="true" />
          {t(`inspector.subjectKinds.${kind}`)}
        </button>;
      })}
    </div>
  </details>;
};

export default GuideHeaderMenu;
