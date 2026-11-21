/** Prefer the complete spell text; use aura text only when it is the sole description. */
export function getSpellDescription(description?: string, auraDescription?: string): string {
  return description?.trim() || auraDescription?.trim() || "";
}
