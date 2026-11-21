import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "catalog", "mechanism-links.json"), "utf8"));
const mapsRoot = path.join(projectRoot, "public", "maps");
const entities = new Map();
const entitiesByInternalName = new Map();
const relationships = new Map();

assert.equal(catalog.stats.exactLinks, 55);
assert.equal(catalog.stats.exactEffects, 14);
assert.equal(catalog.stats.exactMovements, 17);
assert.equal(catalog.stats.movementObjects, 12);
assert.equal(catalog.stats.sequencePuzzles, 1);
assert.equal(catalog.stats.sequenceSteps, 3);
assert.equal(catalog.stats.mobileControllers, 4);
assert.equal(catalog.stats.mobileRoutes, 8);
assert.equal(catalog.stats.levers, 43);
assert.equal(catalog.stats.buttons, 6);
assert.equal(catalog.stats.trialObjects, 3);
assert.equal(catalog.stats.plaques, 3);

for (const directory of fs.readdirSync(mapsRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(mapsRoot, directory.name, "content.json");
  if (!fs.existsSync(contentPath)) continue;
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  for (const entity of Object.values(content.entities ?? {})) {
    if (!entity.mechanism) continue;
    entities.set(entity.id, entity);
    if (entity.internalName) {
      entitiesByInternalName.set(entity.internalName, [
        ...(entitiesByInternalName.get(entity.internalName) ?? []),
        entity,
      ]);
    }
  }
  for (const relationship of content.relationships ?? []) {
    if (relationship.kind === "controls") relationships.set(relationship.id, relationship);
  }
}

const resolved = catalog.links.filter(({ controller, target }) => entities.has(controller.id) && entities.has(target.id));
assert.equal(resolved.length, catalog.links.length, `Expected every fixed mechanism link to be mapped; received ${resolved.length}/${catalog.links.length}.`);
for (const link of resolved) {
  const controller = entities.get(link.controller.id).mechanism;
  const target = entities.get(link.target.id).mechanism;
  assert.equal(controller.role, "controller");
  assert.equal(target.role, "target");
  assert.ok(controller.related.some(({ contentId }) => contentId === link.target.id));
  assert.ok(target.related.some(({ contentId }) => contentId === link.controller.id));
  assert.deepEqual(relationships.get(link.id), {
    id: link.id,
    fromId: link.controller.id,
    toId: link.target.id,
    kind: "controls",
    confidence: "story-db-exact",
  });
}

const expectedMobileControllers = new Map([
  ["66e3c440-2f6b-8cd3-4860-e24e0548298d", "S_PLT_DEN_ElevatorLever"],
  ["893fcb67-a68d-4471-8dd5-28e66f907ae3", "S_CRE_ElevatorLever_000"],
  ["38c76a3f-beaf-417b-be7e-62773c705c8f", "S_COL_Elevator_Controller"],
  ["507b9737-25af-4600-aabb-8fc4fb3103af", "S_LOW_CargoDoor_ElevatorLever"],
]);
assert.equal(catalog.mobileControllers.length, expectedMobileControllers.size);
for (const mobileController of catalog.mobileControllers) {
  assert.equal(mobileController.mobility, "platform-attached");
  assert.equal(mobileController.routes.length, 2);
  assert.ok(expectedMobileControllers.has(mobileController.controller.id));
  assert.ok(mobileController.controller.token.startsWith(expectedMobileControllers.get(mobileController.controller.id)));
  assert.equal(entities.has(mobileController.controller.id), false, `Mobile controller ${mobileController.controller.id} must not be assigned a fabricated fixed marker.`);
  assert.deepEqual(new Set(mobileController.routes.map(({ action }) => action)), new Set(["moves-elevator-up", "moves-elevator-down"]));
}

const prisonerDoorId = "7b424243-b943-45d5-a985-af95d97ea702";
const prisonerLeverId = "e2cbb1ea-7f8e-467a-9736-ce5f5b696299";
assert.ok(entities.get(prisonerLeverId)?.mechanism.related.some(({ contentId }) => contentId === prisonerDoorId));

for (const [controllerId, targetId] of [
  ["41140570-efdb-44d0-8943-8ea29584dd42", "1c9609ee-fc96-4826-bac1-856a609564ac"],
  ["7c41cd46-c233-438c-ad5b-03d79cac9a44", "1c9609ee-fc96-4826-bac1-856a609564ac"],
  ["74f9b2b5-204c-4f8c-9fef-499c67ab3ac0", "641d6a8a-1376-4232-a65f-71e06d3b48dd"],
  ["4c8ad2ce-685a-4afc-9de2-e2f259f9b214", "641d6a8a-1376-4232-a65f-71e06d3b48dd"],
  ["88609209-1e67-4792-8606-155cc039d1bc", "0c7833f6-740c-47fb-b4a0-dec5eaa53cbd"],
  ["ba8e2225-2b2f-4722-bc7c-b57d12b56a1f", "0c7833f6-740c-47fb-b4a0-dec5eaa53cbd"],
]) {
  assert.ok(catalog.links.some(({ controller, target }) => controller.id === controllerId && target.id === targetId));
  assert.ok(entities.has(controllerId), `Missing mapped mechanism controller ${controllerId}.`);
  assert.ok(entities.has(targetId), `Missing mapped mechanism target ${targetId}.`);
  assert.ok(entities.get(controllerId).mechanism.related.some(({ contentId }) => contentId === targetId));
  assert.ok(entities.get(targetId).mechanism.related.some(({ contentId }) => contentId === controllerId));
}

const resolveEffectEntities = ({ object }) => {
  const exactEntity = entities.get(object.id);
  if (exactEntity) return [exactEntity];
  const internalName = object.token.replace(/_[0-9a-f-]{36}$/i, "");
  return entitiesByInternalName.get(internalName) ?? [];
};
const mappedEffects = catalog.effects.filter((effect) => resolveEffectEntities(effect).some(
  ({ mechanism }) => mechanism.effects?.some(({ effectId }) => effectId === effect.id),
));
assert.equal(mappedEffects.length, catalog.effects.length, `Expected every exact mechanism effect to be mapped; received ${mappedEffects.length}/${catalog.effects.length}.`);
for (const effect of mappedEffects) {
  assert.ok(
    resolveEffectEntities(effect).some(({ mechanism }) => mechanism.effects.some(
      ({ effectId, action }) => effectId === effect.id && action === effect.action,
    )),
    `Missing exact effect ${effect.id}.`,
  );
}

const aggressiveLeverId = "7dff92d1-6954-434a-a336-dd3933782314";
assert.ok(entities.get(aggressiveLeverId)?.mechanism.effects.some(({ action }) => action === "makes-captives-hostile"));

const mappedMovements = catalog.movements.filter(({ object, id }) => (
  entities.get(object.id)?.mechanism.movements?.some(({ movementId }) => movementId === id)
));
assert.deepEqual(mappedMovements.map(({ id }) => id).sort(), catalog.movements.map(({ id }) => id).sort(),
  "Every authored movement route is represented, including newly covered interiors.");
for (const movement of catalog.movements) {
  const profile = entities.get(movement.object.id).mechanism.movements.find(({ movementId }) => movementId === movement.id);
  assert.equal(profile.action, movement.action, `${movement.id} preserves the authored action`);
}
assert.equal(
  catalog.movements.filter(({ object }) => object.id === "14d518eb-69b7-482e-a09b-b10ab9dca0f2").length,
  3,
  "The rolling boulder must retain all three authored route stages.",
);
assert.ok(entities.get("c9b5f985-466d-41d4-88fd-adfa999aaeb1")?.mechanism.movements.some(
  ({ action }) => action === "traces-fire-surface-then-explodes",
));
assert.ok(entities.get("a7c7ffa0-a495-42c5-bcd1-fc1767d2affd")?.mechanism.movements.some(
  ({ action }) => action === "deploys-shortcut-ladder",
));

const [plaqueSequence] = catalog.sequences;
assert.deepEqual(plaqueSequence.steps.map(({ object }) => object.id), [
  "8c40d13b-28c0-4f6d-967f-5ca73c3c3299",
  "2db9b358-da71-4987-ba21-4c519e08d3d5",
  "a937b027-e410-481f-8462-a1978da4ea27",
]);
assert.equal(plaqueSequence.result.object.id, "00e95616-f09c-446e-aa97-8d241fc68189");
assert.match(plaqueSequence.solution, /OUR LADY OF LOSS/);
for (const step of plaqueSequence.steps) {
  const profile = entities.get(step.object.id)?.mechanism;
  assert.equal(profile?.sequence?.role, "step");
  assert.equal(profile.sequence.currentStep, step.order);
  assert.ok(step.clue?.includes("-"));
}
assert.equal(entities.get(plaqueSequence.result.object.id)?.mechanism.sequence.role, "result");

console.log(`Mechanisms: ${resolved.length} exact fixed links, ${catalog.stats.mobileRoutes} mobile routes, ${mappedEffects.length} exact effects, ${mappedMovements.length} mapped movements, and ${plaqueSequence.steps.length} ordered sequence steps verified.`);
