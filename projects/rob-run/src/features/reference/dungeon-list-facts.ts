import type { ReferenceSummary } from "./reference-types";

export const dungeonListFacts = ({ adventure }: ReferenceSummary) => ({
  region: adventure?.region,
  groupSize: adventure?.partySize ?? (adventure?.kind === "party" ? 5 : undefined),
});
