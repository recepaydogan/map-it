/**
 * Climbable objects in the extracted placement data encode their height in the
 * object name: `_4n5H` reads 4.5 m, `_9H` reads 9 m. Returns metres, or
 * undefined when the name carries no height.
 */
export const getClimbHeight = (internalName?: string) => {
  const match = internalName?.match(/_(\d+)(?:n(\d+))?H(?:_|$)/);
  if (!match) return undefined;
  return Number(`${match[1]}.${match[2] ?? "0"}`);
};
