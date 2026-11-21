import type { DatabaseItem } from "../database/item-database-types";
import type { ReferenceLink } from "./reference-types";

export function groupEquipmentSetPieces(links: ReferenceLink[], items: DatabaseItem[], gradeOrder: readonly string[]) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const groups = new Map<string, DatabaseItem[]>();
  for (const id of new Set(links.filter((link) => link.category === "items").map((link) => link.id))) {
    const item = itemsById.get(id);
    if (!item) throw new Error(`Missing equipment set item: ${id}`);
    const variants = groups.get(item.category) ?? [];
    variants.push(item);
    groups.set(item.category, variants);
  }
  const rank = (grade: string) => {
    const index = gradeOrder.indexOf(grade);
    return index < 0 ? gradeOrder.length : index;
  };
  return [...groups].map(([category, variants]) => ({
    category,
    variants: variants.sort((a, b) => rank(a.grade) - rank(b.grade)
      || (a.itemLevel ?? 0) - (b.itemLevel ?? 0) || a.id.localeCompare(b.id)),
  }));
}
