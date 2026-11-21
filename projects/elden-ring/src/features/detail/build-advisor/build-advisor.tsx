import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { Beaker, Gem, PackageOpen, Shield, Sparkles, Users, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Combat } from "../../../data/combat";
import { erItemKey } from "../../../data/er-items-data";
import type { MapLayer } from "../../../data/types";
import { isDlcBoss } from "./advisor-data";
import { recommendBossBuild } from "./recommend-build";
import BuildControls from "./build-controls";
import BuildMetrics from "./build-metrics";
import LoadoutSection from "./loadout-section";
import ProgressionWarning from "./progression-warning";
import SpellSection from "./spell-section";
import { canRecommendSpiritAsh } from "./spirit-ash-availability";
import WeaponList from "./weapon-list";

interface BuildAdvisorProps {
  bossName: string;
  markerId: string;
  encounterCategory: string;
  encounterLayer: MapLayer;
  npcParamId?: number;
  bossHp?: number;
  bossRunes?: number;
  bossPoise?: number;
  bossRegion?: string;
  bossScaleRegion?: string;
  combat: Combat;
  onSelectItem: (itemKey: string) => void;
}

/**
 * Rune level and grip are properties of the PLAYER, not of the boss — so they
 * outlive this component. It unmounts whenever you drill into one of the recommended
 * items (the item page takes the panel over) and on every language switch; without
 * this the level you dialled in would snap back to 1 on the way back. Module-level
 * and deliberately not persisted to disk: it's a session preference.
 */
const prefs = {
  level: 1,
  twoHanded: true,
  scadutreeLevel: 10,
  showLevelCue: true,
};

const BuildAdvisor = ({
  bossName,
  markerId,
  encounterCategory,
  encounterLayer,
  npcParamId,
  bossHp,
  bossRunes,
  bossPoise,
  bossRegion,
  bossScaleRegion,
  combat,
  onSelectItem,
}: BuildAdvisorProps) => {
  const { t } = useTranslation();
  const isDlc = encounterLayer === "dlc-realm-of-shadow" || isDlcBoss(markerId);
  const [level, setLevelState] = useState(prefs.level);
  const [twoHanded, setTwoHandedState] = useState(prefs.twoHanded);
  const [scadutreeLevel, setScadutreeLevelState] = useState(prefs.scadutreeLevel);
  const [showLevelCue, setShowLevelCue] = useState(prefs.showLevelCue);
  const setLevel = useCallback((value: number) => {
    prefs.level = value;
    prefs.showLevelCue = false;
    setLevelState(value);
    setShowLevelCue(false);
  }, []);
  const dismissLevelCue = useCallback(() => {
    prefs.showLevelCue = false;
    setShowLevelCue(false);
  }, []);
  const setTwoHanded = useCallback((value: boolean) => { prefs.twoHanded = value; setTwoHandedState(value); }, []);
  const setScadutreeLevel = useCallback((value: number) => { prefs.scadutreeLevel = value; setScadutreeLevelState(value); }, []);
  const deferredLevel = useDeferredValue(level);
  const recommendation = useMemo(
    () => recommendBossBuild({
      markerId,
      npcParamId,
      bossName,
      combat,
      bossHp,
      bossRunes,
      bossPoise,
      bossRegion,
      bossScaleRegion,
      spiritAshAllowed: canRecommendSpiritAsh(encounterCategory, markerId),
      encounterLayer,
      level: deferredLevel,
      style: "damage",
      twoHanded,
      scadutreeLevel: isDlc ? scadutreeLevel : undefined,
    }),
    [markerId, npcParamId, bossName, bossHp, bossRunes, bossPoise, bossRegion, bossScaleRegion, combat, encounterCategory, encounterLayer, deferredLevel, twoHanded, isDlc, scadutreeLevel],
  );

  return (
    <div className="space-y-3.5 pb-1">
      <BuildControls
        level={level}
        twoHanded={twoHanded}
        onLevelChange={setLevel}
        onTwoHandedChange={setTwoHanded}
        scadutreeLevel={isDlc ? scadutreeLevel : undefined}
        onScadutreeLevelChange={isDlc ? setScadutreeLevel : undefined}
        highlightLevel={showLevelCue}
        onLevelHighlightEnd={dismissLevelCue}
      />

      {recommendation ? (
        <>
          {recommendation.progression.status === "below" && (
            <ProgressionWarning progression={recommendation.progression} />
          )}
          <WeaponList
            key={markerId}
            weapons={[recommendation.weapon, ...recommendation.alternatives]}
            onSelect={(weapon) => onSelectItem(erItemKey(weapon.item))}
          />
          <div className="space-y-1.5">
            <LoadoutSection
              title={t("detail.buildAdvisor.ashOfWar")}
              icon={Zap}
              items={recommendation.ashOfWar ? [recommendation.ashOfWar] : []}
              onSelect={onSelectItem}
              open
            />
            <LoadoutSection
              title={t("detail.buildAdvisor.offhand")}
              icon={Shield}
              items={recommendation.offhand ? [recommendation.offhand] : []}
              onSelect={onSelectItem}
              open
            />
          </div>

          {recommendation.bossCounters.length > 0 && (
            <LoadoutSection
              title={t("detail.buildAdvisor.bossTools")}
              icon={Sparkles}
              items={recommendation.bossCounters}
              onSelect={onSelectItem}
              open
              accent
            />
          )}

          <div className="flex min-w-0 items-center gap-2 px-1 pt-1">
            <span className="h-px flex-1 bg-white/[0.07]" aria-hidden="true" />
            <h3 className="break-words text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300">
              {t("detail.buildAdvisor.recommendedSupport")}
            </h3>
            <span className="h-px flex-1 bg-white/[0.07]" aria-hidden="true" />
          </div>

          <div className="space-y-1.5">
            <SpellSection spells={recommendation.spells} onSelect={onSelectItem} open />
            <LoadoutSection title={t("detail.buildAdvisor.talismans")} icon={Gem} items={recommendation.talismans} onSelect={onSelectItem} open />
            <LoadoutSection title={t("detail.buildAdvisor.physick")} icon={Beaker} items={recommendation.tears} onSelect={onSelectItem} open />
            <LoadoutSection title={t("detail.buildAdvisor.consumables")} icon={PackageOpen} items={recommendation.consumables} onSelect={onSelectItem} open />
            <LoadoutSection
              title={t("detail.buildAdvisor.spirit")}
              icon={Users}
              items={recommendation.spirit ? [recommendation.spirit] : []}
              onSelect={onSelectItem}
              open
            />
          </div>

          {/* DLC scaling is encounter context, so it reads after the loadout. */}
          {recommendation.scadutree && <BuildMetrics recommendation={recommendation} />}

        </>
      ) : (
        <div className="rounded-[var(--radius-md)] border border-border bg-white/[0.025] p-4 text-center text-[12px] text-zinc-500">
          {t("detail.buildAdvisor.noBuild")}
        </div>
      )}
    </div>
  );
};

export default BuildAdvisor;
