import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import Tooltip from "../../components/tooltip";
import ItemIcon from "../database/item-icon";
import { useItemCatalog } from "../database/use-item-catalog";
import SpellIcon from "../spells/spell-icon";
import SpellLink from "../spells/spell-link";
import { cachedBossData, dungeonBossLootIds, loadBossData, type BossData } from "./dungeon-boss-data";
import { dungeonBossIndex } from "./dungeon-boss-target";
import { dungeonCreatureName } from "./dungeon-journal";
import { useReferenceNavigation } from "./reference-navigation-context";
import type { ReferenceTarget } from "./reference-types";

const abilityCardClass = "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-white/[0.025] px-2.5 py-2 text-left text-[12px] font-medium text-zinc-100 [overflow-wrap:anywhere] hover:border-accent/40 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-accent";

// Authored guides describe some mechanics without a spell ID. Use representative game icons for those cards.
const guideAbilityIcons: Partial<Record<string, number>> = {
  "Mind Blast": 136224,
  "Anvilmar's Curse": 236366,
  "Fire Nova": 135824,
  Combustion: 135824,
  Knockback: 132219,
  "AoE Fear": 136183,
  Rend: 132155,
  Poison: 136016,
  Cleave: 132338,
  "Frost Armor": 135843,
  "Drain Life": 136169,
  "Frost Nova": 135848,
  Flamestrike: 135826,
  "Area Damage": 135903,
  "Dust Storm": 796635,
  "Tendon Rip": 132109,
  "Terrifying Roar": 132111,
  Enrage: 136224,
  Thunderclap: 136105,
  Stun: 135860,
};

const guideAbilityTerms: Readonly<Partial<Record<string, number>>> = {
  "Mind Blast": 1232743,
  "Anvilmar's Curse": 1292602,
  "Fire Nova": 461702,
  Combustion: 28682,
  Rend: 1321234,
  Poison: 348005,
  Cleave: 1232677,
  "Frost Armor": 18100,
  "Drain Life": 1310087,
  "Frost Nova": 1220855,
  Flamestrike: 1314281,
  "Dust Storm": 1316382,
  "Tendon Rip": 1265048,
  "Terrifying Roar": 1324618,
  Enrage: 19953,
  Thunderclap: 1213464,
  Stun: 1323500,
};

const guideMechanicLabels: Readonly<Partial<Record<string, string>>> = {
  Knockback: "bossGuide.mechanics.knockback",
  "AoE Fear": "bossGuide.mechanics.areaFear",
  "Area Damage": "bossGuide.mechanics.areaDamage",
};

const lootStatKeys: Readonly<Partial<Record<string, string>>> = {
  Agility: "database.clientItem.stat.3",
  Strength: "database.clientItem.stat.4",
  Intellect: "database.clientItem.stat.5",
  Spirit: "database.clientItem.stat.6",
  Stamina: "database.clientItem.stat.7",
  "Attack Power": "database.clientItem.stat.38",
  "Healing Power": "database.clientItem.stat.41",
  "Spell Damage": "database.clientItem.stat.42",
  "Spell Power": "database.clientItem.stat.45",
  "Spell Penetration": "database.clientItem.stat.47",
  "Block Value": "database.clientItem.stat.48",
  "Frost Resistance": "database.clientItem.stat.52",
  "Nature Resistance": "database.clientItem.stat.55",
  "Arcane Resistance": "database.clientItem.stat.56",
  "Mana per 5 sec": "bossGuide.manaPerFive",
  "Health per 5 sec": "bossGuide.lootStats.healthPerFive",
  Block: "bossGuide.lootStats.block",
  Hit: "bossGuide.lootStats.hit",
  "Critical Strike": "bossGuide.lootStats.criticalStrike",
  "Skinning Skill": "bossGuide.lootStats.skinning",
  "Attack Power Vs Humanoid": "bossGuide.lootStats.humanoidAttackPower",
  "Nature Damage Done": "bossGuide.lootStats.natureDamage",
  "Shadow Damage Done": "bossGuide.lootStats.shadowDamage",
  "Arcane Damage Done": "bossGuide.lootStats.arcaneDamage",
};

const DungeonBossDetailPanel = ({ target, embedded = false }: { target: ReferenceTarget; embedded?: boolean }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const openReference = useReferenceNavigation();
  const [data, setData] = useState<BossData | null>(cachedBossData);
  const [error, setError] = useState(false);
  const guides = data?.guides[target.id]?.bosses;
  const indexedBoss = guides?.[dungeonBossIndex(target)];
  const boss = target.name && indexedBoss?.name !== target.name
    ? guides?.find((entry) => entry.name === target.name) : indexedBoss;
  const bossName = boss?.name ?? target.name;
  const lootIds = bossName ? dungeonBossLootIds(target.id, bossName, boss?.loot) : [];
  const needsCatalog = lootIds.some((id) => !data?.loot[id]);
  const catalog = useItemCatalog(needsCatalog);
  useEffect(() => {
    let active = true;
    void loadBossData().then((value) => { if (active) setData(value); }).catch((cause: unknown) => {
      console.error("Failed to load dungeon boss detail", cause);
      if (active) setError(true);
    });
    return () => { active = false; };
  }, []);

  if (error) return <p className="p-4 text-sm text-subtle" role="alert">{t("reference.error")}</p>;
  if (!data) return <p className="p-4 text-sm text-subtle" role="status">{t("reference.loading")}</p>;
  if (!bossName) return <p className="p-4 text-sm text-subtle" role="alert">{t("reference.error")}</p>;
  const mechanics = data.rosters[target.id]?.mechanics?.[bossName];
  const npcId = boss?.npcId ?? mechanics?.npcIds[0];
  const loot = lootIds.flatMap((id) => {
    const item = data.loot[id];
    if (item) return [item];
    const entry = catalog.status === "ready" ? catalog.catalog.items.find((candidate) => candidate.id === id) : undefined;
    return entry ? [{ ...entry, stats: entry.sections.find((section) => section.key === "base")?.stats ?? [] }] : [];
  });

  return <article className={embedded ? undefined : "scroll-slim min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4"}>
    {!embedded && <h2 className="font-display text-xl font-semibold text-white">{dungeonCreatureName(bossName, t, gameText, npcId)}</h2>}
    {boss?.rare && <p className="mt-1 text-xs font-medium text-accent">{t("bossGuide.rare")}</p>}
    {boss?.tipKey && <p className="mt-3 select-text text-[13px] leading-relaxed text-zinc-200">{t(boss.tipKey)}</p>}
    {!!(boss?.abilities?.length || mechanics?.abilities.length) && <section className="mt-5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">{t("bossGuide.watchFor")}</h3>
      <ul className="space-y-1.5">
        {boss?.abilities?.length ? boss.abilities.map((ability) => {
          const labelKey = guideMechanicLabels[ability.name];
          const term = guideAbilityTerms[ability.name];
          const name = labelKey ? t(labelKey) : gameText(ability.name, term ? `SpellName:${term}:0` : undefined);
          return <li key={ability.name}>
            <Tooltip wrap align="start" side="top" className="w-full" contentClassName="marker-tooltip-content"
              label={t(ability.descriptionKey)}>
              <span tabIndex={0} className={`${abilityCardClass} cursor-help`}>
                <SpellIcon id={guideAbilityIcons[ability.name]} name={name} size={32} />
                {name}
              </span>
            </Tooltip>
          </li>;
        }) : mechanics?.abilities.map((ability, index) => <li key={`${ability.spellId}-${index}`}>
          <SpellLink id={ability.spellId} name={ability.name} showIcon iconSize={32} wrapperClassName="w-full"
            className={`${abilityCardClass} cursor-pointer`}
            previewNote={ability.target ? t("bossGuide.target", {
              target: t(`bossGuide.targets.${ability.target}`, { defaultValue: ability.target }),
            }) : undefined} />
        </li>)}
      </ul>
    </section>}
    <section className="mt-5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">{t("bossGuide.loot")}</h3>
      {!lootIds.length && <p className="text-xs text-subtle">{t("dungeonJournal.noBossLoot")}</p>}
      {needsCatalog && catalog.status === "loading" && <p role="status" className="text-xs text-subtle">{t("reference.loading")}</p>}
      {needsCatalog && catalog.status !== "loading" && loot.length < lootIds.length
        && <p role="alert" className="text-xs text-subtle">{t("dungeonJournal.unavailableLoot")}</p>}
      <div className="space-y-1.5">{loot.map((item) => {
        const { id } = item;
        const name = gameText(item.name, `ItemSparse:${id}:4`);
        return <div key={id}><Tooltip wrap align="start" side="top" className="w-full"
          label={<span className="block max-w-[16rem] text-left">
            <span className="block font-semibold text-accent">{name}</span>
            <span className="block font-normal text-subtle">
              {t(`database.clientItem.quality.${item.grade.toLowerCase()}`, { defaultValue: item.grade })}
              {item.itemLevel ? ` · ${t("database.itemLevel", { level: item.itemLevel })}` : ""}
            </span>
            {item.stats.map((stat) => <span key={stat.label} className="mt-0.5 block font-normal text-zinc-200">
              {stat.value} {t(lootStatKeys[stat.label] ?? stat.label, { defaultValue: gameText(stat.label) })}
            </span>)}
          </span>}>
          <button type="button" onClick={() => openReference({ category: "items", id, name: item.name })}
            className={`${abilityCardClass} cursor-pointer`}>
            <ItemIcon icon={item.icon} name={name} size={32} /><span className="min-w-0 flex-1 truncate">{name}</span><ArrowRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />
          </button>
        </Tooltip></div>;
      })}</div>
    </section>
  </article>;
};

export default DungeonBossDetailPanel;
