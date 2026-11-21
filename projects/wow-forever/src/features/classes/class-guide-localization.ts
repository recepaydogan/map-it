export interface ClassGuideTextEdit {
  path: string[];
  source: string;
  sources?: string[];
  text: string;
}

// Only prose is replaceable. Identifiers, spell references, levels and build points remain canonical.
const PROSE_FIELDS = new Set(["overview", "summary", "note", "forever", "why", "playstyle", "title", "notes", "battlegrounds", "world"]);
const PROSE_LISTS = new Set(["tips", "stats", "order"]);

export function applyClassGuideText<T>(data: T, edits: ClassGuideTextEdit[]): T {
  const output = structuredClone(data);
  const seen = new Set<string>();
  for (const edit of edits) {
    const path = edit.path;
    if (!Array.isArray(path) || path.length < 2 || path.some((part) => ["__proto__", "prototype", "constructor"].includes(part))) {
      throw new Error("Invalid class guide translation path");
    }
    const last = path.at(-1)!;
    const parent = path.at(-2)!;
    const isRoleDescription = path.length === 5 && path[0] === "play" && path[1] === "specs"
      && ["pve", "pvp"].includes(path[3]) && last === "role";
    const allowed = isRoleDescription || PROSE_FIELDS.has(last) || /^\d+$/.test(last) && PROSE_LISTS.has(parent)
      || path[0] === "stats" || parent === "why";
    const signature = JSON.stringify(path);
    if (!allowed || seen.has(signature) || typeof edit.text !== "string" || !edit.text.trim()) {
      throw new Error("Invalid class guide prose replacement: " + signature);
    }
    seen.add(signature);
    let node: unknown = output;
    for (const part of path.slice(0, -1)) {
      if (!node || typeof node !== "object" || !Object.hasOwn(node, part)) throw new Error("Unknown class guide path: " + signature);
      node = (node as Record<string, unknown>)[part];
    }
    if (!node || typeof node !== "object" || !Object.hasOwn(node, last) ||
      (typeof edit.source !== "string" || ((node as Record<string, unknown>)[last] !== edit.source &&
        !edit.sources?.includes((node as Record<string, unknown>)[last] as string)))) {
      throw new Error("Stale class guide translation: " + signature);
    }
    (node as Record<string, unknown>)[last] = edit.text;
  }
  return output;
}
