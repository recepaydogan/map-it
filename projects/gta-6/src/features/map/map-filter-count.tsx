import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

interface MapFilterCountProps {
  found: number;
  total: number;
  group?: boolean;
}

const MapFilterCount = ({ found, total, group = false }: MapFilterCountProps) => {
  const { t, i18n } = useTranslation();
  const number = (value: number) => value.toLocaleString(i18n.language);

  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap tabular-nums",
        group
          ? "rounded-[var(--radius-full)] bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300"
          : "text-[11px] text-zinc-400",
      )}
      title={t("map.filters.foundCount", { found, total })}
    >
      {found > 0 && <><span className="font-semibold text-emerald-300">{number(found)}</span>
        <span className="text-zinc-500">{" / "}</span></>}
      {number(total)}
    </span>
  );
};

export default MapFilterCount;
