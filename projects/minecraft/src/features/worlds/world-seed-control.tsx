import { Dices } from "lucide-react";
import { useTranslation } from "react-i18next";
import { randomSeed } from "./seed-value";

const inputClass = "w-full rounded-[var(--radius-md)] border border-border bg-black/25 px-2.5 py-2 text-[13px] text-white outline-none focus:border-accent";

interface Props {
  seed: string;
  invalid: boolean;
  disabled: boolean;
  onChange: (seed: string) => void;
  drawSeed?: () => string;
}

/** Manual seed input with a full signed-64-bit random value generator. */
const WorldSeedControl = ({ seed, invalid, disabled, onChange, drawSeed = randomSeed }: Props) => {
  const { t } = useTranslation();
  return <label className="block space-y-1.5">
    <span className="text-[12px] text-white/80">{t("worlds.seed")}</span>
    <div className="flex gap-2">
      <input required maxLength={128} value={seed} aria-label={t("worlds.seed")} aria-invalid={invalid}
        aria-describedby={invalid ? "world-seed-error" : undefined} onChange={event => onChange(event.target.value)}
        className={inputClass} />
      <button type="button" title={t("worlds.random")} aria-label={t("worlds.random")} disabled={disabled}
        onClick={() => onChange(drawSeed())}
        className="grid w-9 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] border border-border text-accent hover:bg-accent-soft disabled:cursor-wait">
        <Dices size={16} aria-hidden="true" />
      </button>
    </div>
  </label>;
};

export default WorldSeedControl;
