import { useGameText } from "../../i18n/game-text";
import { BookOpen, ChevronRight, Sparkles } from "lucide-react";
import EnshroudedItemImage from "../knowledge/enshrouded-item-image";
import { hasEnshroudedEntry, type EnshroudedEntryTarget } from "./enshrouded-entry-data";

export interface EnshroudedLootRow {
  name: string;
  quantity?: string | number | null;
  target?: EnshroudedEntryTarget;
  kind?: "xp" | "recipes";
  detail?: string;
}

export default function EnshroudedLootRows({ rows, onOpenEntry }: {
  rows: EnshroudedLootRow[];
  onOpenEntry: (target: EnshroudedEntryTarget) => void;
}) {
  const contentText = useGameText();
  if (!rows.length) return null;
  return <div className="grid gap-1.5">
    {rows.map((row, index) => {
      const target = row.target ?? { page: row.name };
      const linked = !row.kind && hasEnshroudedEntry(target);
      const content = <>
        {row.kind === "xp" ? <Sparkles size={28} className="shrink-0 p-1 text-violet-300" aria-hidden="true" />
          : row.kind === "recipes" ? <BookOpen size={28} className="shrink-0 p-1 text-accent" aria-hidden="true" />
            : <EnshroudedItemImage name={row.name} size={28} />}
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-medium leading-4 text-zinc-100">
            {contentText(row.name)}
            {row.quantity != null && row.quantity !== "" && <span className="ml-1.5 whitespace-nowrap text-[11px] font-normal tabular-nums text-zinc-400">×{contentText(row.quantity)}</span>}
          </span>
          {contentText(row.detail && <span className="mt-0.5 block text-[10px] leading-3 text-zinc-400">{contentText(row.detail)}</span>)}
        </span>
        {linked && <ChevronRight size={13} className="shrink-0 text-zinc-500" aria-hidden="true" />}
      </>;
      const className = "flex min-h-12 w-full min-w-0 items-center gap-2.5 rounded-md border border-border/70 bg-white/[0.025] px-2.5 py-2 text-left";
      return linked ? <button key={`${row.name}-${index}`} type="button" onClick={() => onOpenEntry(target)}
        className={`${className} cursor-pointer transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent`}>{content}</button>
        : <div key={`${row.name}-${index}`} className={className}>{content}</div>;
    })}
  </div>;
}
