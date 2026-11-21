import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export type ItemLevelRange = { min?: number; max?: number };
const DEFAULT_MIN_LEVEL = 1;

export default function ItemLevelFilter({ value, onChange }: {
  value: ItemLevelRange;
  onChange: (value: ItemLevelRange) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState(String(DEFAULT_MIN_LEVEL));
  const [max, setMax] = useState("");
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const minInput = useRef<HTMLInputElement>(null);
  const format = (level: number) => level.toLocaleString(i18n.language);
  const label = t("database.clientItem.itemLevel");
  const summary = value.min !== undefined && value.max !== undefined ? `${format(value.min)}–${format(value.max)}`
    : value.min !== undefined ? `≥${format(value.min)}` : value.max !== undefined ? `≤${format(value.max)}` : undefined;

  useEffect(() => {
    if (!open) return;
    minInput.current?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return <div ref={root} className="items-browser-level-filter" onKeyDown={(event) => {
    if (!open || event.key !== "Escape") return;
    event.stopPropagation();
    close();
  }}>
    <button ref={trigger} type="button" className="items-browser-level-trigger" aria-expanded={open} aria-controls={id}
      aria-label={summary ? `${label}: ${summary}` : label} data-filtered={Boolean(summary)} onClick={() => {
        if (open) return close();
        setMin(String(value.min ?? DEFAULT_MIN_LEVEL));
        setMax(value.max?.toString() ?? "");
        setOpen(true);
      }}>
      <span>{summary ?? label}</span><ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && <form id={id} className="items-browser-level-popover" aria-label={t("spells.levelRange")} onSubmit={(event) => {
      event.preventDefault();
      onChange({ min: min === "" ? DEFAULT_MIN_LEVEL : Number(min), max: max === "" ? undefined : Number(max) });
      close();
    }}>
      <div className="items-browser-level-inputs">
        <label>{t("reference.labels.minimum-level")}
          <input ref={minInput} type="number" inputMode="numeric" min={DEFAULT_MIN_LEVEL} max={max || undefined} value={min}
            onChange={(event) => setMin(event.target.value)} onBlur={() => { if (min === "") setMin(String(DEFAULT_MIN_LEVEL)); }} />
        </label>
        <label>{t("reference.labels.maximum-level")}
          <input type="number" inputMode="numeric" min={min || DEFAULT_MIN_LEVEL} value={max} onChange={(event) => setMax(event.target.value)} />
        </label>
      </div>
      <div className="items-browser-level-actions">
        <button type="button" onClick={() => { onChange({}); close(); }}>{t("database.levelFilter.clear")}</button>
        <button type="submit">{t("database.levelFilter.apply")}</button>
      </div>
    </form>}
  </div>;
}
