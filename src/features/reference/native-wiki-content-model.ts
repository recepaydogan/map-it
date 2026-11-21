export interface NativeEffectText { title?: string; text: string; equipped: boolean }
export interface NativeDisplayStat { label: string; value: number; iconPath?: string }
export type NativeContent = { kind: "effects"; effects: NativeEffectText[] }
  | { kind: "stats"; stats: NativeDisplayStat[] };

const effectFields = new Set(["FlowLocText", "EffectDesc", "WeaponDesc", "WeaponTitle", "bApplyOnCurrentEquipOnly",
  "GELevel", "SoftClassPtr", "GEClass", "GEIcon", "GameplayEffectClass", "NiagaraSystem", "AudioEvent"]);
const statFields = new Set(["GEDescription", "DefaultValue", "GEIcon", "CurveFloat"]);
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/** Recognize complete native display records only; unknown structures keep the general renderer. */
export const nativeDisplayContent = (value: unknown): NativeContent | undefined => {
  const values = Array.isArray(value) ? value : [value];
  if (!values.length) return;
  const rows = values.map(object);
  if (rows.some(row => !row)) return;
  const records = rows as Record<string, unknown>[];
  if (records.every(row => typeof row.GEDescription === "string" && row.GEDescription.trim()
    && typeof row.DefaultValue === "number" && Number.isFinite(row.DefaultValue)
    && Object.keys(row).every(key => statFields.has(key)))) {
    return { kind: "stats", stats: records.map(row => ({ label: String(row.GEDescription), value: Number(row.DefaultValue),
      iconPath: typeof object(row.GEIcon)?.AssetPathName === "string" ? String(object(row.GEIcon)!.AssetPathName) : undefined })) };
  }
  const effects: NativeEffectText[] = [];
  for (const row of records) {
    if (!Object.keys(row).every(key => effectFields.has(key))) return;
    const text = row.FlowLocText ?? row.EffectDesc ?? row.WeaponDesc;
    if (typeof text !== "string" || !text.trim()) return;
    effects.push({ text, title: typeof row.WeaponTitle === "string" && row.WeaponTitle.trim() ? row.WeaponTitle : undefined,
      equipped: row.bApplyOnCurrentEquipOnly === true });
  }
  return { kind: "effects", effects };
};
