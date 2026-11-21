import { getItemDisplayName } from "../../lib/item-display-name";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import DatabaseSectionTitle from "../database/database-section-title";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import { useIntelligenceData } from "../reference/use-reference-data";
import type { UpgradeData, UpgradeStep } from "./intelligence-types";
import { upgradeBudget } from "./upgrade-budget";

const Budget = ({ steps }: { steps: UpgradeStep[] }) => {
  const { t, i18n } = useTranslation();
  const open = useReferenceNavigation();
  const id = useId();
  const starts = steps.filter(s => s.probability > 0 && (s.penalty === null || s.penalty === 0) && s.costsComplete).map(s => s.level).sort((a, b) => a - b);
  const [from, setFrom] = useState(starts[0] ?? 0);
  const [to, setTo] = useState((starts.at(-1) ?? 0) + 1);
  const [failures, setFailures] = useState(0);
  if (!starts.length) return null;
  const targets = starts.filter(level => level >= from).map(level => level + 1);
  const currentStep = steps.find(step => step.level === from);
  const failuresAffectBudget = Boolean(currentStep && currentStep.probability < 1 && currentStep.correction > 0);
  const result = upgradeBudget(steps, from, to, failures);
  const number = (n: number) => Math.ceil(n).toLocaleString(i18n.language);
  return <section className="col-span-full space-y-4 border-t border-border pt-5">
    <DatabaseSectionTitle>{t("intel.upgrade.title")}</DatabaseSectionTitle>
    <div className="grid grid-cols-3 gap-2">
      <div className="min-w-0 space-y-1 text-xs text-subtle"><span>{t("intel.upgrade.from")}</span><CategoryDropdown value={String(from)} ariaLabel={t("intel.upgrade.from")}
        options={starts.map(n => ({ key: String(n), label: `+${n}` }))} onChange={v => { const n = Number(v); setFrom(n); setTo(Math.max(to, n + 1)); setFailures(0); }} /></div>
      <div className="min-w-0 space-y-1 text-xs text-subtle"><span>{t("intel.upgrade.to")}</span><CategoryDropdown value={String(to)} ariaLabel={t("intel.upgrade.to")}
        options={targets.map(n => ({ key: String(n), label: `+${n}` }))} onChange={v => setTo(Number(v))} /></div>
      <div className="min-w-0 space-y-1"><label htmlFor={id} className="block text-xs text-subtle">{t("intel.upgrade.failures", { level: from })}</label>
        <input id={id} type="number" min={0} max={10000} step={1} value={failures} onChange={e => setFailures(Math.max(0, Math.min(10000, Math.trunc(Number(e.target.value) || 0))))}
          disabled={!failuresAffectBudget}
          className="w-full min-w-0 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-white focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50" />
      </div>
      {!failuresAffectBudget && <p className="col-span-3 text-[11px] leading-relaxed text-subtle">{t(currentStep?.probability === 1 ? "intel.upgrade.guaranteedStep" : "intel.upgrade.noFailureCorrection")}</p>}
    </div>
    {result ? <div aria-live="polite" className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="flex min-h-[104px] min-w-0 flex-col rounded-[var(--radius-md)] border border-border p-2.5">
          <p className="text-[11px] font-medium leading-tight text-zinc-200">{t("intel.upgrade.expected")}</p>
          <p className="mt-auto break-all pt-3 text-[15px] font-semibold tabular-nums text-white">{number(result.gold)}</p>
        </div>
        <div className="flex min-h-[104px] min-w-0 flex-col rounded-[var(--radius-md)] border border-border p-2.5">
          <p className="text-[11px] font-medium leading-tight text-zinc-200">{t("intel.upgrade.maximum")}</p>
          <p className="mt-auto break-all pt-3 text-[15px] font-semibold tabular-nums text-white">{result.maximumGold === null ? t("intel.upgrade.unbounded") : number(result.maximumGold)}</p>
        </div>
        <div className="flex min-h-[104px] min-w-0 flex-col rounded-[var(--radius-md)] border border-border p-2.5">
          {result.materials.length === 1
            ? <button type="button" onClick={() => open(result.materials[0]!)} className="cursor-pointer text-left text-[11px] font-medium leading-tight text-zinc-200 hover:text-accent">{t("intel.upgrade.materialTitle", { name: `${getItemDisplayName(result.materials[0]!.name)}${result.materials[0]!.level > 0 ? ` +${result.materials[0]!.level}` : ""}` })}</button>
            : <p className="text-[11px] font-medium leading-tight text-zinc-200">{t("intel.upgrade.materialCost")}</p>}
          <div className="mt-auto pt-3">
            {result.materials.map(m => <div key={`${m.id}/${m.level}`} className="min-w-0">
              {result.materials.length > 1 && <button type="button" onClick={() => open(m)} className="mb-1 cursor-pointer text-left text-[10px] leading-tight text-zinc-300 hover:text-accent">{getItemDisplayName(m.name)}{m.level > 0 ? ` +${m.level}` : ""}</button>}
              <dl className="space-y-0.5 text-[10px] tabular-nums">
                <div className="flex min-w-0 gap-1"><dt className="shrink-0 text-subtle">{t("intel.upgrade.averageShort")}</dt><dd className="min-w-0 break-all font-semibold text-white">{number(m.expected)}</dd></div>
                <div className="flex min-w-0 gap-1"><dt className="shrink-0 text-subtle">{t("intel.upgrade.maximumShort")}</dt><dd className="min-w-0 break-all font-semibold text-white">{m.maximum === null ? t("intel.upgrade.unbounded") : number(m.maximum)}</dd></div>
              </dl>
            </div>)}
          </div>
        </div>
      </div>
      {result.assumedPenalty && <p className="text-xs text-warning">{t("intel.upgrade.assumedPenalty")}</p>}
    </div> : <p role="status" className="text-sm text-subtle">{t("intel.upgrade.unsupported")}</p>}
  </section>;
};

export default function UpgradeCalculator({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const data = useIntelligenceData<UpgradeData>("upgrades");
  if (data.status !== "ready") return <p className="col-span-full text-xs text-subtle" role={data.status === "error" ? "alert" : "status"}>{t(data.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const steps = data.data.groups[groupId];
  return steps ? <Budget key={groupId} steps={steps} /> : null;
}
