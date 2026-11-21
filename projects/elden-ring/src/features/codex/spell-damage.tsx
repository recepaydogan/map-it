import { useState } from "react";
import { Sparkles, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DamageKey, StatKey } from "../../data/er-ar";
import {
  catalystsFor,
  catalystMax,
  computeSpellDamage,
  hasSpellDamage,
  spellType,
} from "../../data/er-spell-damage";
import { useMapStore } from "../../store/map-store";

/** The player-stat keys in map-store are title-cased; the calculator uses short keys. */
const STAT_FROM_STORE: Record<StatKey, string> = {
  str: "Str",
  dex: "Dex",
  int: "Int",
  fai: "Fai",
  arc: "Arc",
};

/** Same damage-type palette as weapon-ar.tsx so the two cards read as one system. */
const DAMAGE_COLOR: Record<DamageKey, string> = {
  physical: "#d4d4d8",
  magic: "#818cf8",
  fire: "#fb923c",
  lightning: "#facc15",
  holy: "#fde68a",
};

/** The app's shared combat-type vocabulary is title-cased (combatType.Physical …). */
const DAMAGE_LABEL: Record<DamageKey, string> = {
  physical: "Physical",
  magic: "Magic",
  fire: "Fire",
  lightning: "Lightning",
  holy: "Holy",
};

const CAST_STAT_LABEL: Record<StatKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  int: "Intelligence",
  fai: "Faith",
  arc: "Arcane",
};

/**
 * Spell damage — what a sorcery/incantation hits for, cast from the chosen catalyst at any upgrade
 * level, with the build in the stats editor. The sorcery/incantation analogue of WeaponAR.
 *
 * The per-element BASE values are exact (from the spell's Bullet → AtkParam chain); the catalyst
 * multiplier reuses the weapon-AR scaling machinery (see er-spell-damage.ts) and is approximate at
 * high upgrade — surfaced honestly via the "approximate" footnote. Multi-hit / AoE spells show the
 * per-projectile number rather than a fabricated full-cast total.
 */
const SpellDamage = ({ spellKey }: { spellKey: string }) => {
  const { t } = useTranslation();
  const playerStats = useMapStore((s) => s.playerStats);
  const type = spellType(spellKey);
  const catalysts = type ? catalystsFor(type) : [];
  const [catalystId, setCatalystId] = useState<number>(catalysts[0]?.id ?? 0);
  const [level, setLevel] = useState(25);

  if (!hasSpellDamage(spellKey) || !type || catalysts.length === 0) return null;

  // Keep the selection valid even if the spell (and therefore the catalyst list) changed.
  const active = catalysts.find((c) => c.id === catalystId) ?? catalysts[0];
  const max = catalystMax(active.id);
  const lvl = Math.min(level, max);

  const stats = Object.fromEntries(
    (Object.keys(STAT_FROM_STORE) as StatKey[]).map((k) => [k, playerStats[STAT_FROM_STORE[k]] ?? 10]),
  ) as Record<StatKey, number>;

  const res = computeSpellDamage(spellKey, active.id, lvl, stats);
  if (!res) return null;

  const perHit = Math.round(res.total);
  const statLabel = CAST_STAT_LABEL[res.castStat];

  return (
    <section className="mt-3 rounded-[var(--radius-lg)] border border-border bg-white/[0.02] p-3.5">
      <header className="flex items-center gap-2">
        <Sparkles size={14} className="text-accent" aria-hidden="true" />
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
          {t("codex.section.spellDamage")}
        </h3>
        <span className="flex-1" />
        <span className="text-[22px] font-semibold leading-none tabular-nums text-white">{perHit}</span>
      </header>

      <div className="mt-2.5 space-y-1">
        {res.parts.map((p) => (
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

      {/* Multi-hit / AoE spells: the number above is per projectile. Show the count when known. */}
      {res.multiHit && (
        <p className="mt-2 text-[11.5px] text-zinc-400">
          {res.hitCount > 1
            ? t("codex.spellPerHit", { damage: perHit, count: res.hitCount })
            : t("codex.spellMultiHit")}
        </p>
      )}

      {/* Catalyst picker — staves for sorceries, seals for incantations. */}
      <label className="mt-3 block">
        <span className="text-[11px] text-zinc-500">{t("codex.spellCatalyst")}</span>
        <select
          value={active.id}
          onChange={(e) => {
            setCatalystId(Number(e.target.value));
            setLevel(catalystMax(Number(e.target.value)));
          }}
          className="mt-1 w-full cursor-pointer rounded-[var(--radius-md)] border border-border bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none focus:border-accent"
        >
          {catalysts.map((c) => (
            <option key={c.id} value={c.id} className="bg-zinc-900 text-zinc-100">
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {/* Upgrade level: the catalyst's own cap (25 standard / 10 somber; hidden when fixed at +0). */}
      {max > 0 && (
        <label className="mt-3 block">
          <span className="flex items-baseline justify-between text-[11px] text-zinc-500">
            <span>{t("codex.spellUpgrade")}</span>
            <span className="font-semibold text-zinc-300">+{lvl}</span>
          </span>
          <input
            type="range"
            min={0}
            max={max}
            value={lvl}
            onChange={(e) => setLevel(Number(e.target.value))}
            style={{ accentColor: "var(--accent)" }}
            className="mt-1 w-full"
          />
        </label>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-[var(--radius-full)] bg-white/8 px-2.5 py-1 text-[11px] font-medium tabular-nums text-zinc-300">
          ×{(res.spellbuff / 100).toFixed(2)}
        </span>
        <span className="text-[11px] text-zinc-500">
          {t("codex.spellScalesWith", {
            stat: t(`stat.${statLabel}`, { defaultValue: statLabel }),
          })}
        </span>
      </div>

      {res.unmet.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 rounded-[var(--radius-md)] bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-amber-300">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {t("codex.spellUnmet", {
              stats: res.unmet
                .map((u) => `${t(`stat.${CAST_STAT_LABEL[u.stat]}`, { defaultValue: CAST_STAT_LABEL[u.stat] })} ${u.need}`)
                .join(", "),
            })}
          </span>
        </p>
      )}

      <p className="mt-2 text-[10.5px] leading-relaxed text-subtle">{t("codex.spellApprox")}</p>
    </section>
  );
};

export default SpellDamage;
