import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

const ReferenceSidebarToggle = ({ collapsed, onToggle, container = false }: {
  collapsed: boolean;
  onToggle: () => void;
  container?: boolean;
}) => {
  const { t } = useTranslation();
  const label = t(collapsed ? "reference.sidebar.expand" : "reference.sidebar.collapse");
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return <div className={cn("order-last mt-auto hidden shrink-0 border-t border-border p-1", container ? "@min-[700px]:flex" : "md:flex", collapsed ? "justify-center" : "justify-end")}>
    <button type="button" onClick={onToggle} aria-label={label} title={label} aria-expanded={!collapsed}
      className="grid h-8 w-8 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-subtle transition-colors hover:bg-surface-hover hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
      <Icon size={17} aria-hidden="true" />
    </button>
  </div>;
};

export default ReferenceSidebarToggle;
