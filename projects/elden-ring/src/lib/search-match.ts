/**
 * How every search box in the app decides whether a name answers a query.
 *
 * Players type names the way they say them, not the way the game punctuates
 * them: "manbat" for Man-Bat, "godricks" for Godrick's, "smithing stone 1" for
 * "Smithing Stone [1]". A plain substring test fails all three and the result is
 * an empty list for a thing that is obviously there — so matching runs on TWO
 * forms of the text:
 *
 *  • folded — lowercased, accents stripped: how it's spelled;
 *  • squashed — folded with every separator removed: how it's said.
 *
 * A squashed hit is a real hit, just a looser one, so it scores half a step
 * behind its literal equivalent. That keeps exact spellings on top without ever
 * hiding a match behind a hyphen.
 */

export const foldText = (value: string): string =>
  value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/** Letters and digits only — no spaces, hyphens, apostrophes or brackets. */
export const squashText = (value: string): string =>
  foldText(value).replace(/[^\p{L}\p{N}]+/gu, "");

/** No hit. Sorts last, and is what callers filter on. */
export const NO_MATCH = Number.MAX_SAFE_INTEGER;

/** A query prepared once per keystroke rather than per candidate — a catalog is
 *  thousands of names wide and this runs over all of them. */
export interface SearchQuery {
  folded: string;
  squashed: string;
  /** Nothing typed (or nothing but punctuation): every caller treats this as
   *  "no query", never as "matches nothing". */
  empty: boolean;
}

export const searchQuery = (raw: string): SearchQuery => {
  const folded = foldText(raw.trim());
  const squashed = squashText(raw);
  return { folded, squashed, empty: folded.length === 0 };
};

/** Exact hit, then any word start, then anywhere — so "bat" can't bury "Man-Bat",
 *  and a mid-name word start ranks WITH the prefix hits ("radahn" must reach
 *  "Starscourge Radahn", not lose to every mob whose name leads with it). */
const rank = (value: string, needle: string): number => {
  if (value === needle) return 0;
  if (value.startsWith(needle) || value.includes(` ${needle}`)) return 1;
  if (value.includes(needle)) return 2;
  return NO_MATCH;
};

/**
 * How well `value` answers `query` — lower is better, NO_MATCH means it doesn't.
 * Safe to call with an undefined value (an absent name is simply no match).
 */
export const matchScore = (value: string | undefined, query: SearchQuery): number => {
  if (!value || query.empty) return NO_MATCH;
  const literal = rank(foldText(value), query.folded);
  if (literal !== NO_MATCH) return literal;
  // Separator-blind second pass. Its ranks interleave with the literal ones
  // (1.5 beats a literal "anywhere" hit at 2) — a word-start match is a better
  // answer than a mid-word one however the name happens to be punctuated.
  if (!query.squashed) return NO_MATCH;
  const loose = rank(squashText(value), query.squashed);
  return loose === NO_MATCH ? NO_MATCH : loose + 0.5;
};

/** The best score across several names for the same thing — a localized name and
 *  the English original, say, so a query in either language finds it. */
export const bestMatchScore = (
  values: (string | undefined)[],
  query: SearchQuery,
): number => values.reduce((best, value) => Math.min(best, matchScore(value, query)), NO_MATCH);

/* ──────────────────────────────────────────────────────────────────────────
 * Typos
 *
 * "radhan" is Radahn with two letters swapped, and every test above says no.
 * This tier says yes — approximate matching over the optimal string alignment
 * distance (Damerau-Levenshtein with adjacent transpositions), which is what
 * makes a swap cost ONE edit rather than two.
 *
 * It is deliberately a RESCUE, not a ranking tier: callers only reach for it
 * when the strict passes found nothing at all. That keeps it off the hot path
 * (a typo pass over thousands of names runs at most once per dead-end query)
 * and, more importantly, keeps near-misses from ever diluting a query that
 * already had real answers.
 * ──────────────────────────────────────────────────────────────────────── */

/** Shorter than this, a typo is indistinguishable from a different word — below
 *  three letters one edit reaches most of the alphabet. */
const MIN_FUZZY_LENGTH = 3;

/** Sorts behind every strict tier, including a region-only hit. */
const FUZZY_BASE = 4;

/**
 * One typo in a short word, two once there's enough word to be sure.
 *
 * Two is needed sooner than it looks: "renalla" for Rennala is a doubled letter
 * in the wrong place, which costs two edits at seven characters. The looseness
 * is safe because this whole tier only runs when nothing matched — a few near
 * misses beat an empty list, and a query with real answers never gets here.
 */
const typoBudget = (length: number): number => (length >= 7 ? 2 : 1);

/**
 * Edit distance from the query to the nearest PREFIX of `a` (the whole word
 * included), capped: returns `max + 1` the moment it's certain every prefix
 * exceeds `max`. Prefixes, because a search runs while the player is still
 * typing — "radh" must already be one edit from Radahn's "rada", not two from
 * the finished word. The cap is what makes this affordable: most candidates
 * are rejected on the length check alone, and the rest bail out within a row
 * or two.
 */
const boundedPrefixDistance = (a: string, b: string, max: number): number => {
  const al = a.length;
  const bl = b.length;
  // A prefix can always be SHORTER than the query needs — only a word that is
  // too short in its entirety is hopeless on length alone.
  if (bl - al > max) return max + 1;
  if (al === 0 || bl === 0) return Math.max(al, bl) > max ? max + 1 : Math.max(al, bl);

  let beforePrevious = new Array<number>(bl + 1).fill(0);
  let previous = new Array<number>(bl + 1);
  let current = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j += 1) previous[j] = j;

  let best = bl > max ? max + 1 : bl; // the empty prefix: delete the whole query
  for (let i = 1; i <= al; i += 1) {
    current[0] = i;
    let rowBest = i;
    for (let j = 1; j <= bl; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        previous[j] + 1, // deletion
        current[j - 1] + 1, // insertion
        previous[j - 1] + cost, // substitution
      );
      // The transposition: what makes "radhan" one edit from "radahn".
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, beforePrevious[j - 2] + 1);
      }
      current[j] = value;
      if (value < rowBest) rowBest = value;
    }
    // This row's last cell is the distance to the prefix a[0..i] — the best of
    // those, over every row, is the answer.
    if (current[bl] < best) best = current[bl];
    // Every longer prefix can only cost more once the whole row is over budget.
    if (rowBest > max) break;
    const spare = beforePrevious;
    beforePrevious = previous;
    previous = current;
    current = spare;
  }

  return Math.min(best, max + 1);
};

const wordsOf = (value: string): string[] =>
  foldText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * How close `value` comes to `query` allowing for typos — NO_MATCH if it isn't
 * close. Compared word by word (so "radhan" reaches "Starscourge Radahn") and
 * against the whole run-together name (so a typo in a multi-word query still
 * lands). Prefix-based on both, so a HALF-TYPED query with a typo in it already
 * matches: "radh" is one edit from Radahn's "rada".
 */
export const fuzzyScore = (value: string | undefined, query: SearchQuery): number => {
  const needle = query.squashed;
  if (!value || needle.length < MIN_FUZZY_LENGTH) return NO_MATCH;

  const max = typoBudget(needle.length);
  let best = max + 1;
  for (const word of wordsOf(value)) {
    const distance = boundedPrefixDistance(word, needle, max);
    if (distance < best) best = distance;
    if (best === 0) break;
  }
  if (best > max) {
    best = boundedPrefixDistance(squashText(value), needle, max);
  }
  return best > max ? NO_MATCH : FUZZY_BASE + best;
};

/** fuzzyScore across several names for the same thing. */
export const bestFuzzyScore = (
  values: (string | undefined)[],
  query: SearchQuery,
): number => values.reduce((best, value) => Math.min(best, fuzzyScore(value, query)), NO_MATCH);
