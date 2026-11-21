// Browser integration check. Set PLAYWRIGHT_MODULE to an external installation if needed.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 340, height: 460 } })
await context.addInitScript(() => {
  const target = { id: 'target', prefabName: 'SwordBronze', quantity: 1, currentQuality: 0, targetQuality: 1, recipeId: null, expandIntermediates: true, completed: false }
  localStorage.setItem('valheim-companion:crafting-planner', JSON.stringify({ version: 2, state: { plans: [{ id: 'qa', name: 'Bronze sword', targets: [target], manualOwned: { bronze: 999 }, recipeChoices: {}, archived: false }], activePlanId: 'qa' } }))
  localStorage.setItem('valheim-companion:craft-overlay', JSON.stringify({ version: 0, state: { planId: 'qa' } }))
  localStorage.setItem('valheim-companion:preferences', JSON.stringify({ inventoryTrackingEnabled: true, trackingInstallDirectory: 'QA' }))
  window.qaStock = [{ prefab: 'Bronze', amount: 3 }, { prefab: 'Wood', amount: 2 }, { prefab: 'LeatherScraps', amount: 1 }]
  window.qaAge = 0
  window.qaSizes = []
  window.overwolf = {
    windows: {
      getCurrentWindow: (cb) => cb({ success: true, window: { name: 'craft_overlay', id: 'qa' } }),
      changePosition: (_id, _x, _y, cb) => cb({ success: true }),
      changeSize: (size, cb) => { window.qaSizes.push(size); cb({ success: true }) },
      obtainDeclaredWindow: (_name, cb) => cb({ success: true, window: { id: 'qa' } }),
      hide: (_id, cb) => cb({ success: true }),
    },
    io: {
      readFileContents: (_path, _encoding, cb) => cb({ success: true, content: JSON.stringify({ payloadVersion: 1, sharing: true, updatedAt: Date.now() - window.qaAge, characterName: 'QA', worldName: 'QA', items: window.qaStock }) }),
      writeFileContents: (_path, _data, _encoding, _append, cb) => cb({ success: true }),
    },
  }
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message) })
await page.goto(process.env.OVERLAY_TEST_URL || 'http://127.0.0.1:5175/?window=craft_overlay')
const bronze = page.locator('.craft-tracker-materials li').filter({ hasText: 'Bronze' })
await page.locator('.craft-tracker-status[data-live="true"]').waitFor()
await bronze.getByText('5 more needed').waitFor()
assert.match(await bronze.innerText(), /3\s*\/\s*8/)
await page.evaluate(() => { window.qaStock[0].amount = 7 })
await bronze.getByText('1 more needed').waitFor()
await page.evaluate(() => { window.qaStock[0].amount = 2 })
await bronze.getByText('6 more needed').waitFor()
await mkdir('artifacts/craft-overlay', { recursive: true })
await page.screenshot({ path: 'artifacts/craft-overlay/live.png' })
assert.equal(await page.locator('img').evaluateAll((images) => images.filter((img) => !img.complete || img.naturalWidth === 0).length), 0)
await page.getByRole('button', { name: 'Raw resources' }).click()
assert.equal(await page.locator('.craft-tracker-materials li').filter({ hasText: 'Bronze' }).count(), 0)
await page.getByRole('button', { name: 'Recipe materials' }).click()
await page.evaluate(() => { window.qaAge = 60_000 })
await page.locator('.craft-tracker-status').filter({ hasText: 'Stale' }).waitFor()
await page.getByText('Last known inventory.', { exact: false }).waitFor()
await page.evaluate(() => { window.qaAge = 0; window.qaStock = [{ prefab: 'Bronze', amount: 8 }, { prefab: 'Wood', amount: 2 }, { prefab: 'LeatherScraps', amount: 2 }] })
await page.locator('.craft-tracker-footer').getByText('Everything needed is collected').waitFor()
await page.screenshot({ path: 'artifacts/craft-overlay/ready.png' })
await page.getByRole('button', { name: 'Collapse plan widget' }).click()
assert.equal(await page.locator('.craft-tracker-materials').count(), 0)
await page.waitForFunction(() => window.qaSizes.at(-1)?.height < 160)
await page.getByRole('button', { name: 'Expand plan widget' }).click()
await page.waitForFunction(() => window.qaSizes.at(-1)?.height > 250)
// A second window updates persisted state; the overlay must follow storage events.
const other = await context.newPage()
await other.goto('http://127.0.0.1:5175/?window=craft_overlay')
await other.evaluate(() => {
  const key = 'valheim-companion:crafting-planner'
  const state = JSON.parse(localStorage.getItem(key))
  state.state.plans[0].targets[0].quantity = 2
  localStorage.setItem(key, JSON.stringify(state))
})
await bronze.getByText('8 more needed').waitFor()
await page.getByRole('button', { name: 'Stop tracking' }).click()
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('valheim-companion:craft-overlay')).state.planId), null)
assert.deepEqual(errors, [])
console.log('PASS: real catalog/icons, live gain/spend, no manual stock contamination, stale/recovery, ready, collapse/resize, cross-window quantity sync, stop.')
await browser.close()
