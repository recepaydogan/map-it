const positionFields = ["module", "level", "position", "authoredLevel", "sourcePosition",
  "positionTransform", "templateProjection", "positionSuppressed"];

// A position and its coordinate provenance are one unit. Absent anchor fields
// must clear the previous placement's fields, not leave a mixed transform chain.
export const placementAtAnchor = (record, anchor) => ({
  ...record,
  ...Object.fromEntries(positionFields.map((key) => [key, anchor[key]])),
});
