import { ArrowRight, Package } from "lucide-react";
import { cn } from "../../lib/cn";
import MapPointIcon from "../map/map-point-icon";
import type { InspectorLink } from "./inspector-types";

type TransactionItemValue = NonNullable<InspectorLink["transaction"]>["inputs"][number];

const TransactionItem = ({ item }: { item: TransactionItemValue }) => (
  <span className="flex min-w-0 items-center gap-1.5">
    <span className="grid h-8 w-8 shrink-0 place-items-center">
      <MapPointIcon source={item.image} fallback={Package} size={30} className="guide-asset-icon" />
    </span>
    <span className="min-w-0 whitespace-normal break-words text-[12px] font-medium leading-4 text-zinc-100">{item.name}
      {item.quantity !== undefined && <span className="ml-1 text-zinc-500">×{item.quantity}</span>}
    </span>
  </span>
);

const InspectorLinkRow = ({ link, selected, onSelect, inline = false }: { link: InspectorLink; selected: boolean;
  onSelect?: () => void; inline?: boolean }) => {
  const brewingStep = link.key.startsWith("brewing:path:");
  const className = cn("flex items-center gap-2.5 text-left",
    inline ? "w-fit max-w-full" : "w-full",
    onSelect ? "cursor-pointer rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2 transition-colors hover:border-accent/50 hover:bg-white/[0.06]"
      : "border-b border-border/60 px-0.5 py-2.5",
    brewingStep && "min-h-0 py-1.5",
    onSelect && selected && "border-accent/50 bg-accent-soft");
  const content = <>
    {link.transaction ? <span className="min-w-0 flex-1">
      <span className={cn("grid items-center gap-2", brewingStep
        ? "grid-cols-[42px_minmax(0,1fr)_18px_minmax(0,1fr)_16px]"
        : "grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)]")}>
        {brewingStep && <span className="text-[10px] font-semibold text-subtle">{link.note}</span>}
        <span className="min-w-0">
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">{link.transaction.inputs.map((item, index) =>
            <TransactionItem key={`${item.name}:${index}`} item={item} />)}</span>
          {!brewingStep && link.note && <span className="mt-1 block whitespace-normal break-words pl-0.5 text-[10px] leading-4 text-subtle">{link.note}</span>}
        </span>
        <ArrowRight aria-hidden="true" className="h-4 w-4 text-accent" />
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">{link.transaction.outputs.map((item, index) =>
          <TransactionItem key={`${item.name}:${index}`} item={item} />)}</span>
        {brewingStep && <ArrowRight aria-hidden="true" className="h-4 w-4 text-accent" />}
      </span>
    </span> : <>
      <span className="grid h-[26px] w-[26px] shrink-0 place-items-center text-accent">
        <MapPointIcon source={link.image} fallback={Package} size={26} className="guide-asset-icon" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-zinc-100">{link.name}
          {link.quantity !== undefined && <span className="ml-1 text-zinc-500">×{link.quantity}</span>}
        </span>
        {link.note && <span className="block whitespace-normal break-words text-[11px] leading-4 text-subtle">{link.note}</span>}
      </span>
    </>}
  </>;
  return onSelect ? <button type="button" data-inspector-focus={link.key} data-inspector-kind={link.subject.kind}
    data-inspector-id={link.subject.id} onClick={onSelect} aria-pressed={selected} aria-label={link.name}
    className={className}>{content}</button>
    : <div className={className}>{content}</div>;
};

export default InspectorLinkRow;
