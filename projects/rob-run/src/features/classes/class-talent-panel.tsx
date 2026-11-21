import { useState } from "react";
import { useGameNames } from "../../i18n/use-game-names";
import { useGameText } from "../../i18n/game-text";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import ItemIcon from "../database/item-icon";
import DatabaseSectionTitle from "../database/database-section-title";
import type { GameClass } from "./class-types";

const ClassTalentPanel = ({ entry }: { entry: GameClass }) => {
  const { t } = useTranslation();
  const { specializationName } = useGameNames();
  const gameText = useGameText();
  const [selected, setSelected] = useState(entry.trees[0]!.name);
  const tree = entry.trees.find((candidate) => candidate.name === selected) ?? entry.trees[0]!;

  return <div className="space-y-6">
    <div className="grid grid-cols-3 gap-2" role="tablist" aria-label={t("classes.specializations")}>
      {entry.trees.map((candidate) => <button key={candidate.name} type="button" role="tab" aria-selected={tree.name === candidate.name}
        onClick={() => setSelected(candidate.name)}
        className={cn("flex min-h-14 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent",
          tree.name === candidate.name ? "border-accent bg-accent-soft text-white" : "border-border bg-surface text-zinc-300 hover:border-accent/50 hover:text-white")}>
        <ItemIcon icon={candidate.icon} name={specializationName(entry.id, candidate.name)} size={30} />
        <span className="min-w-0"><span className="block text-[12px] font-semibold leading-4">{specializationName(entry.id, candidate.name)}</span><span className="mt-0.5 block text-[11px] text-subtle">{t("classes.newCount", { count: candidate.new.length })}</span></span>
      </button>)}
    </div>

    <section aria-label={t("classes.newTalents")}>
      <DatabaseSectionTitle count={tree.new.length}>{t("classes.newTalents")}</DatabaseSectionTitle>
      {tree.new.length ? <div className="grid gap-2 @min-[750px]:grid-cols-2">{tree.new.map((talent) => <article key={talent.name} className="flex gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-3">
        <ItemIcon icon={talent.icon} name={gameText(talent.name)} size={36} />
        <div className="min-w-0"><h4 className="text-[13px] font-semibold text-white">{gameText(talent.name)}</h4>{talent.description && <p className="mt-1 whitespace-pre-line text-[12px] leading-5 text-zinc-300">{talent.description}</p>}</div>
      </article>)}</div> : <p className="text-[13px] text-muted">{t("classes.noneListed")}</p>}
    </section>

    <div className="grid items-start gap-2 @min-[480px]:grid-cols-2">
      {(["changed", "removed"] as const).map((kind) => <details key={`${tree.name}-${kind}`} className="group rounded-[var(--radius-md)] border border-border bg-surface">
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-3 text-[13px] font-medium text-zinc-200 marker:hidden hover:text-white">
          <span>{t(kind === "changed" ? "classes.changedTalents" : "classes.removedTalents")}</span><span className="tabular-nums text-subtle">{tree[kind].length}</span>
        </summary>
        <div className="border-t border-border px-3 py-3">
          {tree[kind].length ? <ul className="space-y-1.5">{tree[kind].map((name) => <li key={name} className="text-[12px] leading-5 text-zinc-300">{gameText(name)}</li>)}</ul>
            : <p className="text-[12px] text-muted">{t("classes.noneListed")}</p>}
        </div>
      </details>)}
    </div>
  </div>;
};

export default ClassTalentPanel;
