import { useGameText } from "../../i18n/game-text";
import { ChevronRight, Fish, Globe2, MapPin, PackageOpen, Pickaxe, ScrollText, Sprout, Swords } from "lucide-react";
import { useTranslation } from "react-i18next";
import { resolveEnshroudedEntry, type EnshroudedEntryTarget } from "./enshrouded-entry-data";
import EnshroudedWikiProse from "./enshrouded-wiki-prose";
import EnshroudedObtainingText from "./enshrouded-obtaining-text";

const sourcePatterns = [
  { pattern: /^Gatherable\s*-\s*(.+)$/i, label: "gather", icon: Pickaxe },
  { pattern: /^Gatherable from\s+(.+)$/i, label: "gather", icon: Pickaxe },
  { pattern: /^Farmable from\s+(.+)$/i, label: "farm", icon: Sprout },
  { pattern: /^Gathered from\s+(.+)$/i, label: "gather", icon: Pickaxe },
  { pattern: /^Dropped by\s+(.+)$/i, label: "drop", icon: Swords },
  { pattern: /^Lootable\s*-?\s*(.*)$/i, label: "loot", icon: PackageOpen },
  { pattern: /^Fished with\s+(.+)$/i, label: "fish", icon: Fish },
  { pattern: /^World Drop\s*\(\s*(.*?)\s*\)$/i, label: "worldDrop", icon: Globe2 },
  { pattern: /^Found in\s+(.+)$/i, label: "foundIn", icon: MapPin },
  { pattern: /^Reward from\s+(.+)$/i, label: "reward", icon: ScrollText },
] as const;

export default function EnshroudedAcquisition({ value, name, onOpenEntry, onOpenMap }: {
  value: string;
  name: string;
  onOpenEntry: (target: EnshroudedEntryTarget) => void;
  onOpenMap: (markerId: string) => void;
}) {
  const contentText = useGameText();
  const { t } = useTranslation();
  const sparkYields = name === "Spark" ? [...value.matchAll(/:\s*([^:]+?)\s+x(\d+)(?=\s*(?::|C:|$))/g)]
    .map((match) => ({ region: match[1].trim(), quantity: Number(match[2]) })) : [];
  if (sparkYields.length > 0) return <div className="@container space-y-2">
    <p className="text-xs text-zinc-300">{t("map.enshrouded.acquisition.sparkSources")}</p>
    <dl className="grid gap-1.5 @min-[300px]:grid-cols-2">
      {sparkYields.map(({ region, quantity }) => <div key={region}
        className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border/70 bg-white/[0.025] px-2.5 py-2">
        <dt className="min-w-0 text-[11px] text-zinc-200">{contentText(region)}</dt>
        <dd className="shrink-0 text-xs font-semibold tabular-nums text-accent">×{quantity}</dd>
      </div>)}
    </dl>
  </div>;
  const methods = value.replace(/\s+(?=(?:Farmable from|Gathered from|Gatherable from)\b)/gi, "\n")
    .split("\n").map((part) => part.replace(/\s+([,.!?;:])/g, "$1").trim()).filter(Boolean);

  return <div className="grid gap-1.5">{methods.map((method, index) => {
    const source = sourcePatterns.map((candidate) => ({ ...candidate, match: method.match(candidate.pattern) }))
      .find((candidate) => candidate.match);
    if (!source) return <EnshroudedObtainingText key={index} value={method}
      render={(text) => <EnshroudedWikiProse text={text} name={name}
        onOpenEntry={onOpenEntry} onOpenMap={onOpenMap} />} />;
    const detail = source.match?.[1]?.trim() ?? "";
    const target = { page: detail, catalog: source.label === "farm" ? "crafting" : "progression" };
    const linked = Boolean(detail && !detail.includes("{{")
      && (source.label === "farm" || source.label === "reward")
      && resolveEnshroudedEntry(target)?.kind === target.catalog);
    const Icon = source.icon;
    const content = <>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          {t(`map.enshrouded.acquisition.${source.label}`)}</span>
        {contentText(detail && <span className="mt-0.5 block text-[13px] leading-snug text-zinc-100">
          {contentText(linked ? detail : <EnshroudedWikiProse text={detail} name={name}
            onOpenEntry={onOpenEntry} onOpenMap={onOpenMap} />)}</span>)}
      </span>
      {linked && <ChevronRight size={14} className="mt-2 shrink-0 text-accent/70" aria-hidden="true" />}
    </>;
    const className = "flex min-h-14 w-full items-start gap-2.5 rounded-md border border-border bg-white/[0.025] px-3 py-2.5 text-left";
    return linked ? <button key={index} type="button" onClick={() => onOpenEntry(target)}
      className={`${className} hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent`}>{content}</button>
      : <div key={index} className={className}>{content}</div>;
  })}</div>;
}
