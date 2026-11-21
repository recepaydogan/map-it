const COORDINATE_PATTERN = /posX\s*=\s*(-?\d+)\s*,\s*posY\s*=\s*(-?\d+)\s*,\s*posZ\s*=\s*(-?\d+)/g;

const humanizeIdentifier = (value) => value
  .replace(/[_-]+/g, " ")
  .replace(/([a-z\d])([A-Z])/g, "$1 $2")
  .replace(/\b\w/g, (character) => character.toUpperCase());

const normalizeIdentifier = (value) => value.replace(/[^a-z0-9]/gi, "").toLowerCase();

const findBalancedEnd = (source, start, openCharacter, closeCharacter) => {
  let depth = 0;
  let quote = null;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === openCharacter) depth += 1;
    if (character === closeCharacter) depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
};

const parseCoordinates = (source) => [...source.matchAll(COORDINATE_PATTERN)].map((match) => ({
  x: Number(match[1]),
  y: Number(match[2]),
  z: Number(match[3]),
}));

const parseLocalGroups = (source) => {
  const groups = new Map();
  const pattern = /local\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const tableStart = source.indexOf("{", match.index);
    const tableEnd = findBalancedEnd(source, tableStart, "{", "}");
    if (tableEnd < 0) continue;
    groups.set(match[1], parseCoordinates(source.slice(tableStart, tableEnd + 1)));
    pattern.lastIndex = tableEnd + 1;
  }
  return groups;
};

const parseTopLevelAssignments = (source) => {
  const assignments = [];
  let index = 0;
  while (index < source.length) {
    while (index < source.length && /[\s,]/.test(source[index])) index += 1;
    const keyMatch = source.slice(index).match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    if (!keyMatch) {
      index += 1;
      continue;
    }
    const key = keyMatch[1];
    index += key.length;
    while (/\s/.test(source[index] ?? "")) index += 1;
    if (source[index] !== "=") continue;
    index += 1;
    const valueStart = index;
    let braceDepth = 0;
    let parenthesisDepth = 0;
    let quote = null;
    for (; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (character === "\\") index += 1;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'") quote = character;
      else if (character === "{") braceDepth += 1;
      else if (character === "}") braceDepth -= 1;
      else if (character === "(") parenthesisDepth += 1;
      else if (character === ")") parenthesisDepth -= 1;
      else if (character === "," && braceDepth === 0 && parenthesisDepth === 0) break;
    }
    assignments.push([key, source.slice(valueStart, index).trim()]);
    index += 1;
  }
  return assignments;
};

const getReturnTable = (source) => {
  const match = /return\s*\{/g;
  let latest = null;
  for (const candidate of source.matchAll(match)) latest = candidate;
  if (!latest) return "";
  const start = source.indexOf("{", latest.index);
  const end = findBalancedEnd(source, start, "{", "}");
  return end < 0 ? "" : source.slice(start + 1, end);
};

const resolveSpawnExpression = (expression, groups) => {
  if (expression.startsWith("{")) return parseCoordinates(expression);
  const identifiers = expression.startsWith("mergeTable")
    ? [...expression.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].map(([identifier]) => identifier).slice(1)
    : [expression.match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0]].filter(Boolean);
  return identifiers.flatMap((identifier) => groups.get(identifier) ?? []);
};

const getProfessionLabels = (translations) => {
  const labels = new Map();
  for (const [key, label] of Object.entries(translations)) {
    if (!key.startsWith("UI_prof_") || key.startsWith("UI_profdesc_") || typeof label !== "string") continue;
    labels.set(normalizeIdentifier(key.slice("UI_prof_".length)), label);
  }
  return labels;
};

const getProfessionLabel = (profession, labels) => {
  const normalized = normalizeIdentifier(profession);
  const alias = normalized === "policeofficer"
    ? "policeoff"
    : normalized === "fireofficer" ? "fireoff" : normalized;
  return labels.get(alias) ?? labels.get(normalized) ?? humanizeIdentifier(profession);
};

export const parseSpawnPointSource = (source) => {
  const groups = parseLocalGroups(source);
  const points = new Map();
  for (const [profession, expression] of parseTopLevelAssignments(getReturnTable(source))) {
    for (const coordinate of resolveSpawnExpression(expression, groups)) {
      const key = `${coordinate.x}:${coordinate.y}:${coordinate.z}`;
      const point = points.get(key) ?? { ...coordinate, professions: new Set() };
      point.professions.add(profession);
      points.set(key, point);
    }
  }
  return [...points.values()].map(({ professions, ...coordinate }) => ({
    ...coordinate,
    professions: [...professions].sort(),
  }));
};

export const buildMapSpawnData = (sources, translations) => {
  const points = [];
  for (const source of sources) {
    for (const point of parseSpawnPointSource(source.content)) {
      points.push({
        ...point,
        id: `${source.townId}-${point.x}-${point.y}-${point.z}`,
        townId: source.townId,
        town: source.town,
      });
    }
  }
  const labels = getProfessionLabels(translations);
  const professionIds = [...new Set(points.flatMap(({ professions }) => professions))];
  const professions = professionIds.map((id) => ({
    id,
    label: getProfessionLabel(id, labels),
    pointCount: points.filter((point) => point.professions.includes(id)).length,
  })).sort((left, right) => left.label.localeCompare(right.label));
  return {
    points: points.sort((left, right) => left.town.localeCompare(right.town) || left.y - right.y || left.x - right.x),
    professions,
    totalPoints: points.length,
    totalTowns: new Set(points.map(({ townId }) => townId)).size,
  };
};
