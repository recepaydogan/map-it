import { ArrowDown, ArrowUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { humanize } from "../../lib/humanize";
import { getMapCombatTypeColor } from "./map-config";

const useCombatTypeLabel = () => {
  const { t } = useTranslation();
  return (type: string) => t(`map.character.damageTypes.${type.toLocaleLowerCase("en-US")}`, {
    defaultValue: humanize(type),
  });
};

export const MapCombatTypeList = ({ types }: { types: string[] }) => {
  const { t } = useTranslation();
  const label = useCombatTypeLabel();

  return (
    <>
      {types.map((type, index) => (
        <span key={type}>
          <span className="font-semibold" style={{ color: getMapCombatTypeColor(type) }}>
            {label(type)}
          </span>
          {index < types.length - 2
            ? ", "
            : index === types.length - 2
              ? ` ${t("map.character.and")} `
              : ""}
        </span>
      ))}
    </>
  );
};

interface MapCombatTypeChipProps {
  type: string;
  direction?: "up" | "down";
}

export const MapCombatTypeChip = ({ type, direction }: MapCombatTypeChipProps) => {
  const label = useCombatTypeLabel();
  const color = getMapCombatTypeColor(type);

  return (
    <span
      className="flex items-center gap-1 rounded-[var(--radius-full)] px-2 py-0.5 text-[12px] font-medium"
      style={{ color, backgroundColor: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}33` }}
    >
      {direction === "up" && <ArrowUp size={11} aria-hidden="true" />}
      {direction === "down" && <ArrowDown size={11} aria-hidden="true" />}
      {label(type)}
    </span>
  );
};
