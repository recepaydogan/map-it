const value = (attribute) => attribute?.value;
const identifier = (attribute) => typeof value(attribute) === "string" ? value(attribute).toLowerCase() : "";

// Undefined means inherited; an authored empty action list clears the earlier list.
export const readNativeTeleportActions = (object, sourcePath) => {
  if (!Object.hasOwn(object, "OnUsePeaceActions")) return undefined;
  return (object.OnUsePeaceActions ?? []).flatMap((group, groupIndex) => (group.Action ?? []).flatMap((action, actionIndex) => {
    if (value(action.ActionType) !== 3) return [];
    return (action.Attributes ?? []).map((attributes, attributesIndex) => ({
      sourceId: identifier(attributes.Source),
      targetId: identifier(attributes.Target),
      sourceType: value(attributes.SourceType),
      targetType: value(attributes.Type),
      conditions: value(attributes.Conditions) ?? "",
      eventId: value(attributes.EventID) ?? "",
      blockMapMarkerNavigation: value(attributes.BlockMapMarkerNavigation) ?? false,
      snapToGround: value(attributes.SnapToGround),
      provenance: { sourcePath, groupIndex, actionIndex, attributesIndex },
    }));
  }));
};

const finitePosition = (position) => position && [position.x, position.y, position.z].every(Number.isFinite);
const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
const referenceMatchesType = (record, type) => type === 1 ? record?.type === "item" : type === 2 ? record?.type === "trigger" : false;

// This is an exact action/target join, not a nearest-door fallback. Geometry only
// corroborates the source object's action against an existing native AI route.
export const resolveActionNavigationPortal = (record, recordsById, portals, relatedLevels) => {
  if (!recordsById || !finitePosition(record.position) || record.navigationDestination) return null;
  const actions = (record.teleportActions ?? []).filter((action) => !action.blockMapMarkerNavigation);
  // A single portal profile cannot represent alternate action destinations.
  if (new Set(actions.map((action) => action.targetId)).size !== 1) return null;
  const matches = [];
  for (const action of actions) {
    if (!action.sourceId || !action.targetId) continue;
    const source = recordsById.get(action.sourceId), target = recordsById.get(action.targetId);
    if (!referenceMatchesType(source, action.sourceType) || !referenceMatchesType(target, action.targetType)
      || !finitePosition(source.position) || !finitePosition(target.position)) continue;
    if (action.sourceType === 1 && action.sourceId !== record.id) continue;
    if (!relatedLevels(record.level, source.level) || distance(record.position, source.position) >= 10) continue;
    for (const portal of portals) {
      if (portal.module !== record.module || !relatedLevels(portal.sourceWorldLevel ?? portal.level, record.level)
        || !relatedLevels(portal.targetWorldLevel ?? portal.level, target.level)) continue;
      const sourceTolerance = action.sourceType === 2 ? 0.01 : 10;
      if (distance(portal.sourcePosition, source.position) >= sourceTolerance
        || distance(portal.targetPosition, target.position) >= 0.01) continue;
      matches.push({ portal, action, source, target });
    }
  }
  const identities = new Set(matches.map(({ portal }) => portal.instanceId));
  if (identities.size !== 1) return null;
  const [match] = matches;
  return {
    ...match.portal,
    actionBinding: {
      kind: "native-teleport-action",
      objectId: record.id,
      actions: matches.map(({ action, source, target }) => ({ ...action,
        source: { id: source.id, level: source.level, position: source.position },
        target: { id: target.id, level: target.level, position: target.position },
      })),
    },
  };
};
