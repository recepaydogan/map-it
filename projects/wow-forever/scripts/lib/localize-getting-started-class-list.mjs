/** Assemble translated class descriptions while preserving every guide link. */
export function localizeGettingStartedClassList(originalSection, descriptions) {
  const list = originalSection.match(/<ul>([\s\S]*?)<\/ul>/)?.[1];
  const entries = [...(list ?? "").matchAll(/<li>([\s\S]*?)<\/li>/g)];
  if (entries.length !== 9 || descriptions?.length !== 9) {
    throw new Error("Getting-started class descriptions must have nine entries");
  }
  return `<ul>${entries.map(([, original], classIndex) => {
    const links = [...original.matchAll(/<a\b[^>]*\bdata-guide-link="[^"]+"[^>]*>[^<]*<\/a>/g)]
      .map(([anchor]) => anchor);
    const translated = descriptions[classIndex];
    const placeholders = [...translated.matchAll(/\{\{(\d+)\}\}/g)].map(([, index]) => Number(index));
    if (JSON.stringify(placeholders) !== JSON.stringify(links.map((_, index) => index))) {
      throw new Error(`Getting-started class ${classIndex} links changed`);
    }
    return `<li>${translated.replace(/\{\{(\d+)\}\}/g, (_, index) => links[Number(index)])}</li>`;
  }).join("")}</ul>`;
}
