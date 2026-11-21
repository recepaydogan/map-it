import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getPortalRoot } from "../../lib/portal";

export interface HeaderNavigationItem {
  id: string;
  label: string;
  active: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  tour?: string;
}

const HeaderNavigation = ({ items }: { items: HeaderNavigationItem[] }) => {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const moreMeasureRef = useRef<HTMLSpanElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const labelsKey = items.map(({ id, label }) => `${id}:${label}`).join("\u0000");

  useLayoutEffect(() => {
    const root = rootRef.current;
    const measureRow = measureRef.current;
    const more = moreMeasureRef.current;
    if (!root || !measureRow || !more) return;

    const measure = () => {
      const widths = Array.from(measureRow.children, (child) => child.getBoundingClientRect().width);
      const available = root.clientWidth - 2;
      const total = widths.reduce((sum, width) => sum + width, 0);
      if (total <= available) {
        setVisibleCount(items.length);
        return;
      }

      const moreWidth = more.getBoundingClientRect().width;
      let used = 0;
      let count = 0;
      for (const width of widths) {
        if (used + width + moreWidth > available) break;
        used += width;
        count++;
      }
      setVisibleCount(count);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(measureRow);
    observer.observe(more);
    measure();
    return () => observer.disconnect();
  }, [items.length, labelsKey]);

  const hiddenItems = items.slice(visibleCount);
  const hiddenActive = hiddenItems.some((item) => item.active);

  return (
    <nav ref={rootRef} aria-label={t("chrome.navigation")} className="relative flex h-full w-full min-w-0 items-center overflow-hidden">
      <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex h-10 w-max items-center whitespace-nowrap">
        {items.map((item) => <span key={item.id} className={cn(
          "flex h-10 items-center whitespace-nowrap text-[12.5px] font-medium",
          item.icon ? "gap-1.5 px-3" : "px-2.5",
        )}>
          {item.icon}{item.label}
        </span>)}
      </div>
      <span ref={moreMeasureRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex h-10 w-max items-center gap-1 px-2.5 text-[12.5px] font-medium">
        {t("chrome.more")}<ChevronDown size={13} aria-hidden="true" />
      </span>

      {items.slice(0, visibleCount).map((item) => <button
        key={item.id}
        type="button"
        data-ow-no-drag
        data-tour={item.tour}
        onClick={item.onSelect}
        aria-current={item.active ? "page" : undefined}
        className={cn(
          "flex h-10 shrink-0 cursor-pointer items-center whitespace-nowrap text-[12.5px] font-medium transition-colors outline-none focus-visible:bg-accent-soft",
          item.icon ? "gap-1.5 px-3" : "px-2.5",
          item.active ? "bg-accent-soft text-accent" : "text-white/75 hover:bg-white/8 hover:text-white",
        )}
      >
        {item.icon}{item.label}
      </button>)}

      {hiddenItems.length > 0 && <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger
          data-ow-no-drag
          className={cn(
            "flex h-10 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap px-2.5 text-[12.5px] font-medium transition-colors outline-none focus-visible:bg-accent-soft",
            hiddenActive ? "bg-accent-soft text-accent" : "text-white/75 hover:bg-white/8 hover:text-white",
          )}
        >
          {t("chrome.more")}
          <ChevronDown size={13} aria-hidden="true" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal container={getPortalRoot()}>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            collisionBoundary={getPortalRoot()}
            collisionPadding={8}
            className="pointer-events-auto z-[1600] min-w-40 max-w-[var(--radix-dropdown-menu-content-available-width)] rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-xl shadow-black/50 animate-fade-in"
          >
            {hiddenItems.map((item) => <DropdownMenu.Item
              key={item.id}
              data-tour={item.tour}
              onSelect={item.onSelect}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "cursor-pointer rounded-[var(--radius-sm)] px-3 py-2 text-[13px] outline-none data-[highlighted]:bg-surface-hover",
                item.active ? "text-accent" : "text-zinc-200",
              )}
            >
              {item.label}
            </DropdownMenu.Item>)}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>}
    </nav>
  );
};

export default HeaderNavigation;
