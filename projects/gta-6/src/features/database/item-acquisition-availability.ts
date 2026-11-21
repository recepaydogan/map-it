import type { ItemAcquisition } from "./item-database-types";

export const hasItemAcquisitionSources = (acquisition: ItemAcquisition | null) =>
  Boolean(acquisition && Object.values(acquisition).some((sources) => sources.length > 0));
