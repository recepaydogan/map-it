import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { test } from 'node:test'
import { decodeCharacterMap, decodeMapPins, loadCharacterSave, parseCharacterFile } from '../../src/lib/valheim/character-save-format.ts'
import { isMapPointExplored } from '../../src/lib/valheim/explored-map.ts'

class W {
  private parts: Buffer[] = []
  int32(v: number) { const b = Buffer.alloc(4); b.writeInt32LE(v); this.parts.push(b); return this }
  int64(v: bigint) { const b = Buffer.alloc(8); b.writeBigInt64LE(v); this.parts.push(b); return this }
  single(v: number) { const b = Buffer.alloc(4); b.writeFloatLE(v); this.parts.push(b); return this }
  bool(v: boolean) { this.parts.push(Buffer.from([v ? 1 : 0])); return this }
  bytes(b: Buffer) { this.parts.push(b); return this }
  string(v: string) { const e = Buffer.from(v, 'utf8'); assert.ok(e.length < 128); this.parts.push(Buffer.from([e.length]), e); return this }
  vec3(x: number, y: number, z: number) { return this.single(x).single(y).single(z) }
  build() { return Buffer.concat(this.parts) }
}

const TS = 4
const mapData = (compressed: boolean) => {
  // v8 carries an author string per pin; v6 (uncompressed) does not.
  const w = new W().int32(TS)
    .bytes(Buffer.alloc(TS * TS, 1)).bytes(Buffer.alloc(TS * TS, 0))
    .int32(3)
  const pin = (name: string, x: number, z: number, type: number, checked: boolean, owner: bigint, author: string) => {
    w.string(name).vec3(x, 30, z).int32(type).bool(checked).int64(owner)
    if (compressed) w.string(author)
  }
  pin('köy', 829, -1141, 3, true, 11n, 'Steam_1')
  pin('$enemy_eikthyr', -589, 69, 9, false, 0n, '')
  pin('portal', 10, 20, 6, false, 11n, '')
  const inner = w.bool(true).build()
  if (!compressed) return new W().int32(6).bytes(inner).build()
  const z = gzipSync(inner)
  return new W().int32(8).int32(z.length).bytes(z).build()
}

const characterFile = (compressed = true, version = 43) => {
  const md = mapData(compressed)
  const header = new W().int32(version)
  if (version === 44 || version >= 46) {
    // PlayerProfile.SavePlayerToDisk in the installed game: 205 stats, 10 groups,
    // three dictionaries, five enemy dictionaries, then five item/piece dictionaries.
    header.int32(205).int32(10)
    for (let group = 0; group < 10; group++) {
      for (let stat = 0; stat < 205; stat++) header.single(stat + group)
      const dictionary = () => header.int32(1).string(`entry-${group}`).single(3)
      for (let i = 0; i < 3; i++) dictionary()
      header.int32(5)
      for (let i = 0; i < 10; i++) dictionary()
    }
  } else header.int32(2).single(1).single(2)
  const pkg = header.bool(false)
    .int32(2)
    // world A: with map data
    .int64(1605511480n).bool(false).vec3(0, 0, 0).bool(true).vec3(1, 2, 3).bool(false).vec3(0, 0, 0).vec3(0, 0, 0).bool(true).int32(md.length).bytes(md)
    // world B: no map data
    .int64(42n).bool(false).vec3(0, 0, 0).bool(false).vec3(0, 0, 0).bool(false).vec3(0, 0, 0).vec3(0, 0, 0).bool(false)
    .string('Kerem').int64(-392105228n).string('seed').build()
  return new W().int32(pkg.length).bytes(pkg).int32(4).bytes(Buffer.alloc(4)).build()
}

const toArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

test('character file: outer package, worlds, and name/id', () => {
  const parsed = parseCharacterFile(toArrayBuffer(characterFile()))
  assert.equal(parsed.playerVersion, 43)
  assert.equal(parsed.playerName, 'Kerem')
  assert.equal(parsed.playerId, '-392105228')
  assert.equal(parsed.worlds.length, 2)
  assert.equal(parsed.worlds[0].worldUid, '1605511480')
  assert.ok(parsed.worlds[0].mapData)
  assert.equal(parsed.worlds[1].mapData, null)
})

test('map pins decode from the compressed (v8) block', async () => {
  const save = await loadCharacterSave(toArrayBuffer(characterFile()))
  const world = save.worlds.get('1605511480')
  assert.ok(world?.hasMapData)
  assert.equal(world.pins.length, 3)
  assert.equal(world.exploration?.textureSize, TS)
  assert.ok(isMapPointExplored(world.exploration ?? null, 0, 0))
  assert.deepEqual(world.pins[0], { name: 'köy', x: 829, z: -1141, height: 30, type: 'icon3', checked: true, ownerId: '11' })
  assert.equal(world.pins[1].type, 'boss')
  assert.equal(world.pins[1].name, '$enemy_eikthyr')
  assert.equal(world.pins[2].type, 'icon4')
  assert.equal(save.worlds.get('42')?.hasMapData, false)
})

test('map pins decode from an uncompressed legacy (v6) block', async () => {
  const pins = await decodeMapPins(new Uint8Array(mapData(false)))
  assert.equal(pins.length, 3)
  assert.equal(pins[0].name, 'köy')
})

test('compressed exploration keeps personal cells and excludes cartography-table cells', async () => {
  const own = Buffer.alloc(16), shared = Buffer.alloc(16)
  own[11] = 1 // x=12, z=0
  shared[5] = 1 // x=-12, z=-12
  const inner = new W().int32(4).bytes(own).bytes(shared).int32(0).bool(false).build()
  const compressed = gzipSync(inner)
  const map = await decodeCharacterMap(new W().int32(8).int32(compressed.length).bytes(compressed).build())
  assert.deepEqual(map.pins, [])
  assert.ok(isMapPointExplored(map.exploration, 12, 0))
  assert.equal(isMapPointExplored(map.exploration, -12, -12), false)
  assert.equal(isMapPointExplored(map.exploration, 0, 0), false)
})

test('v1 maps retain exploration even though they have no pin list', async () => {
  const map = await decodeCharacterMap(new W().int32(1).int32(4).bytes(Buffer.alloc(16, 1)).build())
  assert.deepEqual(map.pins, [])
  assert.ok(isMapPointExplored(map.exploration, 0, 0))
  await assert.rejects(decodeCharacterMap(new W().int32(6).int32(4).bytes(Buffer.alloc(20)).build()))
})

test('a truncated character file throws', () => {
  const full = characterFile()
  assert.throws(() => parseCharacterFile(toArrayBuffer(full.subarray(0, 40))))
})

for (const version of [44, 45, 46, 47]) {
  test(`character v${version}: stats layout preserves world maps and character identity`, async () => {
    const save = await loadCharacterSave(toArrayBuffer(characterFile(true, version)))
    assert.equal(save.playerVersion, version)
    assert.equal(save.playerName, 'Kerem')
    assert.equal(save.playerId, '-392105228')
    assert.equal(save.worlds.size, 2)
    assert.equal(save.worlds.get('1605511480')?.pins[0].name, 'köy')
    assert.equal(save.worlds.get('1605511480')?.pins.length, 3)
    assert.equal(save.worlds.get('42')?.hasMapData, false)
  })
}

test('unknown future versions are rejected rather than misread', () => {
  assert.throws(() => parseCharacterFile(toArrayBuffer(characterFile(true, 48))), /Unsupported Valheim character version 48/)
})

test('a truncated v47 stats block is rejected', () => {
  assert.throws(() => parseCharacterFile(toArrayBuffer(characterFile(true, 47).subarray(0, 500))))
})

test('a synthetic future save is readable only when explicitly approved for the bundled layout', async () => {
  const policy = { schema_version: 1 as const, revision: 2, parser_profile: 'grouped-stats-v1' as const, compatible_versions: [48] }
  const buffer = toArrayBuffer(characterFile(true, 48))
  assert.throws(() => parseCharacterFile(buffer), /Unsupported/)
  const save = await loadCharacterSave(buffer, policy)
  assert.equal(save.playerVersion, 48)
  assert.equal(save.playerName, 'Kerem')
  assert.equal(save.playerId, '-392105228')
  assert.equal(save.worlds.get('1605511480')?.pins[0].name, 'köy')
  assert.throws(() => parseCharacterFile(toArrayBuffer(characterFile(true, 49)), policy), /Unsupported/)
  assert.throws(() => parseCharacterFile(toArrayBuffer(characterFile(true, 48).subarray(0, 500)), policy))
})
