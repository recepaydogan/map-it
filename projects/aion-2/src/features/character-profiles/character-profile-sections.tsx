import { ArrowUpRight, LockKeyhole, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CHARACTER_PROFILE_CONFIG } from "../../game-config";
import { useGameText } from "../../i18n/game-text";
import { getItemDisplayName } from "../../lib/item-display-name";
import { cn } from "../../lib/cn";
import ItemGrade from "../database/item-grade";
import ItemIcon from "../database/item-icon";
import { useItemCatalog } from "../database/use-item-catalog";
import { openReference } from "../reference/reference-navigation";
import type { ReferenceSummary } from "../reference/reference-types";
import { useReferenceIndex } from "../reference/use-reference-data";
import { isCharacterTitle, type CharacterBoard, type CharacterProfileData, type CharacterSkill } from "./character-profile-api";
import CharacterDaevanionBoard from "./character-daevanion-board";
import CharacterEquipmentCard from "./character-equipment-card";
import CharacterReferencePreview from "./character-reference-preview";

export const PROFILE_TABS = ["equipment", "skills", "daevanion", "stats", "appearance"] as const;
export type ProfileTab = typeof PROFILE_TABS[number];

const SectionHeading = ({ title, count }: { title: string; count?: number }) => <div className="mb-3 flex items-center gap-2">
  <h3 className="text-[13px] font-semibold text-white">{title}</h3>
  {count !== undefined && <span className="text-[11px] tabular-nums text-subtle">{count}</span>}
</div>;

const useCatalogItemsById = () => {
  const state = useItemCatalog();
  const catalog = state.status === "ready" ? state.catalog : null;
  return useMemo(() => new Map(catalog?.items.map((item) => [item.id, item]) ?? []), [catalog]);
};

const EquipmentSection = ({ data }: { data: CharacterProfileData }) => {
  const { t } = useTranslation();
  const itemsById = useCatalogItemsById();
  const knownSlots = new Set(CHARACTER_PROFILE_CONFIG.equipmentGroups.flatMap((group) => group.slots));
  const groups = [
    ...CHARACTER_PROFILE_CONFIG.equipmentGroups.map((group) => ({ key: group.key, items: data.equipment.filter((item) => group.slots.some((slot) => slot === item.slotPosName)) })),
    { key: "other", items: data.equipment.filter((item) => !knownSlots.has(item.slotPosName)) },
  ].filter((group) => group.items.length > 0);
  if (data.equipment.length === 0) return <p className="text-[13px] text-subtle">{t("characterProfiles.noEquipment")}</p>;
  return <div className="space-y-6">
    {groups.map((group) => <section key={group.key}>
      <SectionHeading title={t(`characterProfiles.equipmentGroups.${group.key}`)} count={group.items.length} />
      <div className="grid gap-2 sm:grid-cols-2">{group.items.map((item) => <CharacterEquipmentCard key={`${item.slotPos}:${item.id}`} item={item} catalogItem={itemsById.get(String(item.id))} />)}</div>
    </section>)}
  </div>;
};

const SkillCard = ({ skill, summary }: { skill: CharacterSkill; summary?: ReferenceSummary }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const acquired = skill.acquired > 0;
  const content = <>
    <ItemIcon icon={skill.icon} name={skill.name} size={38} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-[12px] font-semibold text-white">{gameText(skill.name)}</p>
      <p className="mt-0.5 text-[11px] text-subtle">{acquired
        ? skill.skillLevel > 0 ? t("characterProfiles.skillLevel", { level: skill.skillLevel }) : t("characterProfiles.acquired")
        : t("characterProfiles.unlockLevel", { level: skill.needLevel })}</p>
    </div>
    <span className="shrink-0 rounded-[var(--radius-full)] border border-border px-2 py-0.5 text-[10px] text-subtle">
      {skill.equip > 0 ? t("characterProfiles.equipped") : acquired ? t("characterProfiles.acquired") : <span className="inline-flex items-center gap-1"><LockKeyhole size={10} aria-hidden="true" />{t("characterProfiles.locked")}</span>}
    </span>
  </>;
  return <CharacterReferencePreview summary={summary} name={gameText(skill.name)} extra={acquired && skill.skillLevel > 0 ? t("characterProfiles.skillLevel", { level: skill.skillLevel }) : undefined} skillLevel={acquired && skill.skillLevel > 0 ? skill.skillLevel : undefined}>
    <div className="flex w-full min-w-0 items-center gap-3 rounded-[var(--radius-md)] border border-border bg-background/60 px-3 py-2.5">{content}</div>
  </CharacterReferencePreview>;
};

const SkillsSection = ({ data, references }: { data: CharacterProfileData; references: Map<string, ReferenceSummary> }) => {
  const { t } = useTranslation();
  const categories = [...new Set(data.skills.map((skill) => skill.category))];
  if (categories.length === 0) return <p className="text-[13px] text-subtle">{t("characterProfiles.noSkills")}</p>;
  return <div className="space-y-6">
    {categories.map((category) => {
      const skills = data.skills.filter((skill) => skill.category === category);
      const labelKey = category.toLowerCase() === "dp" ? "dp" : category.toLowerCase();
      return <section key={category}>
        <SectionHeading title={t(`characterProfiles.skillCategories.${labelKey}`, { defaultValue: category })} count={skills.length} />
        <div className="grid gap-2 sm:grid-cols-2">{skills.map((skill) => <SkillCard key={skill.id} skill={skill} summary={references.get(`Skill:${skill.id}`)} />)}</div>
      </section>;
    })}
  </div>;
};

const BoardCard = ({ board, summary, selected, onSelect }: { board: CharacterBoard; summary?: ReferenceSummary; selected: boolean; onSelect: () => void }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  return <CharacterReferencePreview summary={summary} name={gameText(board.name)} extra={board.open ? t("characterProfiles.boardNodes", { open: board.openNodeCount.toLocaleString(i18n.language), total: board.totalNodeCount.toLocaleString(i18n.language) }) : t("characterProfiles.boardLocked")}>
    <button type="button" onClick={onSelect} aria-pressed={selected} className={cn("w-full cursor-pointer rounded-[var(--radius-md)] border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent", selected ? "border-accent/60 bg-accent-soft" : "border-border bg-background/60 hover:border-accent/40 hover:bg-surface-hover")}>
      <span className="flex min-w-0 items-center gap-2.5"><ItemIcon icon={board.icon} name={board.name} size={32} /><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold text-white">{gameText(board.name)}</span><span className="mt-0.5 block text-[10px] tabular-nums text-subtle">{board.openNodeCount.toLocaleString(i18n.language)}/{board.totalNodeCount.toLocaleString(i18n.language)}</span></span><span className="text-[11px] font-semibold tabular-nums text-accent">{Math.round(board.openPercent)}%</span></span>
      <span className="mt-2 block h-1 overflow-hidden rounded-full bg-elevated"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, board.openPercent))}%` }} /></span>
    </button>
  </CharacterReferencePreview>;
};

const DaevanionSection = ({ data, references }: { data: CharacterProfileData; references: Map<string, ReferenceSummary> }) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  if (data.boards.length === 0) return <p className="text-[13px] text-subtle">{t("characterProfiles.noBoards")}</p>;
  const selected = data.boards.find((board) => board.id === selectedId) ?? data.boards[0];
  return <div className="space-y-5">
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{data.boards.map((board) => <BoardCard key={board.id} board={board} summary={references.get(`DaevanionBoard:${board.id}`)} selected={board.id === selected.id} onSelect={() => setSelectedId(board.id)} />)}</div>
    <CharacterDaevanionBoard key={selected.id} board={selected} skills={data.skills} summary={references.get(`DaevanionBoard:${selected.id}`)} references={references} />
  </div>;
};

const SecondaryStat = ({ value }: { value: string }) => {
  const match = /^(.+?)(?:\s+increase)?\s+([+-]\d+(?:\.\d+)?%?)$/i.exec(value.trim());
  return <span className="inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-sm)] bg-emerald-500/10 px-2 py-0.5 text-[11px] leading-5">
    {match ? <><span className="truncate text-zinc-200">{match[1]}</span><strong className="shrink-0 font-semibold tabular-nums text-emerald-300">{match[2]}</strong></>
      : <span className="text-emerald-300">{value}</span>}
  </span>;
};

const StatsSection = ({ data }: { data: CharacterProfileData }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  return <div className="space-y-7">
    <section><SectionHeading title={t("characterProfiles.attributes")} count={data.stats.length} />
      <div className="grid gap-2 sm:grid-cols-2">{data.stats.map((stat) => <div key={stat.type} className="rounded-[var(--radius-md)] border border-border bg-background/60 px-4 py-3">
        <div className="flex items-baseline justify-between gap-3"><span className="text-[12px] font-medium text-zinc-200">{stat.type === CHARACTER_PROFILE_CONFIG.gearScoreStatType ? t("characterProfiles.gearScore") : gameText(stat.name)}</span>
          <span className="text-[15px] font-semibold tabular-nums text-white">{stat.value.toLocaleString(i18n.language)}</span></div>
        {stat.statSecondList && stat.statSecondList.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{stat.statSecondList.map((value, index) => <SecondaryStat key={`${value}-${index}`} value={value} />)}</div>}
      </div>)}</div>
    </section>
    <section><SectionHeading title={t("characterProfiles.rankings")} count={data.rankings.length} />
      {data.rankings.length === 0 ? <p className="text-[12px] text-subtle">{t("characterProfiles.noRankings")}</p>
        : <div className="grid gap-2 sm:grid-cols-2">{data.rankings.map((ranking, index) => {
          const value = typeof ranking === "object" && ranking !== null ? ranking as Record<string, unknown> : {};
          const name = value.name ?? value.rankingName ?? value.contentsName ?? value.type;
          const position = value.rank ?? value.ranking ?? value.rankValue;
          return <div key={index} className="flex justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-background/60 px-4 py-3 text-[12px]">
            <span className="truncate text-zinc-200">{typeof name === "string" ? gameText(name) : t("characterProfiles.rankingEntry", { number: index + 1 })}</span>
            <span className="shrink-0 font-semibold tabular-nums text-accent">{typeof position === "string" || typeof position === "number" ? String(position) : "—"}</span>
          </div>;
        })}</div>}
    </section>
  </div>;
};

const AppearanceSection = ({ data, references }: { data: CharacterProfileData; references: Map<string, ReferenceSummary> }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const itemsById = useCatalogItemsById();
  const equippedTitles = data.titles.filter(isCharacterTitle);
  const companions = [
    { key: "pet", prefix: "VehicleList", value: data.petWing.pet },
    { key: "wing", prefix: "Wing", value: data.petWing.wing },
    { key: "wingSkin", prefix: "Wing", value: data.petWing.wingSkin },
  ].filter((entry) => entry.value);
  return <div className="space-y-7">
    <section><SectionHeading title={t("characterProfiles.companions")} />
      {companions.length === 0 ? <p className="text-[12px] text-subtle">{t("characterProfiles.noAppearance")}</p>
        : <div className="grid gap-2 sm:grid-cols-3">{companions.map(({ key, prefix, value }) => {
          if (!value) return null;
          const summary = references.get(`${prefix}:${value.id}`);
          const sourceName = typeof value.name === "string" && value.name.trim() ? value.name : summary?.name;
          const name = sourceName
            ? getItemDisplayName(sourceName, gameText(sourceName))
            : t("characterProfiles.unnamedAppearance", { type: t(`characterProfiles.appearance.${key}`), id: value.id });
          const currentLevel = "level" in value && typeof value.level === "number" ? value.level : undefined;
          const content = <><ItemIcon icon={value.icon} name={name} size={42} /><span className="min-w-0 flex-1"><span className="block text-[11px] text-subtle">{t(`characterProfiles.appearance.${key}`)}</span><span className="block truncate text-[12px] font-semibold text-white" title={name}>{name}</span></span>{summary && <ArrowUpRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />}</>;
          return <CharacterReferencePreview key={key} summary={summary} name={name} extra={currentLevel ? t("characterProfiles.petLevel", { level: currentLevel }) : undefined} currentLevel={currentLevel}>
            {summary ? <button type="button" onClick={() => openReference(summary)} aria-label={t("characterProfiles.openAppearance", { name })} className="flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border bg-background/60 px-3 py-3 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">{content}</button>
              : <div className="flex w-full min-w-0 items-center gap-3 rounded-[var(--radius-md)] border border-border bg-background/60 px-3 py-3">{content}</div>}
          </CharacterReferencePreview>;
        })}</div>}
    </section>
    {data.skins.length > 0 && <section><SectionHeading title={t("characterProfiles.skins")} count={data.skins.length} />
      <div className="grid auto-rows-fr gap-2 sm:grid-cols-2">{data.skins.map((item) => <CharacterEquipmentCard key={`${item.slotPos}:${item.id}`} item={item} catalogItem={itemsById.get(String(item.id))} uniform />)}</div>
    </section>}
    <section><SectionHeading title={t("characterProfiles.titles")} count={equippedTitles.length} />
      {equippedTitles.length === 0 ? <p className="text-[12px] text-subtle">{t("characterProfiles.noTitlesEquipped")}</p>
        : <div className="grid gap-2 sm:grid-cols-2">{equippedTitles.map((title) => {
        const summary = references.get(`Title:${title.id}`);
        const content = <><Sparkles size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold text-white">{gameText(title.name)}</span><span className="mt-0.5 block text-[11px] text-subtle">{gameText(title.equipCategory)} · <ItemGrade grade={title.grade} /></span></span>{summary && <ArrowUpRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />}</>;
        return <CharacterReferencePreview key={title.id} summary={summary} name={gameText(title.name)}>
          {summary ? <button type="button" onClick={() => openReference(summary)} aria-label={t("characterProfiles.openAppearance", { name: gameText(title.name) })} className="flex w-full cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] border border-border bg-background/60 px-3 py-3 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">{content}</button>
            : <div className="flex w-full items-start gap-2.5 rounded-[var(--radius-md)] border border-border bg-background/60 px-3 py-3">{content}</div>}
        </CharacterReferencePreview>;
      })}</div>}
    </section>
  </div>;
};

const CharacterProfileSections = ({ data, tab }: { data: CharacterProfileData; tab: ProfileTab }) => {
  const index = useReferenceIndex(tab === "skills" || tab === "daevanion" || tab === "appearance");
  const entries = index.status === "ready" ? index.data.entries : null;
  const references = useMemo(() => new Map(entries?.map((entry) => [entry.id, entry]) ?? []), [entries]);
  if (tab === "equipment") return <EquipmentSection data={data} />;
  if (tab === "skills") return <SkillsSection data={data} references={references} />;
  if (tab === "daevanion") return <DaevanionSection data={data} references={references} />;
  if (tab === "stats") return <StatsSection data={data} />;
  return <AppearanceSection data={data} references={references} />;
};

export default CharacterProfileSections;
