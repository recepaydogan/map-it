import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { ReferenceNode } from "./reference-types";
import ReferenceSections from "./reference-sections";

/** Selection previews costs and stats; eligibility remains visible on each node. */
const ReferenceBoard = ({ nodes }: { nodes: ReferenceNode[] }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(nodes.filter((node) => node.automatic).map((node) => node.id)));
  const [focused, setFocused] = useState<ReferenceNode | null>(null);
  const chosen = nodes.filter((node) => selected.has(node.id));
  const total = chosen.reduce((sum, node) => sum + node.cost, 0);
  const stats = new Map<string, number>();
  for (const node of chosen) for (const bonus of node.bonuses ?? []) if (typeof bonus.value === "number") stats.set(bonus.label, (stats.get(bonus.label) ?? 0) + bonus.value);
  return <section className="space-y-4">
    <div className="flex items-center justify-between gap-3 text-xs"><p className="text-accent">{t("reference.boardSelection", { count: chosen.length, cost: total })}</p><button type="button" onClick={() => setSelected(new Set(nodes.filter((node) => node.automatic).map((node) => node.id)))} className="cursor-pointer text-zinc-400 hover:text-white">{t("reference.resetSelection")}</button></div>
    <p className="text-xs leading-relaxed text-zinc-400">{t("reference.boardHint")}</p>
    <div className="overflow-x-auto"><div className="grid min-w-[480px] grid-cols-[repeat(15,minmax(0,1fr))] gap-1 rounded-[var(--radius-md)] border border-border bg-surface/40 p-3">{nodes.map((node) => <button key={node.id} type="button" aria-label={t("reference.nodeLabel", { name: node.name, row: node.row, column: node.column, cost: node.cost })} aria-pressed={selected.has(node.id)} title={node.name} style={{ gridRow: node.row, gridColumn: node.column }} onFocus={() => setFocused(node)} onClick={() => { setFocused(node); if (!node.automatic) setSelected((current) => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; }); }} className={cn("aspect-square cursor-pointer rounded border text-[10px] tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-white", selected.has(node.id) ? "border-accent bg-accent/25 text-accent" : "border-border bg-surface text-muted hover:border-accent/50")}>{node.cost || "·"}</button>)}</div></div>
    {focused && <ReferenceSections sections={[{ title: "reference.selectedNode", text: focused.name, facts: [{ label: "reference.requiredLevel", value: focused.level }, ...focused.facts], links: focused.links }]} />}
    {stats.size > 0 && <ReferenceSections sections={[{ title: "reference.selectedBonuses", facts: [...stats].map(([label, value]) => ({ label, value })) }]} />}
  </section>;
};
export default ReferenceBoard;
