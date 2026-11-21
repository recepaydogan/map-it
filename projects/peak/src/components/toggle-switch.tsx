import { twMerge } from "tailwind-merge";

interface ToggleSwitchProps {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}

const ToggleSwitch = ({ checked, disabled = false, label, onChange }: ToggleSwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={twMerge(
      "relative h-6 w-11 shrink-0 cursor-pointer rounded-[var(--radius-full)] border transition-colors",
      checked ? "border-accent bg-accent-soft" : "border-border bg-surface-hover",
      disabled && "cursor-not-allowed opacity-50",
    )}
  >
    <span
      className={twMerge(
        "absolute left-0 top-0.5 h-[18px] w-[18px] rounded-[var(--radius-full)] bg-muted transition-transform",
        checked ? "translate-x-5 bg-accent" : "translate-x-0.5",
      )}
    />
  </button>
);

export default ToggleSwitch;
