import { useState } from "react";
import type { WeaponRecommendation } from "./types";
import WeaponDetails from "./weapon-details";
import WeaponSummaryRow from "./weapon-summary-row";

interface WeaponListProps {
  weapons: WeaponRecommendation[];
  onSelect: (weapon: WeaponRecommendation) => void;
}

const WeaponList = ({ weapons, onSelect }: WeaponListProps) => {
  const [expandedWeaponId, setExpandedWeaponId] = useState<number | null>(null);

  return (
    <section className="space-y-1.5">
      {weapons.map((weapon, index) => {
        const expanded = expandedWeaponId === weapon.weaponId;
        return (
          <div key={weapon.weaponId}>
            <WeaponSummaryRow
              weapon={weapon}
              featured={index === 0}
              expanded={expanded}
              onToggle={() => setExpandedWeaponId(expanded ? null : weapon.weaponId)}
            />
            {expanded && (
              <div className="mt-1.5">
                <WeaponDetails weapon={weapon} onSelect={() => onSelect(weapon)} />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
};

export default WeaponList;
