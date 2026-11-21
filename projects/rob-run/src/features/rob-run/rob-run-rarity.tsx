import ItemIcon from "../database/item-icon";
import { getRarityKey } from "./rob-run-data";
import "./rob-run-rarity.css";

type RarityFields = { rarity?: number; reference?: { rarity?: string } };

export function itemRarityClass(item?: RarityFields) {
  const rarity = getRarityKey(item?.rarity, item?.reference?.rarity);
  return rarity ? `rob-run-rarity-text rob-run-rarity-${rarity}` : undefined;
}

export function RobRunItemIcon({ item, size = 28, loading }: {
  item?: RarityFields & { icon?: string; name: string };
  size?: number;
  loading?: "eager" | "lazy";
}) {
  if (!item?.icon) return null;
  const rarity = getRarityKey(item.rarity, item.reference?.rarity);
  return <ItemIcon icon={item.icon} name={item.name} size={size} loading={loading}
    className={rarity ? `rob-run-rarity-frame rob-run-rarity-${rarity}` : undefined} />;
}
