import { useCallback, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { useDismissable } from "./use-dismissable";

export interface MapCubePickerOption {
  id: string;
  label: string;
  artwork: string;
}

interface MapCubePickerProps {
  options: readonly MapCubePickerOption[];
  value: string;
  ariaLabel: string;
  onSelect: (id: string) => void;
  className?: string;
}

const Cube = ({ option, highlighted = false }: { option: MapCubePickerOption; highlighted?: boolean }) => (
  <img
    src={option.artwork}
    alt=""
    draggable={false}
    className={cn(
      "h-11 w-11 select-none object-contain [image-rendering:pixelated] transition-[filter,transform] duration-150",
      "group-hover:scale-110 group-hover:brightness-110 group-focus-visible:scale-110",
      highlighted
        ? "scale-110 brightness-110 [filter:drop-shadow(0_0_4px_rgba(var(--gold-rgb),1))_drop-shadow(0_0_10px_rgba(var(--gold-rgb),0.8))]"
        : "[filter:drop-shadow(0_4px_4px_rgba(0,0,0,0.65))] group-focus-visible:[filter:drop-shadow(0_0_7px_rgba(var(--gold-rgb),1))]",
    )}
  />
);

/** A panel-free map picker whose choices expand vertically above the active cube. */
const MapCubePicker = ({ options, value, ariaLabel, onSelect, className }: MapCubePickerProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const current = options.find(option => option.id === value) ?? options[0];
  const availableOptions = options.filter(option => option.id !== current?.id);
  const close = useCallback(() => setOpen(false), []);
  const closeAndFocus = useCallback(() => {
    close();
    triggerRef.current?.focus();
  }, [close]);

  useDismissable(open, rootRef, close, undefined, closeAndFocus);

  if (!current) return null;

  const focusChoice = (edge: "first" | "last") => requestAnimationFrame(() => {
    const choices = rootRef.current?.querySelectorAll<HTMLButtonElement>("button[data-cube-option]");
    choices?.[edge === "first" ? 0 : choices.length - 1]?.focus();
  });

  return (
    <div ref={rootRef} className={cn("relative h-12 w-12", className)} onKeyDown={event => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      if (!open) {
        setOpen(true);
        focusChoice(event.key === "ArrowUp" || event.key === "End" ? "last" : "first");
        return;
      }
      const choices = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>("button[data-cube-option]") ?? [])];
      if (!choices.length) return;
      const focused = choices.findIndex(choice => choice === document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1
        : event.key === "ArrowDown" ? (focused + 1) % choices.length
          : focused < 0 ? choices.length - 1 : (focused - 1 + choices.length) % choices.length;
      choices[next]?.focus();
    }}>
      {open && <div role="group" aria-label={ariaLabel}
        className="absolute bottom-[calc(100%+4px)] left-0 flex w-12 flex-col items-center gap-1">
        {availableOptions.map((option, index) => {
          return <button key={option.id} type="button" data-cube-option aria-label={option.label}
            className="group grid h-12 w-12 cursor-pointer place-items-center bg-transparent outline-none animate-fade-up"
            style={{ animationDelay: `${(availableOptions.length - index - 1) * 35}ms` }}
            onClick={() => { onSelect(option.id); setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); }}>
            <Cube option={option} />
          </button>;
        })}
      </div>}
      <button ref={triggerRef} type="button" aria-label={`${ariaLabel}: ${current.label}`}
        aria-expanded={open}
        className="group grid h-12 w-12 cursor-pointer place-items-center bg-transparent outline-none"
        onClick={() => setOpen(value => !value)}>
        <Cube option={current} highlighted={open} />
      </button>
    </div>
  );
};

export default MapCubePicker;
