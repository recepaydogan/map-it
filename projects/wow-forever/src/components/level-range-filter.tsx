import { useId } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";

export type LevelRangeInput = [minimum: string, maximum: string];

const normalizeLevel = (value: string) => value === ""
  ? "" : String(Math.max(1, Math.min(60, Math.trunc(Number(value) || 1))));

const LevelRangeFilter = ({ value, onChange, className }: {
  value: LevelRangeInput;
  onChange: (value: LevelRangeInput) => void;
  className?: string;
}) => {
  const { t } = useTranslation();
  const errorId = useId();
  const [minimum, maximum] = value;
  const invalid = minimum !== "" && maximum !== "" && Number(minimum) > Number(maximum);
  const inputClass = "mt-1 block w-full min-w-0 rounded-[var(--radius-sm)] border border-border bg-transparent px-2.5 py-1.5 text-[12px] tabular-nums text-white outline-none focus:border-accent";

  return <fieldset className={cn("min-w-0", className)}>
    <legend className="text-[11px] font-medium text-white/85">{t("spells.levelRange")}</legend>
    <div className="mt-1.5 grid grid-cols-2 gap-2">
      <label className="min-w-0 text-[10px] text-subtle">{t("spells.minLevel")}
        <input type="number" min={1} max={60} step={1} value={minimum} placeholder="1"
          onChange={(event) => onChange([normalizeLevel(event.target.value), maximum])}
          aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined} className={inputClass} />
      </label>
      <label className="min-w-0 text-[10px] text-subtle">{t("spells.maxLevel")}
        <input type="number" min={1} max={60} step={1} value={maximum} placeholder="60"
          onChange={(event) => onChange([minimum, normalizeLevel(event.target.value)])}
          aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined} className={inputClass} />
      </label>
    </div>
    {(minimum || maximum) && <button type="button" onClick={() => onChange(["", ""])}
      className="mt-1.5 cursor-pointer text-[10px] text-subtle hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
      {t("spells.clearLevelRange")}
    </button>}
    {invalid && <p id={errorId} role="status" className="mt-1 text-[10px] leading-4 text-danger-text">
      {t("spells.invalidLevelRange")}
    </p>}
  </fieldset>;
};

export default LevelRangeFilter;
