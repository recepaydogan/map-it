import { cn } from "../lib/cn";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name — there is no visible <label> wired to the control. */
  label: string;
  disabled?: boolean;
}

/**
 * An accessible on/off switch (iOS-style). Reusable across settings and any other
 * boolean preference — the track fills with the game accent when on, a neutral
 * tint when off; the white thumb keeps contrast in both states.
 */
const ToggleSwitch = ({ checked, onChange, label, disabled }: ToggleSwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-[var(--radius-full)] transition-colors",
      checked ? "bg-accent" : "bg-white/15",
      disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
    )}
  >
    <span
      className={cn(
        "inline-block h-5 w-5 rounded-[var(--radius-full)] bg-white shadow-sm transition-transform",
        checked ? "translate-x-[22px]" : "translate-x-0.5",
      )}
    />
  </button>
);

export default ToggleSwitch;
