import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export default function CollapsibleSidebarToggle({ collapsed, contentId, collapseLabel, expandLabel, onToggle }: {
  collapsed: boolean;
  contentId: string;
  collapseLabel: string;
  expandLabel: string;
  onToggle: () => void;
}) {
  const label = collapsed ? expandLabel : collapseLabel;
  return <div className="mt-auto flex shrink-0 justify-end border-t border-border p-1">
    <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-controls={contentId}
      aria-label={label} title={label}
      className="grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
      {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
    </button>
  </div>;
}
