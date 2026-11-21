import { ArrowUpRight, type LucideIcon } from "lucide-react";

const MapDestinationLink = ({ icon: Icon, iconPath, title, subtitle, onClick }: {
  icon: LucideIcon;
  iconPath?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClick: () => void;
}) => <button type="button" onClick={onClick}
  className="group flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border bg-white/[0.025] px-3 py-2.5 text-left transition-colors hover:border-accent/40 hover:bg-accent-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
  <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-accent/15 bg-accent/5 text-accent/80 group-hover:text-accent">
    {iconPath ? <img src={iconPath} alt="" className="size-6 object-contain" /> : <Icon size={16} aria-hidden="true" />}
  </span>
  <span className="min-w-0 flex-1">
    <span className="block text-[13px] font-medium leading-snug text-zinc-100">{title}</span>
    {subtitle && <span className="mt-0.5 block text-[11px] leading-snug text-zinc-400">{subtitle}</span>}
  </span>
  <ArrowUpRight size={14} className="shrink-0 text-zinc-500 transition-colors group-hover:text-accent" aria-hidden="true" />
</button>;

export default MapDestinationLink;
