import type { StatRow } from "../../data/types";

/** Facts grid (Layer 1) — weapon scaling, talisman effect, etc. */
const DetailStats = ({ stats }: { stats: StatRow[] }) => (
  <dl className="grid grid-cols-2 gap-1.5">
    {stats.map((s) => (
      <div
        key={s.label}
        className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-white/[0.03] px-2.5 py-1.5"
      >
        <dt className="text-[12px] text-muted">{s.label}</dt>
        <dd className="text-[12px] font-semibold tabular-nums text-zinc-100">
          {s.value}
        </dd>
      </div>
    ))}
  </dl>
);

export default DetailStats;
