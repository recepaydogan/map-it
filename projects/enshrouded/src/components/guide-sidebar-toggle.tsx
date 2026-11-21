import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

interface GuideSidebarToggleProps {
  collapsed: boolean;
  label: string;
  onToggle: () => void;
}

export default function GuideSidebarToggle({ collapsed, label, onToggle }: GuideSidebarToggleProps) {
  return <div className="hidden shrink-0 justify-end border-t border-border py-1 @min-[760px]:flex">
    <button type="button" onClick={onToggle} aria-label={label} aria-expanded={!collapsed} title={label}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-zinc-400 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
      {collapsed ? <PanelLeftOpen size={15} aria-hidden="true" /> : <PanelLeftClose size={15} aria-hidden="true" />}
    </button>
  </div>;
}
