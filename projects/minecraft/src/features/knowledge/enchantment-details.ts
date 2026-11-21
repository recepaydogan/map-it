import { createElement } from "react";
import { Anvil, Layers3, Sparkles } from "lucide-react";
import { cn } from "../../lib/cn.ts";

interface EnchantmentDetailsProps {
  title: string;
  maximumLevelLabel: string;
  maximumLevel: number;
  selectionWeightLabel: string;
  selectionWeight: number;
  anvilMultiplierLabel: string;
  anvilMultiplier: number;
  compatibleEquipmentLabel: string;
  equipment: readonly string[];
  activeSlotsLabel: string;
  slots: readonly string[];
  effectsLabel: string;
  effects: readonly string[];
}

const stat = (Icon: typeof Layers3, label: string, value: string | number, prominent = false) => createElement("div", {
  className: "min-w-0 border-r border-border pr-3 last:border-r-0",
}, createElement("dt", { className: "flex items-center gap-1.5 text-[11px] leading-4 text-subtle" },
  createElement(Icon, { size: 13, className: "shrink-0 text-accent", "aria-hidden": true }), label),
createElement("dd", { className: cn("mt-1 font-semibold leading-none text-white", prominent ? "text-lg" : "text-base") }, value));

const detail = (label: string, values: readonly string[], chips = false) => values.length ? createElement("div", { className: "min-w-0" },
  createElement("dt", { className: "text-[10px] font-semibold uppercase leading-4 tracking-[0.1em] text-subtle" }, label),
  createElement("dd", { className: chips ? "mt-2 flex flex-wrap gap-1.5" : "mt-0.5 break-words text-[12px] font-medium leading-5 text-zinc-100" },
    chips ? values.map(value => createElement("span", { key: value,
      className: "rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-[11px] font-medium text-zinc-100" }, value))
      : values.join(" · "))) : null;

const EnchantmentDetails = ({ title, maximumLevelLabel, maximumLevel, selectionWeightLabel, selectionWeight,
  anvilMultiplierLabel, anvilMultiplier, compatibleEquipmentLabel, equipment, activeSlotsLabel, slots,
  effectsLabel, effects }: EnchantmentDetailsProps) => createElement("section", { "aria-labelledby": "enchantment-details-title" },
  createElement("h3", { id: "enchantment-details-title",
    className: "mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-300" }, title),
  createElement("dl", { className: "grid grid-cols-3 gap-x-3" },
    stat(Layers3, maximumLevelLabel, maximumLevel, true), stat(Sparkles, selectionWeightLabel, selectionWeight),
    stat(Anvil, anvilMultiplierLabel, `×${anvilMultiplier}`)),
  equipment.length ? createElement("dl", { className: "mt-3 border-t border-border pt-3" },
    detail(compatibleEquipmentLabel, equipment, true)) : null,
  createElement("dl", { className: "mt-3 grid grid-cols-2 gap-x-5 border-t border-border pt-3" },
    detail(activeSlotsLabel, slots), detail(effectsLabel, effects)));

export default EnchantmentDetails;
