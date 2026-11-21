import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { SupportStatus } from "../../services/support/support-service";

/** One vocabulary for a thread's state, so both sides read it the same way. */
const STATUS: Record<SupportStatus, { key: string; className: string }> = {
  open: { key: "support.status.open", className: "bg-accent/15 text-accent" },
  answered: { key: "support.status.answered", className: "bg-emerald-500/15 text-emerald-300" },
  closed: { key: "support.status.closed", className: "bg-white/[0.06] text-zinc-400" },
};

const SupportStatusChip = ({
  status,
  className,
}: {
  status: SupportStatus;
  className?: string;
}) => {
  const { t } = useTranslation();
  const spec = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[var(--radius-full)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
        spec.className,
        className,
      )}
    >
      {t(spec.key)}
    </span>
  );
};

export default SupportStatusChip;
