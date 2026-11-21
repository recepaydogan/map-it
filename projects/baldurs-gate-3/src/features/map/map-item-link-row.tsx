import { ChevronRight, PackageSearch } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import ItemIcon from "../items/item-icon";
import type { ItemDatabaseEntry } from "../items/types";

interface MapItemLinkRowProps {
  item?: ItemDatabaseEntry;
  displayName: string;
  secondary?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  ariaLabel?: string;
  onSelect?: (item: ItemDatabaseEntry) => void;
}

const MapItemLinkRow = ({
  item,
  displayName,
  secondary,
  trailing,
  active = false,
  ariaLabel,
  onSelect,
}: MapItemLinkRowProps) => {
  const interactive = Boolean(item && onSelect);
  const content = (
    <>
      {item ? (
        <ItemIcon
          item={item}
          size={38}
          className="grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-white/10 bg-black/25 text-accent"
        />
      ) : (
        <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[var(--radius-sm)] border border-white/10 bg-black/25 text-muted">
          <PackageSearch size={18} aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <strong className="block truncate text-[12px] font-medium text-zinc-100">{displayName}</strong>
        {secondary && <span className="mt-0.5 block truncate text-[10px] font-medium text-muted">{secondary}</span>}
      </span>
      {(trailing || interactive) && (
        <span className="flex max-w-[40%] shrink-0 items-center gap-1">
          {trailing}
          {interactive && <ChevronRight size={14} className="shrink-0 text-muted" aria-hidden="true" />}
        </span>
      )}
    </>
  );

  return interactive ? (
    <button
      type="button"
      onClick={() => onSelect?.(item!)}
      aria-label={ariaLabel}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex min-h-[50px] min-w-0 w-full max-w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border px-2 py-1.5 transition-colors",
        active
          ? "border-accent/45 bg-accent-soft"
          : "border-border bg-white/[0.03] hover:border-accent/50 hover:bg-accent-soft",
      )}
    >
      {content}
    </button>
  ) : (
    <div className="flex min-h-[50px] min-w-0 w-full max-w-full items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2 py-1.5">
      {content}
    </div>
  );
};

export default MapItemLinkRow;
