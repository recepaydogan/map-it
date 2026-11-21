import { useGameText } from "../../i18n/game-text";
import { plainWikiTables } from "../../i18n/wiki-table-text";
import type { ReactNode } from "react";
import { hasEnshroudedEntry, type EnshroudedEntryTarget } from "./enshrouded-entry-data";
import { VALID_ENSHROUDED_MARKER_IDS } from "./enshrouded-marker-ids";

const tokenPattern = /(\{\{[^{}]*\}\}|\[\[[^\]]*\]\])/g;
const linkClass = "inline align-baseline font-medium text-zinc-100 underline decoration-zinc-500/70 underline-offset-2 hover:text-accent";

export default function EnshroudedWikiProse({ text, name, onOpenEntry, onOpenMap }: {
  text: string;
  name: string;
  onOpenEntry: (target: EnshroudedEntryTarget) => void;
  onOpenMap: (markerId: string) => void;
}) {
  const contentText = useGameText();
  const clean = plainWikiTables(contentText(text)).replace(/\[\[File:[^\]]*\]\]/gi, "")
    .replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]*>/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1").replace(/\s+/g, " ").trim();
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of clean.matchAll(tokenPattern)) {
    const start = match.index;
    if (start > cursor) nodes.push(clean.slice(cursor, start));
    const token = match[0];
    const fields = token.slice(2, -2).split("|").map((value) => value.trim());
    const template = fields[0].toLocaleLowerCase("en");
    const positional = fields.slice(1).filter((field) => field && !/^[\w -]+=/.test(field));
    let label = "";
    let target: EnshroudedEntryTarget | null = null;
    let markerId: string | null = null;
    if (token.startsWith("[[")) {
      label = fields.at(-1) ?? "";
      target = { page: fields[0] };
    } else if (template === "maplink") {
      markerId = positional[0] ?? null;
      label = positional.at(-1) ?? markerId ?? "";
    } else if (template === "pagename" || template === "subpagename") {
      label = name;
    } else if (template.startsWith("quest+")) {
      label = positional[0] ?? "";
      target = { page: `Quests/${label}`, catalog: "progression" };
    } else if (template.startsWith("item+")) {
      label = positional[0] ?? "";
      target = { page: label };
    } else if (!template.startsWith("dataquery/") && !template.includes("infobox")) {
      label = positional.at(-1) ?? "";
    }
    if (markerId && VALID_ENSHROUDED_MARKER_IDS.has(markerId)) {
      nodes.push(<button key={start} type="button" className={linkClass}
        onClick={() => onOpenMap(markerId)}>{contentText(label)}</button>);
    } else if (target && hasEnshroudedEntry(target)) {
      nodes.push(<button key={start} type="button" className={linkClass}
        onClick={() => onOpenEntry(target)}>{contentText(label)}</button>);
    } else if (label) nodes.push(contentText(label));
    cursor = start + token.length;
  }
  if (cursor < clean.length) nodes.push(clean.slice(cursor));
  return <>{nodes}</>;
}
