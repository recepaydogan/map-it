import { ChevronRight, DoorOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import { cn } from "../../lib/cn";
import DatabaseSectionTitle from "../database/database-section-title";
import { sameReferenceTarget, useReferenceNavigation, useSelectedReference } from "./reference-navigation-context";
import type { ReferenceLink } from "./reference-types";

const CreatureDungeonContexts = ({ contexts, currentDungeonId }: { contexts: ReferenceLink[]; currentDungeonId?: string }) => {
  const { t } = useTranslation();
  const open = useReferenceNavigation();
  const selected = useSelectedReference();
  const visible = contexts.filter((context) => context.id !== currentDungeonId);
  if (!visible.length) return null;
  return <section className="space-y-3">
    <DatabaseSectionTitle count={visible.length}>{t("reference.guide.foundIn")}</DatabaseSectionTitle>
    <ProgressiveList initialCount={4} className="space-y-2">{visible.map((context) => {
      const active = sameReferenceTarget(selected, context);
      return <button key={context.id} type="button" onClick={() => open(context)}
        aria-pressed={selected !== undefined ? active : undefined}
        className={cn("flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent",
          active ? "border-accent/60 bg-accent-soft" : "border-border bg-surface hover:border-accent/40 hover:bg-accent-soft")}>
        <DoorOpen size={18} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-[13px] font-medium text-zinc-100">{context.name}</span>
        <ChevronRight size={15} className="shrink-0 text-subtle" aria-hidden="true" />
      </button>;
    })}</ProgressiveList>
  </section>;
};

export default CreatureDungeonContexts;
