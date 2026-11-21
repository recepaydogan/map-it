import { useId, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import ReferenceSidebarToggle from "./reference-sidebar-toggle";

const layouts = {
  700: { display: "@min-[700px]:flex", rail: "@min-[700px]:w-10", toggle: "@min-[700px]:grid", hideList: "@min-[700px]:hidden" },
  768: { display: "@min-[768px]:flex", rail: "@min-[768px]:w-10", toggle: "@min-[768px]:grid", hideList: "@min-[768px]:hidden" },
};

const ReferenceListSidebar = ({ children, desktopWidth, mobileDetail, breakpoint = 768, compact = false, label }: {
  children: ReactNode;
  desktopWidth: string;
  mobileDetail: boolean;
  breakpoint?: keyof typeof layouts;
  compact?: boolean;
  label?: string;
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const listId = useId();
  const layout = layouts[breakpoint];

  return <aside aria-label={label} className={cn("relative min-h-0 w-full shrink-0 flex-col border-border",
    mobileDetail ? "hidden" : "flex", !compact && "border-r", !compact && layout.display,
    !compact && (collapsed ? layout.rail : desktopWidth))}>
    {!compact && <ReferenceSidebarToggle collapsed={collapsed} controls={listId} onToggle={() => setCollapsed((value) => !value)}
      className={cn("hidden", layout.toggle)} />}
    <div id={listId} className={cn("flex min-h-0 flex-1 flex-col", !compact && collapsed && layout.hideList)}>{children}</div>
  </aside>;
};

export default ReferenceListSidebar;
