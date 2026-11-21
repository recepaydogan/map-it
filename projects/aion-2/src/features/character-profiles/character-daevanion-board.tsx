import { ArrowUpRight, Crosshair, HeartPulse, Shield, Sparkles, Swords, Wind } from "lucide-react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../components/tooltip";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import { contentUrl } from "../../lib/content-url";
import { openReference } from "../reference/reference-navigation";
import type { ReferenceNode, ReferenceSummary } from "../reference/reference-types";
import { useReferenceEntry } from "../reference/use-reference-data";
import type { CharacterBoard, CharacterSkill } from "./character-profile-api";
import CharacterReferencePreview from "./character-reference-preview";

const gradeStyles: Record<string, string> = {
  Common: "border-amber-200/30 bg-zinc-800/80 text-amber-100/60 hover:border-amber-200/70",
  Rare: "border-emerald-400/60 bg-emerald-950/65 text-emerald-200 shadow-[0_0_10px_rgba(52,211,153,0.2)] hover:border-emerald-200",
  Legend: "border-sky-400/60 bg-sky-950/60 text-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.2)] hover:border-sky-200",
  Unique: "border-amber-400/65 bg-amber-950/55 text-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.2)] hover:border-amber-200",
  None: "border-accent/70 bg-accent-soft text-accent hover:border-accent",
};

const CharacterDaevanionBoard = ({ board, skills, summary, references }: { board: CharacterBoard; skills: CharacterSkill[]; summary?: ReferenceSummary; references: Map<string, ReferenceSummary> }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const state = useReferenceEntry(summary);
  const entry = state.status === "ready" ? state.data : null;
  const nodes = entry?.board ?? [];
  const skillIcons = new Map(skills.filter((skill) => skill.icon).map((skill) => [`Skill:${skill.id}`, skill.icon!]));
  const skillLevels = new Map(skills.filter((skill) => skill.acquired > 0 && skill.skillLevel > 0).map((skill) => [`Skill:${skill.id}`, skill.skillLevel]));
  const upgrades = new Map<string, { id: string; name: string; category: string; count: number }>();
  for (const node of nodes) {
    const link = node.links[0];
    if (link?.category !== "skills") continue;
    const current = upgrades.get(link.id);
    upgrades.set(link.id, { id: link.id, name: link.name, category: link.category, count: (current?.count ?? 0) + 1 });
  }
  const openBoard = () => summary && openReference(summary);

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-[14px] font-semibold text-white">{gameText(board.name)}</h3>
        <p className="mt-0.5 text-[11px] tabular-nums text-subtle">{t("characterProfiles.boardNodes", { open: board.openNodeCount.toLocaleString(i18n.language), total: board.totalNodeCount.toLocaleString(i18n.language) })}</p>
      </div>
      {summary && <button type="button" onClick={openBoard} className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-border px-2.5 py-1.5 text-[11px] font-medium text-accent hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
        {t("characterProfiles.openBoard")}<ArrowUpRight size={13} aria-hidden="true" />
      </button>}
    </div>
    <p className="text-[11px] leading-4 text-subtle">{t("characterProfiles.boardNodeAvailability")}</p>
    {state.status === "loading" && <div className="h-72 animate-pulse rounded-[var(--radius-md)] bg-background/60" aria-label={t("characterProfiles.loadingBoard")} />}
    {state.status === "error" && <p role="alert" className="rounded-[var(--radius-md)] border border-border bg-background/60 p-4 text-[12px] text-subtle">{t("characterProfiles.boardLayoutUnavailable")}</p>}
    {nodes.length > 0 && <div className={cn("grid gap-3", upgrades.size > 0 && "lg:relative lg:grid-cols-[minmax(0,1fr)_220px]")}>
      <div className="min-w-0 rounded-[var(--radius-md)] border border-border bg-background/80 p-3 sm:p-4">
        <div className="mx-auto grid w-full max-w-[540px] grid-cols-[repeat(15,minmax(0,1fr))] gap-1.5">{nodes.map((node) => {
          const linkedIcon = node.links.map((link) => skillIcons.get(link.id) ?? link.icon).find(Boolean);
          return <BoardNode key={node.id} node={node} icon={linkedIcon ?? board.icon} genericIcon={!linkedIcon && node.grade !== "None"} />;
        })}</div>
      </div>
      {upgrades.size > 0 && <aside className="order-first flex min-h-0 flex-col rounded-[var(--radius-md)] border border-border bg-background/60 p-3 lg:absolute lg:inset-y-0 lg:right-0 lg:w-[220px]">
        <h4 className="text-[12px] font-semibold text-white">{t("characterProfiles.boardSkillUpgrades", { count: upgrades.size })}</h4>
        <div role="list" className="board-upgrades-scroll mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">{[...upgrades.values()].map((link) => <CharacterReferencePreview key={link.id} summary={references.get(link.id)} name={gameText(link.name)} extra={t("characterProfiles.boardUpgradePreview", { count: link.count })} skillLevel={skillLevels.get(link.id)} side="left">
          <div role="listitem" tabIndex={0} className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-accent/20 bg-accent-soft/50 px-2 py-1.5 text-left text-[11px] text-accent focus-visible:outline-2 focus-visible:outline-accent">
            <span className="relative grid size-6 shrink-0 place-items-center overflow-hidden rounded-[3px] bg-accent-soft"><Sparkles size={12} aria-hidden="true" />{(skillIcons.get(link.id) ?? board.icon) && <img src={contentUrl((skillIcons.get(link.id) ?? board.icon)!)} alt="" onError={(event) => { event.currentTarget.hidden = true; }} className="absolute inset-0 size-full object-cover" />}</span>
            <span className="min-w-0 flex-1">{gameText(link.name)}</span><span className="shrink-0 tabular-nums">×{link.count}</span>
          </div>
        </CharacterReferencePreview>)}</div>
      </aside>}
    </div>}
  </div>;
};

const BoardNode = ({ node, icon, genericIcon }: { node: ReferenceNode; icon?: string; genericIcon: boolean }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const name = node.name.toLowerCase();
  const Glyph = name.includes("hp") || name.includes("health") ? HeartPulse
    : name.includes("defense") || name.includes("block") ? Shield
      : name.includes("critical") || name.includes("accuracy") ? Crosshair
        : name.includes("speed") || name.includes("evasion") ? Wind
          : name.includes("attack") || name.includes("damage") ? Swords : Sparkles;
  const upgradedSkill = node.links.find((link) => link.category === "skills" && link.id !== "Skill:1");
  const preview = <span className="block w-48 text-left">
    <span className="block text-[12px] font-semibold text-white">{gameText(node.name)}</span>
    <span className="mt-1 block text-[11px] font-normal text-subtle">{t("characterProfiles.nodeCost", { cost: node.cost.toLocaleString(i18n.language) })}</span>
    <span className="mt-1 block text-[11px] font-normal text-subtle">{t("characterProfiles.nodeRequiredLevel", { level: node.level.toLocaleString(i18n.language) })}</span>
    {node.bonuses?.map((bonus, index) => <span key={`${bonus.label}-${index}`} className="mt-1 flex justify-between gap-2 text-[11px] font-normal"><span className="text-zinc-400">{t(bonus.label)}</span><span className="text-white">{typeof bonus.value === "number" ? bonus.value.toLocaleString(i18n.language) : gameText(String(bonus.value))}</span></span>)}
    {upgradedSkill && <span className="mt-2 block border-t border-border pt-1.5 text-[11px] font-normal text-accent">{t("characterProfiles.boardSkillLevelBonus", { name: gameText(upgradedSkill.name) })}</span>}
    {node.grade === "None" && <span className="mt-1 block text-[11px] font-normal text-subtle">{t("characterProfiles.boardStartNode")}</span>}
  </span>;
  return <div style={{ gridRow: node.row, gridColumn: node.column }} className="min-w-0">
    <Tooltip label={preview} wrap className="w-full" side={node.row <= 2 ? "bottom" : "top"} align={node.column <= 3 ? "start" : node.column >= 13 ? "end" : "center"}>
      <span role="img" tabIndex={0} aria-label={t("characterProfiles.nodeLabel", { name: gameText(node.name), row: node.row, column: node.column })}
        className={cn("relative grid aspect-square w-full place-items-center overflow-hidden rounded-[3px] border transition-colors focus-visible:outline-2 focus-visible:outline-accent", gradeStyles[node.grade] ?? gradeStyles.Common)}>
        <Glyph size={node.grade === "Common" ? 14 : 17} strokeWidth={1.6} aria-hidden="true" className={cn("relative", genericIcon && "z-10")} />
        {icon && <img src={contentUrl(icon)} alt="" onError={(event) => { event.currentTarget.hidden = true; }} className={cn("absolute inset-0 size-full object-cover", genericIcon && "opacity-40")} />}
      </span>
    </Tooltip>
  </div>;
};

export default CharacterDaevanionBoard;
