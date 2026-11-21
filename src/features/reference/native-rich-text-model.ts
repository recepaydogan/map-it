export interface NativeGlyph { icon: string; width: number; height: number; key?: string; labelKey?: string }
export interface NativeTextData {
  actions: Record<string, { label: string; glyphs: NativeGlyph[] }>;
  values: Record<string, string | number>;
  images: Record<string, NativeGlyph>;
  particles: Record<string, NativeGlyph>;
  stats: Record<string, string>;
  weaponTypes: Record<string, string>;
}
export type NativeTextToken = { kind: "text"; text: string; tone?: "number" | "emphasis" }
  | { kind: "input" | "value" | "image" | "particle"; id: string; direction?: string };

/** Parse presentation markup as data; never pass game text to an HTML interpreter. */
export const parseNativeRichText = (value: string): NativeTextToken[] => {
  const result: NativeTextToken[] = [];
  const tones: ("number" | "emphasis")[] = [];
  let cursor = 0;
  const text = (value: string) => { if (value) result.push({ kind: "text", text: value, tone: tones.at(-1) }); };
  for (const match of value.matchAll(/<([^<>]*)>/g)) {
    text(value.slice(cursor, match.index));
    const body = match[1].trim();
    const name = body.match(/^\w+/)?.[0];
    const attrs = Object.fromEntries([...body.matchAll(/(\w+)="([^"]*)"/g)].map(attr => [attr[1], attr[2]]));
    if (name === "InputAction") result.push({ kind: "input", id: attrs.id ?? "", direction: attrs.dir });
    else if (name === "dtv") result.push({ kind: "value", id: attrs.id ?? "" });
    else if (name === "img") result.push({ kind: "image", id: attrs.id ?? "" });
    else if (name === "Niagara") result.push({ kind: "particle", id: attrs.id ?? "" });
    else if (name?.toLowerCase() === "br") text("\n");
    else if (body.startsWith("/")) tones.pop();
    else if (name === "WeaponDes_Num_Green") tones.push("number");
    else if (name === "Character_Yellow_Decorator2" || name === "WeaponDes_Main_Green") tones.push("emphasis");
    cursor = match.index! + match[0].length;
  }
  text(value.slice(cursor));
  return result;
};
