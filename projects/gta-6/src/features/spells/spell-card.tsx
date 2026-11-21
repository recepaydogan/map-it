import { ArrowRight } from "lucide-react";
import SpellIcon from "./spell-icon";
import SpellLink from "./spell-link";

const SpellCard = ({ id, name, iconId, badge }: { id: number; name: string; iconId?: number; badge?: string }) => <SpellLink
  id={id}
  name={name}
  wrapperClassName="w-full min-w-0"
  className="group flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-left text-[12px] font-medium text-zinc-100 transition-colors hover:border-accent/50 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-accent"
>
  <SpellIcon id={iconId} name={name} size={30} />
  <span className="min-w-0 flex-1 truncate">{name}</span>
  {badge && <span className="shrink-0 text-[10px] font-semibold text-accent">{badge}</span>}
  <ArrowRight size={14} className="shrink-0 text-subtle group-hover:text-accent" aria-hidden="true" />
</SpellLink>;

export default SpellCard;
