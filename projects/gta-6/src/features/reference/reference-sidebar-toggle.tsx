import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

interface ReferenceSidebarToggleProps {
  collapsed: boolean;
  controls?: string;
  onToggle: () => void;
  className: string;
}

const ReferenceSidebarToggle = ({ collapsed, controls, onToggle, className }: ReferenceSidebarToggleProps) => {
  const { t } = useTranslation();
  const label = t(collapsed ? "reference.showSidebar" : "reference.hideSidebar");

  return <button
    type="button"
    onClick={onToggle}
    aria-label={label}
    aria-controls={controls}
    aria-expanded={!collapsed}
    title={label}
    className={cn("absolute right-1 top-2 z-10 h-8 w-8 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-subtle transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-accent", className)}
  >
    {collapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
  </button>;
};

export default ReferenceSidebarToggle;
