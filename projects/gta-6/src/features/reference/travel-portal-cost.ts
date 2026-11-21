import type { ReferenceEntry } from "./reference-types";

export const hasNoPortalCurrencyCost = (entry: ReferenceEntry) =>
  entry.travel?.kind === "portal"
  && entry.portalRequirements?.RequireType === "EMonetaryType::None"
  && entry.portalRequirements?.RequireCount === 0
  && entry.portalRequirements?.RequireValues.length === 0;
