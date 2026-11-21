const value = (attribute) => attribute?.value;
const ITEM_TYPES = new Set(["Armor", "Weapon", "Object"]);

// A template's inherited defaults and a stat-generated instance can have the
// same model/name but different gameplay. Keep both identities; never replace
// every placed use of a root with the stats of one treasure-table entry.
export const collectItemTemplateVariants = ({ stats, rawTemplates, resolvedTemplates, statOverrides = [], identityOverrides = [], equipmentReferences = [] }) => {
  const variants = [];
  for (const [templateId] of rawTemplates) {
    const template = resolvedTemplates.get(templateId);
    if (value(template?.Type) !== "item") continue;
    const statsId = value(template.Stats);
    if (!ITEM_TYPES.has(stats.get(statsId)?.type)) continue;
    variants.push({ id: templateId, templateId, statsId });
  }
  for (const stat of stats.values()) {
    if (!ITEM_TYPES.has(stat.type) || !stat.declaredRootTemplate) continue;
    const templateId = stat.data.RootTemplate?.toLowerCase();
    const template = resolvedTemplates.get(templateId);
    if (value(template?.Type) !== "item" || !rawTemplates.has(templateId)) continue;
    const templateStatsId = value(template.Stats);
    if (templateStatsId === stat.id) continue;
    variants.push({ id: `${templateId}:stats:${stat.id}`, templateId, statsId: stat.id,
      generation: { rootTemplateId: templateId, templateStatsId, origin: "stat-root" } });
  }
  const ids = new Set(variants.map(({ id }) => id));
  for (const reference of equipmentReferences) {
    const stat = stats.get(reference.statsId);
    const templateId = stat?.data.RootTemplate?.toLowerCase();
    const template = resolvedTemplates.get(templateId);
    const templateStatsId = value(template?.Stats);
    const id = `${templateId}:stats:${reference.statsId}`;
    if (!ITEM_TYPES.has(stat?.type) || value(template?.Type) !== "item" || !rawTemplates.has(templateId)
      || templateStatsId === reference.statsId || ids.has(id)) continue;
    // A native equipment entry can generate a derived Stats instance even
    // when its root is inherited. Do not replace the template-default item.
    variants.push({ id, templateId, statsId: reference.statsId,
      generation: { rootTemplateId: templateId, templateStatsId, origin: "equipment-entry",
        sourcePath: reference.sourcePath, sourceLine: reference.sourceLine } });
    ids.add(id);
  }
  for (const override of statOverrides) {
    const { templateId, statsId, sourcePath, sourceObjectId } = override;
    const template = resolvedTemplates.get(templateId);
    const templateStatsId = value(template?.Stats);
    const id = `${templateId}:stats:${statsId}`;
    if (value(template?.Type) !== "item" || !ITEM_TYPES.has(stats.get(statsId)?.type)
      || templateStatsId === statsId || ids.has(id)) continue;
    variants.push({ id, templateId, statsId, generation: { rootTemplateId: templateId, templateStatsId,
      origin: "placed-override", sourcePath, sourceObjectId } });
    ids.add(id);
  }
  for (const override of identityOverrides) {
    const { templateId, sourcePath, sourceObjectId, attributes } = override;
    const template = resolvedTemplates.get(templateId), templateStatsId = value(template?.Stats);
    const statsId = override.statsId || templateStatsId;
    if (value(template?.Type) !== "item" || !rawTemplates.has(templateId) || !ITEM_TYPES.has(stats.get(statsId)?.type)) continue;
    variants.push({ id: `${templateId}:object:${sourceObjectId}`, templateId, statsId, attributes,
      generation: { rootTemplateId: templateId, templateStatsId, origin: "placed-identity", sourcePath, sourceObjectId } });
  }
  return variants;
};

// A known Stats identity constrains a known root. With no Stats evidence,
// template-only references keep using that template's authored defaults.
export const selectTemplateStatItems = (items, statsId) => statsId
  ? items.filter((item) => item.generation?.origin !== "placed-identity" && item.statsId === statsId)
  : items.filter((item) => !item.generation);
