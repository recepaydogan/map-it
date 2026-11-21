import type { SpellWriteup } from "./spell-writeups";

export interface SpellWriteupLocalePack {
  version: 1;
  language: string;
  values: string[];
}

export function applySpellWriteupText(writeup: SpellWriteup, translations: Record<string, string>): SpellWriteup {
  const translate = (source: string) => translations[source] || source;
  return {
    ...writeup,
    summary: translate(writeup.summary),
    details: writeup.details?.map(translate),
    forever: writeup.forever ? translate(writeup.forever) : undefined,
    useWhen: writeup.useWhen?.map(translate),
    avoidWhen: writeup.avoidWhen?.map(translate),
  };
}
