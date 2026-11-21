import { useTranslation } from "react-i18next";
import type { ErItem } from "../../data/er-items-data";

/** Raw Ash-of-War mount enums mapped to the player-facing weapon class names. */
const MOUNT_LABELS: Record<string, string> = {
  Dagger: "Daggers", SwordNormal: "Straight Swords", SwordLarge: "Greatswords",
  SwordGigantic: "Colossal Swords", SaberNormal: "Curved Swords", SaberLarge: "Curved Greatswords",
  katana: "Katanas", SwordDoubleEdge: "Twinblades", SwordPierce: "Thrusting Swords",
  RapierHeavy: "Heavy Thrusting Swords", LightGreatsword: "Light Greatswords",
  GreatKatana: "Great Katanas", ReverseHandSword: "Backhand Blades",
  AxeNormal: "Axes", AxeLarge: "Greataxes", HammerNormal: "Hammers", HammerLarge: "Great Hammers",
  Flail: "Flails", AxhammerLarge: "Colossal Weapons",
  SpearNormal: "Spears", SpearHeavy: "Great Spears", SpearAxe: "Halberds", Sickle: "Reapers",
  Knuckle: "Fists", Claw: "Claws", HandToHand: "Hand-to-Hand Arts", BeastClaw: "Beast Claws",
  Whip: "Whips", PerfumeBottle: "Perfume Bottles", ThrustingShield: "Thrusting Shields",
  ThrowingWeapon: "Throwing Blades", BowSmall: "Light Bows", BowNormal: "Bows", BowLarge: "Greatbows",
  ShieldSmall: "Small Shields", ShieldNormal: "Medium Shields", ShieldLarge: "Greatshields", Torch: "Torches",
};

const mountLabel = (mount: string): string =>
  MOUNT_LABELS[mount] ?? mount.replace(/([a-z])([A-Z])/g, "$1 $2");

const ErItemUsableOn = ({ item }: { item: ErItem }) => {
  const { t } = useTranslation();
  const mounts = item.category === "ash-of-war" && Array.isArray(item.stats.mounts)
    ? item.stats.mounts as string[]
    : [];

  if (mounts.length === 0) return null;

  return (
    <section>
      <h4 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
        <span className="h-px w-3 bg-accent/60" aria-hidden="true" />
        {t("codex.section.usableOn")}
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {mounts.map((mount) => {
          const label = mountLabel(mount);
          return (
            <span key={mount} className="rounded-[var(--radius-full)] bg-white/8 px-2 py-0.5 text-[11px] text-zinc-200">
              {t(`term.${label}`, { defaultValue: label })}
            </span>
          );
        })}
      </div>
    </section>
  );
};

export default ErItemUsableOn;
