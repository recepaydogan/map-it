import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSteamCharacterSaveTimes } from '../../src/lib/valheim/character-save-recency.ts'

test('Steam cache timestamps identify primary character saves without using backups or other files', () => {
  const times = parseSteamCharacterSaveTimes(`"892970" {
    "characters/Test.fch" { "localtime" "200" "time" "190" }
    "characters/test2.fch" { "time" "300" }
    "characters/test_backup_auto-20261022.fch" { "time" "900" }
    "characters/test.fch.old" { "time" "900" }
    "worlds/test.fch" { "time" "900" }
    "characters/broken.fch" { "time" "invalid" }
  }`)
  assert.deepEqual([...times], [['test.fch', 200000], ['test2.fch', 300000]])
  assert.equal(parseSteamCharacterSaveTimes('').size, 0)
})
