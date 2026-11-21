import { useGameText } from "../../i18n/game-text";
import { layoutLinkedContent } from "../../i18n/linked-content";
import type { ReactNode } from "react";

export interface InlineTextLink { label: string; onClick?: () => void }

export default function InlineLinkedText({ value, links }: { value: string; links: InlineTextLink[] }) {
  const contentText = useGameText();
  const source = value;
  const sourceLinks = links;
  value = contentText(value);
  links = links.map(link => ({ ...link, label: contentText(link.label) }));
  const { matches, supplemental } = layoutLinkedContent(source, sourceLinks, value, links);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const { link, index, start } of matches) {
    if (start < cursor) continue;
    parts.push(value.slice(cursor, start).replace(/\s+([,.!?;:])/g, "$1"));
    const label = value.slice(start, start + link.label.length);
    parts.push(link.onClick ? <button key={`${index}:${start}`} type="button" onClick={link.onClick}
      className="inline cursor-pointer text-left text-accent underline decoration-accent/60 underline-offset-2 hover:text-white hover:decoration-current focus-visible:outline-2 focus-visible:outline-accent">
      {label}</button> : label);
    cursor = start + link.label.length;
  }
  parts.push(value.slice(cursor).replace(/\s+([,.!?;:])/g, "$1"));
  const extraLinks = supplemental.filter(({ link }) => link.onClick);
  if (extraLinks.length) parts.push(<span key="related-links" className="ml-1 inline-flex flex-wrap gap-x-2 gap-y-1">
    {extraLinks.map(({ link, index }) => <button key={index} type="button" onClick={link.onClick}
      className="inline cursor-pointer text-left text-accent underline decoration-accent/60 underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
      {link.label}</button>)}
  </span>);
  return <>{parts}</>;
}
