import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

export interface MarkerChangeItem {
  id: string;
  name: string;
  /** No name could be resolved (its view/category chunk isn't loaded), so `name`
   * is the raw marker id — shown monospaced so it doesn't read as a real name. */
  unresolved?: boolean;
}

interface MarkerChangeSectionProps {
  items: MarkerChangeItem[];
  title: string;
  onRestore: (id: string) => void;
}

const MarkerChangeSection = ({
  items,
  title,
  onRestore,
}: MarkerChangeSectionProps) => {
  const { t } = useTranslation();

  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between border-b border-border/70 bg-white/[0.025] px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            {title}
          </h3>
          <span className="tabular-nums text-[10px] text-subtle">{items.length}</span>
        </div>
      </div>
      <ul className="py-1">
        {items.map((marker) => (
          <li
            key={marker.id}
            className="group/row flex items-center gap-2 px-3 py-1.5 hover:bg-white/5"
          >
            <span
              title={marker.name}
              className={cn(
                "flex-1 truncate text-[12px]",
                marker.unresolved ? "font-mono text-[11px] text-zinc-500" : "text-zinc-300",
              )}
            >
              {marker.name}
            </span>
            <button
              onClick={() => onRestore(marker.id)}
              className="flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-emerald-500/15 hover:text-emerald-300 cursor-pointer"
            >
              <RotateCcw size={12} aria-hidden="true" /> {t("mapEdit.restore")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default MarkerChangeSection;
