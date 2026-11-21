const maximumGap = 120;
const retiredSourceIds = { "waink-curiosity-036": "waink-landmark-029" };
const aliasId = id => `leonida-${id}`;
const byIdentity = value => value.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "")
  .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
  .replace(/\bpolice department\b/g, "police station")
  .replace(/\bfire department\b/g, "fire station");
const coords = row => row.landmark.gameCoordinates;
const gap = (from, to) => Math.hypot(from.x - to.x, from.y - to.y);
const named = row => row.landmark.nameStatus !== "unknown" && !row.areaLabel && coords(row);

function isPlacedSourceMarker({ id, name, x, y }, bounds) {
  return typeof id === "string" && /^[a-z0-9-]+$/.test(id) &&
    typeof name === "string" && Boolean(name.trim()) && !/[?<>]/.test(name) &&
    Number.isFinite(x) && Number.isFinite(y) && x >= bounds.minX && x <= bounds.maxX &&
    -y >= bounds.minY && -y <= bounds.maxY;
}

function uniqueIdentityCandidate(marker, names) {
  const candidates = (names.get(byIdentity(marker.name)) ?? [])
    .map(point => ({ point, distance: gap(marker, coords(point)) }))
    .sort((a, b) => a.distance - b.distance);
  const first = candidates[0];
  if (!first || first.distance > maximumGap || (candidates[1] && candidates[1].distance - first.distance < 25)) return null;
  return first.point;
}

/** Source IDs are durable aliases, so saved places can follow a primary-source match in future imports. */
export function mergeMapMarkerSources(curated, snapshot, reviewedMatches, bounds) {
  const names = new Map();
  const primaryById = new Map();
  for (const point of curated.records) {
    if (!/^L\d+$/.test(point.landmark.id)) throw new Error(`Non-GTADB marker in curated records: ${point.id}`);
    primaryById.set(point.landmark.id, point);
    for (const id of point.memberIds) primaryById.set(id.replace(/^leonida-/, "").toUpperCase(), point);
    if (!named(point)) continue;
    const name = byIdentity(point.name);
    if (!names.has(name)) names.set(name, []);
    names.get(name).push(point);
  }
  const records = new Map(curated.records.map(point => [point.id, point]));
  const aliases = { ...curated.aliases };
  const comparisons = [];
  const attachments = [];
  const candidatesByPrimary = new Map();
  for (const marker of snapshot.records) {
    if (!isPlacedSourceMarker(marker, bounds) || reviewedMatches[marker.id]) continue;
    const point = uniqueIdentityCandidate(marker, names);
    if (!point) continue;
    const candidates = candidatesByPrimary.get(point.id) ?? [];
    candidates.push({ point, id: marker.id, distance: gap(marker, coords(point)) });
    candidatesByPrimary.set(point.id, candidates);
  }
  const resolved = new Map();
  const reviewedPrimary = new Set(Object.values(reviewedMatches).map(id => primaryById.get(id)?.id));
  for (const [id, candidates] of candidatesByPrimary) {
    if (reviewedPrimary.has(id)) continue;
    candidates.sort((left, right) => left.distance - right.distance);
    // Two almost equally close branches need identity evidence before they can replace a pin.
    if (!candidates[1] || candidates[1].distance - candidates[0].distance >= 25) {
      resolved.set(candidates[0].id, candidates[0].point);
    }
  }
  for (const marker of snapshot.records) {
    const { id, name, category: sourceCategory, x, y } = marker;
    if (!isPlacedSourceMarker(marker, bounds)) {
      comparisons.push({ id, name, status: "invalid-or-unnamed" });
      continue;
    }
    const input = { id, name, category: sourceCategory, coordinates: { x, y } };
    const reviewed = primaryById.get(reviewedMatches[id]);
    const match = reviewed ?? resolved.get(id);
    const supplementalId = aliasId(id);
    if (match) {
      const previous = records.get(match.id);
      const members = [...new Set([...previous.memberIds, supplementalId])];
      const nextAliases = members.filter(key => key !== match.id);
      records.set(match.id, { ...previous, memberIds: members, aliasIds: nextAliases });
      for (const key of nextAliases) aliases[key] = match.id;
      attachments.push({ marker, targetId: match.id });
      comparisons.push({ ...input, status: reviewed ? "matched-reviewed" : "matched-identity", canonicalId: match.id,
        primarySourceId: match.landmark.id, primaryName: match.name, primaryCoordinates: coords(match),
        distance: coords(match) ? Math.round(gap(marker, coords(match))) : null });
      continue;
    }
    const candidates = (names.get(byIdentity(name)) ?? [])
      .map(point => ({ id: point.landmark.id, coordinates: coords(point), distance: Math.round(gap(marker, coords(point))) }))
      .sort((a, b) => a.distance - b.distance).slice(0, 3);
    comparisons.push({ ...input, status: "secondary-only",
      ...(candidates.length ? { candidates } : {}) });
  }
  const activeSourceIds = new Set(snapshot.records.map(marker => marker.id));
  for (const [retiredId, replacementId] of Object.entries(retiredSourceIds)) {
    const oldId = aliasId(retiredId);
    const replacement = aliasId(replacementId);
    const point = records.get(aliases[replacement] ?? replacement);
    if (activeSourceIds.has(retiredId) || !point) continue;
    records.set(point.id, { ...point, memberIds: [...point.memberIds, oldId], aliasIds: [...point.aliasIds, oldId] });
    aliases[oldId] = point.id;
  }
  return { records, aliases, comparisons, attachments };
}

