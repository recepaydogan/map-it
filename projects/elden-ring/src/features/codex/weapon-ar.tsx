import { useState } from "react";
import { Swords, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  type DamageKey,
  type StatKey,
  computeAR,
  hasScaling,
  maxUpgrade,
} from "../../data/er-ar";
import { useMapStore } from "../../store/map-store";
import { cn } from "../../lib/cn";

/** The player-stat keys in map-store are title-cased; the scaling tables use short keys. */
const STAT_FROM_STORE: Record<StatKey, string> = {
  str: "Str",
  dex: "Dex",
  int: "Int",
  fai: "Fai",
  arc: "Arc",
};

const DAMAGE_COLOR: Record<DamageKey, string> = {
  physical: "#d4d4d8",
  magic: "#818cf8",
  fire: "#fb923c",
  lightning: "#facc15",
  holy: "#fde68a",
};

const STAT_LABEL: Record<StatKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  int: "Intelligence",
  fai: "Faith",
  arc: "Arcane",
};

/** The app's shared combat-type vocabulary is title-cased (combatType.Physical …). */
const DAMAGE_LABEL: Record<DamageKey, string> = {
  physical: "Physical",
  magic: "Magic",
  fire: "Fire",
  lightning: "Lightning",
  holy: "Holy",
};

/**
 * Attack Rating — what the weapon actually hits for with the build in the stats editor, at any
 * upgrade level, one- or two-handed. This is the game's own formula over the game's own tables
 * (base × upgrade multiplier, plus each scaling stat through its soft-cap curve); no estimates.
 *
 * Verified against canonical values: Longsword +25 at 40/40 = 453; Blasphemous Blade +10 at
 * 60 Faith = 787; Moonveil +10 at 60 Int = 634.
 */
const WeaponAR = ({ weaponId }: { weaponId: number }) => {
  const { t } = useTranslation();
  const playerStats = useMapStore((s) => s.playerStats);
  const max = maxUpgrade(weaponId);
  const [level, setLevel] = useState(max);
  const [twoHanded, setTwoHanded] = useState(false);

  if (!hasScaling(weaponId)) return null;

  const stats = Object.fromEntries(
    (Object.keys(STAT_FROM_STORE) as StatKey[]).map((k) => [k, playerStats[STAT_FROM_STORE[k]] ?? 10]),
  ) as Record<StatKey, number>;

  const ar = computeAR(weaponId, Math.min(level, max), stats, twoHanded);
  if (!ar) return null;

  return (
    <section className="mt-3 rounded-[var(--radius-lg)] border border-border bg-white/[0.02] p-3.5">
      <header className="flex items-center gap-2">
        <Swords size={14} className="text-accent" aria-hidden="true" />
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
          {t("codex.section.attackRating")}
        </h3>
        <span className="flex-1" />
        <span className="text-[22px] font-semibold leading-none tabular-nums text-white">
          {Math.round(ar.total)}
        </span>
      </header>

      <div className="mt-2.5 space-y-1">
        {ar.parts.map((p) => (
          <p key={p.type} className="flex items-baseline gap-2 text-[12px]">
            <span className="w-16 shrink-0" style={{ color: DAMAGE_COLOR[p.type] }}>
              {t(`combatType.${DAMAGE_LABEL[p.type]}`, { defaultValue: DAMAGE_LABEL[p.type] })}
            </span>
            <span className="tabular-nums font-medium text-zinc-200">{Math.round(p.total)}</span>
            <span className="tabular-nums text-subtle">
              {Math.round(p.base)} + {Math.round(p.scaling)}
            </span>
          </p>
        ))}
      </div>

      {/* Upgrade level: the game's own cap (25 standard / 10 somber). */}
      {max > 0 && (
        <label className="mt-3 block">
          <span className="flex items-baseline justify-between text-[11px] text-zinc-500">
            <span>{t("codex.arUpgrade")}</span>
            <span className="font-semibold text-zinc-300">+{Math.min(level, max)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={max}
            value={Math.min(level, max)}
            onChange={(e) => setLevel(Number(e.target.value))}
            style={{ accentColor: "var(--accent)" }}
            className="mt-1 w-full"
          />
        </label>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTwoHanded((v) => !v)}
          className={cn(
            "rounded-[var(--radius-full)] px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
            twoHanded ? "bg-accent-soft text-accent" : "bg-white/8 text-zinc-400 hover:text-zinc-200",
          )}
        >
          {t("codex.arTwoHanded")}
        </button>
        {ar.scalingStats.length > 0 && (
          <span className="text-[11px] text-zinc-500">
            {t("codex.arScalesWith", {
              stats: ar.scalingStats
                .map((s) => t(`stat.${STAT_LABEL[s]}`, { defaultValue: STAT_LABEL[s] }))
                .join(", "),
            })}
          </span>
        )}
      </div>

      {ar.unmet.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 rounded-[var(--radius-md)] bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-amber-300">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {t("codex.arUnmet", {
              stats: ar.unmet
                .map((u) => `${t(`stat.${STAT_LABEL[u.stat]}`, { defaultValue: STAT_LABEL[u.stat] })} ${u.need}`)
                .join(", "),
            })}
          </span>
        </p>
      )}
    </section>
  );
};

export default WeaponAR;
