/** Lower interval selection to equivalent range choices before the density library parses it.
 * Its interval visitor loses its receiver and truncates the final (overflow) branch.
 */
export const normalizeDensityData = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalizeDensityData);
  if (!value || typeof value !== "object") return value;
  const node = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeDensityData(child)]));
  if (typeof node.type !== "string" || node.type.split(":").at(-1) !== "interval_select") return node;
  const { thresholds, functions, input } = node;
  if (!Array.isArray(thresholds) || !Array.isArray(functions) || functions.length !== thresholds.length + 1 ||
    thresholds.some((threshold, index) => typeof threshold !== "number" || !Number.isFinite(threshold) || (index > 0 && threshold <= thresholds[index - 1])))
    throw new Error("Invalid density interval branches");
  let result: unknown = functions.at(-1);
  for (let index = thresholds.length - 1; index >= 0; index--) result = {
    type: node.type.replace(/interval_select$/, "range_choice"), input, min_inclusive: -Number.MAX_VALUE,
    max_exclusive: thresholds[index], when_in_range: functions[index], when_out_of_range: result,
  };
  return result;
};
