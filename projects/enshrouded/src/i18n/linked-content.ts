interface TextLink { label: string }

function findMatches<T extends TextLink>(value: string, links: readonly T[]) {
  const lower = value.toLocaleLowerCase("en");
  const candidates = links.flatMap((link, index) => {
    const start = lower.indexOf(link.label.toLocaleLowerCase("en"));
    return start < 0 || !link.label ? [] : [{ link, index, start, end: start + link.label.length }];
  }).sort((a, b) => a.start - b.start || b.link.label.length - a.link.label.length);
  let cursor = 0;
  return candidates.filter(match => {
    if (match.start < cursor) return false;
    cursor = match.end;
    return true;
  });
}

/** Inflected official names may no longer contain their nominative label.
 * Preserve those source actions as adjacent links rather than losing them. */
export function layoutLinkedContent<T extends TextLink>(source: string, sourceLinks: readonly T[],
  translated: string, translatedLinks: readonly T[]) {
  const matches = findMatches(translated, translatedLinks);
  const rendered = new Set(matches.map(match => match.index));
  const supplemental = findMatches(source, sourceLinks).filter(match => !rendered.has(match.index))
    .map(match => ({ index: match.index, link: translatedLinks[match.index] }));
  return { matches, supplemental };
}
