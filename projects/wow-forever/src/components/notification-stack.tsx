import { X, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "../lib/cn";
import "./notification-stack.css";

export interface StackNotification {
  id: string;
  title: string;
  body?: string;
  content?: ReactNode;
  icon: LucideIcon;
  dismissLabel: string;
  onDismiss: () => void;
  action?: { label: string; onClick: () => void };
}

/** The whole stack reserves space, including the edges of the rear cards. */
export default function NotificationStack({ notifications, label }: {
  notifications: StackNotification[];
  label: string;
}) {
  const count = notifications.length;

  if (!count) return null;
  return <div className="notification-stack" data-stacked={count > 1 || undefined}
    style={{ "--notification-stack-depth": Math.min(count, 3) - 1 } as CSSProperties}
    role="region" aria-label={label} data-notification-count={count}>
    {notifications.slice(0, 3).map(({ id, title, body, content, icon: Icon, dismissLabel, onDismiss, action }, index) => (
      <aside key={id} className={cn("notification-stack-card", index > 0 && "notification-stack-card-rear")}
        data-notification-id={id} aria-label={title} aria-hidden={index > 0 || undefined} inert={index > 0}
        style={{ zIndex: count - index, "--notification-depth": index } as CSSProperties}>
        <button type="button" onClick={onDismiss} aria-label={dismissLabel}
          className="absolute right-2 top-2 grid size-8 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-subtle transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
          <X size={15} aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2.5 pr-6">
          <Icon size={18} className="shrink-0 text-forever-blue" aria-hidden="true" />
          <h2 className="text-[13px] font-semibold text-white">{title}</h2>
        </div>
        {body && <p className="mt-2.5 text-xs leading-5 text-zinc-200">{body}</p>}
        {content && <div className="mt-3">{content}</div>}
        {(action || count > 1) && <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          {action && <button type="button" onClick={action.onClick}
            className="cursor-pointer rounded-[var(--radius-sm)] border border-border px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-accent">
            {action.label}
          </button>}
          {count > 1 && <span className="ml-auto text-[10px] tabular-nums text-subtle" aria-hidden="true">1 / {count}</span>}
        </div>}
      </aside>
    ))}
  </div>;
}
