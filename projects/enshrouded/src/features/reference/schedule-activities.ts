import type { ReferenceEntry } from "./reference-types";

export const scheduleActivities = (entry: ReferenceEntry) => entry.sections
  .find((section) => section.title === "reference.labels.activities")?.links ?? [];
