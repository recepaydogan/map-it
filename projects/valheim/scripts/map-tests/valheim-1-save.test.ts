import assert from 'node:assert/strict'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import { committedWorldFiles, hasValidWorldChunkHeader, parseChunkMapping, parseChunkedWorldDatabase } from '../../src/lib/valheim/chunked-world-save.ts'
import { BinaryReader, decodeInventoryItems, parseWorldMetadata } from '../../src/lib/valheim/world-save-format.ts'
import { parseCharacterFile } from '../../src/lib/valheim/character-save-format.ts'
import { getStableHashCode as hash } from '../../src/lib/valheim/stable-hash.ts'

class W {
  parts: Buffer[] = []
  bytes(b: Uint8Array) { this.parts.push(Buffer.from(b)); return this }
  u8(n: number) { return this.bytes(Uint8Array.of(n)) }
  i16(n: number) { const b = Buffer.alloc(2); b.writeInt16LE(n); return this.bytes(b) }
  u16(n: number) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return this.bytes(b) }
  i32(n: number) { const b = Buffer.alloc(4); b.writeInt32LE(n); return this.bytes(b) }
  i64(n: bigint) { const b = Buffer.alloc(8); b.writeBigInt64LE(n); return this.bytes(b) }
  f32(n: number) { const b = Buffer.alloc(4); b.writeFloatLE(n); return this.bytes(b) }
  f64(n: number) { const b = Buffer.alloc(8); b.writeDoubleLE(n); return this.bytes(b) }
  str(s: string) { const b = Buffer.from(s); assert.ok(b.length < 128); return this.u8(b.length).bytes(b) }
  build() { return Buffer.concat(this.parts) }
  buffer() { return Uint8Array.from(this.build()).buffer }
}

test('only a complete committed world generation is selected, never lexical ordering or a partial write', () => {
  const names = ['_main.9.ok', '_main.9.fwl2', '_main.9.db2', '_main.9.chunks', '_main.10.ok', '_main.10.fwl2', '_main.10.db2', '_main.10.chunks', '_main.11.fwl2', '_main.11.db2', '_main.11.chunks', '_main.12.ok']
  assert.deepEqual(committedWorldFiles(names), { metadata: '_main.10.fwl2', database: '_main.10.db2', chunks: '_main.10.chunks' })
  assert.equal(committedWorldFiles(['_main.1.fwl2']), null)
})

test('chunk maps through world version 42 use explicit revisions and portal chunk names; truncated maps fail', () => {
  for (const version of [41, 42]) {
    const map = new W().u16(version).i32(2).i32(2).u16(0x0203).u8(3).i32(7).i32(1).u16(1).u8(0).i32(8).i32(1)
    assert.deepEqual(parseChunkMapping(map.buffer()), [{ fileName: '02_03__3_7.chunk', objectCount: 1 }, { fileName: '00_01__0_8.chunk', objectCount: 1 }])
    assert.throws(() => parseChunkMapping(map.build().subarray(0, 12).buffer.slice(0, 12)))
  }
})

test('chunk preflight accepts version 42 before loading the world save', () => {
  for (const version of [40, 41, 42]) assert.equal(hasValidWorldChunkHeader(new W().u16(version).i32(0).buffer()), true)
  for (const version of [39, 43]) assert.equal(hasValidWorldChunkHeader(new W().u16(version).i32(0).buffer()), false)
  assert.equal(hasValidWorldChunkHeader(new W().u16(42).i32(-1).buffer()), false)
  assert.equal(hasValidWorldChunkHeader(new W().u16(42).i16(0).buffer()), false)
})

test('1.0 world metadata keeps seed and UID with the fwl2 extension', () => {
  const payload = new W().i32(41).str('North').str('Valheim').i32(hash('Valheim')).i64(42n).i32(2).u8(1).i32(0).i32(0).build()
  const world = parseWorldMetadata(new W().i32(payload.length).bytes(payload).buffer(), 'North/_main.3.fwl2', 'North/_main.3.db2', 'local')
  assert.equal(world.uid, '42'); assert.equal(world.seedName, 'Valheim'); assert.equal(world.worldVersion, 41)
})

test('109 inventories read flags, compact amounts, hashes and custom data without shifting the next item', () => {
  const inventory = new W().i32(109).u16(2)
    .i32(2500).u8(1).u8(2).u8(0).u8(0xfc).u16(4).u16(20).i32(2).i64(99n).str('Smith').i32(hash('SwordGold')).u8(1).str('key').str('value').u8(1)
    .i32(0).u8(0).u8(0).u8(0).u8(0x40).i32(hash('Ice')).u8(0)
  const items = decodeInventoryItems(inventory.build().toString('base64'), new Map([[hash('SwordGold'), { prefabName: 'SwordGold' }], [hash('Ice'), { prefabName: 'Ice' }]]))
  assert.deepEqual(items, [{ prefab: 'SwordGold', amount: 20, quality: 4 }, { prefab: 'Ice', amount: 1, quality: 1 }])
})

test('db2 versions 41 and 42 preserve locations, small positions, portal yaw and global keys', async () => {
  const zones = new W().i32(1).i16(-3).i16(5).i32(1).i32(1).str('defeated_frozenking_p3').u8(1).i32(1).i32(hash('DN_Bossroom')).f32(100).f32(50).f32(9000).u8(1).build()
  const compressed = gzipSync(zones)
  for (const version of [41, 42]) {
    const db = new W().i32(version).f64(12345).i32(compressed.length).bytes(compressed).buffer()
    const chunk = new W().u16(version).i32(2)
      .u16(0x2000).i16(-12).i16(42).i32(hash('Moose'))
      .u16(0x1020).f32(10).f32(30).f32(9000).i32(hash('portal_wood')).u16(0x8000 | 180).u8(1).i32(hash('creator')).i64(55n)
    const result = await parseChunkedWorldDatabase(db, [{ prefabName: 'Moose', componentKinds: ['character'] }, { prefabName: 'portal_wood', componentKinds: ['piece'] }], [chunk.buffer()], ['DN_Bossroom'])
    assert.deepEqual(result.globalKeys, ['defeated_frozenking_p3'])
    assert.deepEqual([...result.resourceState.generatedZones], [-3, 5])
    assert.equal(result.locations[0].prefabName, 'DN_Bossroom')
    assert.equal(result.trackedObjects[0].height, 0)
    assert.equal(result.trackedObjects[0].x, -12)
    assert.equal(result.baseOperations.portals[0].yaw, 90)
    assert.equal(result.resourceState.netTimeSeconds, 12345)
    await assert.rejects(parseChunkedWorldDatabase(db, [], [chunk.buffer().slice(0, 8)], []))
  }
})

test('player 46 skips grouped statistics before reading world list and player identity', () => {
  const p = new W().i32(46).i32(2).i32(1).f32(3).f32(4)
  for (let i = 0; i < 3; i++) p.i32(1).str('world').f32(5)
  p.i32(2)
  for (let i = 0; i < 7; i++) p.i32(1).str('entry').f32(6)
  p.u8(0).i32(0).str('Viking').i64(77n)
  const bytes = p.build()
  const result = parseCharacterFile(new W().i32(bytes.length).bytes(bytes).buffer())
  assert.equal(result.playerName, 'Viking'); assert.equal(result.playerId, '77'); assert.deepEqual(result.worlds, [])
})

test('malformed package lengths cannot move the reader backwards', () => {
  assert.throws(() => new BinaryReader(new Uint8Array(new W().i32(-1).buffer())).package())
})
