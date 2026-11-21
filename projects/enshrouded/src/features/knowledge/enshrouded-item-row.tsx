import { useGameText } from "../../i18n/game-text";
import { ChevronRight } from "lucide-react";
import EnshroudedItemImage from "./enshrouded-item-image";

export default function EnshroudedItemRow({ name, label, quantity, onClick }: {
  name: string;
  label?: string;
  quantity?: number | string | null;
  onClick?: () => void;
}) {
  const contentText = useGameText();
  const content = <>
    <EnshroudedItemImage name={name} size={28} />
    <span className="min-w-0 truncate">{contentText(label ?? name)}</span>
    {quantity !== undefined && quantity !== null && quantity !== "" &&
      <span className="shrink-0 font-semibold tabular-nums text-zinc-300">×{contentText(quantity)}</span>}
    {onClick && <ChevronRight size={13} className="shrink-0 text-zinc-500" aria-hidden="true" />}
  </>;
  const className = "flex w-fit max-w-full min-w-0 items-center gap-2 py-1.5 text-left text-xs text-zinc-200";
  return onClick ? <button type="button" onClick={onClick} className={`${className} hover:text-white`}>{content}</button>
    : <div className={className}>{content}</div>;
}
