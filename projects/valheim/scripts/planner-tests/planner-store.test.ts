import assert from 'node:assert/strict'
import { test } from 'node:test'

// The persisted store and the transfer helpers only need a storage shim; nothing
// in them touches the DOM. Installing it before the dynamic imports keeps these
// tests free of a browser environment.
const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
    clear: () => storage.clear(),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size
    },
  },
})

const {
  PLANNER_SCHEMA_VERSION,
  sanitizePlan,
  sanitizeTarget,
  useCraftingPlannerStore,
} = await import('../../src/store/crafting-planner-store.ts')
const { exportPlan, importPlanFromText, formatCollectionSummary } =
  await import('../../src/features/crafting-planner/plan-transfer.ts')

test('targets are clamped at the persistence boundary', () => {
  const target = sanitizeTarget({
    prefabName: 'SwordBronze',
    quantity: -4,
    currentQuality: -2,
    targetQuality: 0,
    note: 'x'.repeat(400),
  })
  assert.equal(target.quantity, 1)
  assert.equal(target.currentQuality, 0)
  assert.equal(target.targetQuality, 1)
  assert.equal(target.note.length, 280)
  assert.ok(target.id.length > 0)
})

test('manual amounts are keyed by prefab identity, never by display name', () => {
  const plan = sanitizePlan({
    name: 'Test',
    targets: [{ prefabName: 'SwordBronze' }],
    manualOwned: { Bronze: 8, TinOre: -3, '': 5 },
    recipeChoices: { BRONZE: 'Recipe_Bronze5' },
  })
  assert.deepEqual(plan.manualOwned, { bronze: 8 })
  assert.deepEqual(plan.recipeChoices, { bronze: 'Recipe_Bronze5' })
})

test('plan CRUD keeps one active plan and reassigns it on delete', () => {
  const store = useCraftingPlannerStore.getState()
  const firstId = store.createPlan('First')
  const secondId = useCraftingPlannerStore.getState().createPlan('Second')
  assert.equal(useCraftingPlannerStore.getState().activePlanId, secondId)

  useCraftingPlannerStore.getState().addTarget(secondId, {
    prefabName: 'SwordBronze',
    quantity: 2,
    currentQuality: 0,
    targetQuality: 2,
    recipeId: null,
    expandIntermediates: true,
    note: '',
    completed: false,
  })
  assert.equal(useCraftingPlannerStore.getState().plans.find((plan) => plan.id === secondId)?.targets.length, 1)

  useCraftingPlannerStore.getState().deletePlan(secondId)
  assert.equal(useCraftingPlannerStore.getState().activePlanId, firstId)
  useCraftingPlannerStore.getState().deletePlan(firstId)
  assert.equal(useCraftingPlannerStore.getState().activePlanId, null)
})

test('archiving moves the active plan away without deleting it', () => {
  const store = useCraftingPlannerStore.getState()
  const keptId = store.createPlan('Kept')
  const archivedId = useCraftingPlannerStore.getState().createPlan('Archived')
  useCraftingPlannerStore.getState().setPlanArchived(archivedId, true)
  const state = useCraftingPlannerStore.getState()
  assert.equal(state.plans.some((plan) => plan.id === archivedId), true)
  assert.equal(state.activePlanId, keptId)
  state.deletePlan(keptId)
  useCraftingPlannerStore.getState().deletePlan(archivedId)
})

test('target reordering changes allocation priority', () => {
  const planId = useCraftingPlannerStore.getState().createPlan('Order')
  const firstTarget = useCraftingPlannerStore.getState().addTarget(planId, {
    prefabName: 'SwordBronze',
    quantity: 1,
    currentQuality: 0,
    targetQuality: 1,
    recipeId: null,
    expandIntermediates: false,
    note: '',
    completed: false,
  })
  const secondTarget = useCraftingPlannerStore.getState().addTarget(planId, {
    prefabName: 'AtgeirBronze',
    quantity: 1,
    currentQuality: 0,
    targetQuality: 1,
    recipeId: null,
    expandIntermediates: false,
    note: '',
    completed: false,
  })
  useCraftingPlannerStore.getState().moveTarget(planId, secondTarget, -1)
  const targets = useCraftingPlannerStore.getState().plans.find((plan) => plan.id === planId)?.targets ?? []
  assert.deepEqual(targets.map((target) => target.id), [secondTarget, firstTarget])
  useCraftingPlannerStore.getState().deletePlan(planId)
})

test('resetting manual progress keeps the targets', () => {
  const planId = useCraftingPlannerStore.getState().createPlan('Progress')
  useCraftingPlannerStore.getState().addTarget(planId, {
    prefabName: 'SwordBronze',
    quantity: 1,
    currentQuality: 0,
    targetQuality: 1,
    recipeId: null,
    expandIntermediates: true,
    note: '',
    completed: true,
  })
  useCraftingPlannerStore.getState().setManualOwned(planId, 'Bronze', 5)
  useCraftingPlannerStore.getState().resetManualProgress(planId)
  const plan = useCraftingPlannerStore.getState().plans.find((entry) => entry.id === planId)
  assert.deepEqual(plan?.manualOwned, {})
  assert.equal(plan?.targets.length, 1)
  assert.equal(plan?.targets[0]?.completed, false)
  useCraftingPlannerStore.getState().deletePlan(planId)
})

test('a plan survives an export and import round trip', () => {
  const plan = sanitizePlan({
    name: 'Iron gear',
    targets: [{ prefabName: 'SwordIron', quantity: 2, targetQuality: 3 }],
    manualOwned: { iron: 12 },
    recipeChoices: { bronze: 'Recipe_Bronze5' },
  })
  const result = importPlanFromText(exportPlan(plan))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.plan.name, plan.name)
  assert.equal(result.plan.targets[0]?.prefabName, 'SwordIron')
  assert.equal(result.plan.targets[0]?.targetQuality, 3)
  assert.deepEqual(result.plan.manualOwned, { iron: 12 })
  // A fresh identity so importing never overwrites the plan it came from.
  assert.notEqual(result.plan.id, plan.id)
})

test('import rejects anything that is not a plan', () => {
  assert.equal(importPlanFromText('not json').ok, false)
  assert.equal(importPlanFromText('{"kind":"something-else"}').ok, false)
  assert.equal(
    importPlanFromText('{"kind":"valheim-companion-plan","version":99,"plan":{"targets":[]}}').ok,
    false,
  )
  assert.equal(
    importPlanFromText('{"kind":"valheim-companion-plan","version":1,"plan":{"targets":[]}}').ok,
    false,
  )
})

test('persisted state carries an explicit schema version', () => {
  // Version 2: one craft is one item; multi-target plans split on migration.
  assert.equal(PLANNER_SCHEMA_VERSION, 2)
  assert.equal(useCraftingPlannerStore.getState().schemaVersion, PLANNER_SCHEMA_VERSION)
})

test('the collection summary lists only what is still missing', () => {
  const summary = formatCollectionSummary(
    'Iron gear',
    {
      version: 'test',
      targets: [],
      materials: [
        { prefabName: 'Iron', item: null, required: 20, applied: 8, missing: 12, ownedTotal: 8, reserved: 8, completion: 0.4, craftable: true, teleportable: false, perTarget: [], contended: false },
        { prefabName: 'Wood', item: null, required: 10, applied: 10, missing: 0, ownedTotal: 10, reserved: 10, completion: 1, craftable: false, teleportable: true, perTarget: [], contended: false },
      ],
      intermediates: [],
      stations: [],
      warnings: [],
      totals: { targets: 1, requiredUnits: 30, missingUnits: 12, completion: 0.6, readyTargets: 0, distinctMissingMaterials: 1 },
    },
    { missing: 'Still missing', nothingMissing: 'Nothing missing' },
  )
  assert.match(summary, /Iron ×12/)
  assert.doesNotMatch(summary, /Wood/)
})
