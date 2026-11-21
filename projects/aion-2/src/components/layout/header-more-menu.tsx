import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getPortalRoot } from "../../lib/portal";

interface HeaderMoreMenuProps {
  active: string | null;
  items: { key: string; label: string; indicator?: ReactNode }[];
  onSelect: (key: string) => void;
}

const HeaderMoreMenu = ({ active, items, onSelect }: HeaderMoreMenuProps) => {
  const { t } = useTranslation();
  const indicator = items.find((item) => item.indicator)?.indicator;

  return <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger data-ow-no-drag data-tour="more-page" data-nav-more
      className={cn("flex h-10 cursor-pointer items-center gap-1 whitespace-nowrap px-3 text-[12.5px] font-medium transition-colors outline-none focus-visible:bg-accent-soft",
        active ? "bg-accent-soft text-accent" : "text-white/75 hover:bg-white/8 hover:text-white")}
    >{t("chrome.more")}{indicator}<ChevronDown size={13} aria-hidden="true" /></DropdownMenu.Trigger>
    <DropdownMenu.Portal container={getPortalRoot()}>
      <DropdownMenu.Content align="end" sideOffset={4} collisionBoundary={getPortalRoot()} collisionPadding={8}
        className="pointer-events-auto z-[1600] min-w-40 max-w-[var(--radix-dropdown-menu-content-available-width)] rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-xl shadow-black/50 animate-fade-in">
        {items.map((item) => <DropdownMenu.Item key={item.key} onSelect={() => onSelect(item.key)}
          aria-current={active === item.key ? "page" : undefined}
          className={cn("flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] outline-none data-[highlighted]:bg-surface-hover",
            active === item.key ? "text-accent" : "text-zinc-200")}>{item.label}{item.indicator}</DropdownMenu.Item>)}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
};

export default HeaderMoreMenu;
