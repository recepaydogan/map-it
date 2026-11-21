"""Resolve dungeon bosses, inhabitants and mechanics from exact native references."""
import hashlib
import json
from collections import Counter
from pathlib import Path
from importlib import import_module
from context import value, write

BOSS_TITLES = {'reference.labels.bosses', 'reference.labels.boss'}
BOSS_TYPES = {'ENpcSubType::HeroMonster', 'ENpcSubType::LegendMonster'}
SOURCE_TABLES = ('Dungeon', 'NpcData', 'RewardOdEnergyCube', 'BossChallengeGroup', 'BossChallengeContents',
                 'EnvObjData', 'GatherSource', 'GatherSourceMaterial', 'WaveData', 'WaveStepData',
                 'Skill', 'SkillEffect', 'SkillEffectFilter', 'SkillAbnormal', 'SkillAbnormalString', 'SkillAbnormalEffect',
                 'StatCorrectionNumber')


def build(ctx, map_data, map_events):
    rows = ctx.rows('Dungeon')
    map_ids = {value(row['MapId']) for row in rows}
    npcs = {value(row['ID']): row for row in ctx.rows('NpcData')}
    npc_names = {row['Name']: npc_id for npc_id, row in npcs.items()}
    cubes = {row['Name']: row for row in ctx.rows('RewardOdEnergyCube')}
    encounters = import_module('dungeon-encounters').read(ctx, map_events)
    contents = import_module('dungeon-contents').Contents(ctx)
    mechanics = import_module('dungeon-combat-mechanics').Mechanics(ctx)
    challenge_groups = {row['Name'] for row in ctx.rows('BossChallengeGroup') if row['bApply']}
    challenges = [row for row in ctx.rows('BossChallengeContents') if row['bApply'] and row['GroupName'] in challenge_groups]
    challenge_dungeons = [row for row in rows if row['DungeonType'].endswith('::BossChallenge')]
    maps = {}
    paths = sorted(Path(map_data).glob('*.json'))
    if not paths:
        raise ValueError('No decoded map data found: ' + str(map_data))
    for path in paths:
        raw = path.read_bytes()
        export = json.loads(raw)
        data = export['data']['Properties']['Data']
        map_id = value(data['MapId'])
        if map_id not in map_ids:
            continue
        if map_id in maps:
            raise ValueError(f'Ambiguous dungeon map export: {map_id}')
        maps[map_id] = {
            'asset': export['asset'], 'sha256': hashlib.sha256(raw).hexdigest(),
            'npcIds': {value(cell) for spawn in data.get('SpawnInfoList', [])
                       for cell in spawn.get('NpcIdList', []) if value(cell)},
            'envIds': {value(cell) for spawn in data.get('SpawnInfoList', [])
                       for cell in spawn.get('EnvObjIdList', []) if value(cell)},
            'actors': {spawn['Name']: {value(cell) for cell in spawn.get('NpcIdList', []) if value(cell)}
                       for spawn in data.get('SpawnInfoList', [])},
        }

    audit, counts = [], Counter()
    for row in rows:
        entry = ctx.entries['Dungeon:' + str(value(row['ID']))]
        map_id = value(row['MapId'])
        source = maps.get(map_id)
        encounter = encounters.get(map_id)
        spawned = source['npcIds'] if source else set()
        cube = cubes.get(row.get('RewardOdEnergyCube'))
        reward_ids = set()
        if cube:
            names = [cube['FinalBossName']] + [boss['BossName'] for boss in cube['RewardMiddleBossList']]
            reward_ids = {npc_names[name] for name in names if name in npc_names}
        # Reward cubes can be shared between unrelated dungeons. When spawns exist,
        # only their exact NPC IDs may establish membership in this dungeon mode.
        candidates = {npc_id for npc_id in spawned if
                      npcs.get(npc_id, {}).get('NpcType') == 'ENpcType::Monster'
                      and npcs[npc_id].get('bCanBeAttacked') is True
                      and (npc_id in reward_ids or
                           (npcs[npc_id].get('bNamed') is True
                            and npcs[npc_id].get('NpcSubType') in BOSS_TYPES))}
        if not spawned:
            candidates = reward_ids
        event_npcs = set()
        if encounter:
            event_npcs.update(npc_names[name] for name in encounter['combatNpcs'] | encounter['summonedNpcs'] if name in npc_names)
            for actor in encounter['combatSpawners']:
                event_npcs.update(source['actors'].get(actor, set()) if source else set())
            # A kill objective establishes combat even when an NPC begins invulnerable.
            candidates.update(npc_id for npc_id in event_npcs if npcs[npc_id].get('bNamed')
                              and npcs[npc_id].get('NpcSubType') in BOSS_TYPES)
            entry['dungeonEncounter'] = {'kinds': sorted(encounter['kinds']), 'objectives': encounter['objectives'],
                                          'eventCount': len(encounter['sources'])}
        else:
            entry.pop('dungeonEncounter', None)
        challenge_levels = {}
        challenge_pool = row['DungeonType'].endswith('::BossChallenge') and len(challenge_dungeons) == 1
        if challenge_pool:
            # The unique typed challenge arena uses the content table's selectable
            # roster, not static map spawns. This is a pool, not a live rotation.
            for challenge in challenges:
                npc_id = npc_names.get(challenge['SpawnNpc'])
                if npc_id:
                    candidates.add(npc_id)
                    challenge_levels[npc_id] = challenge['Level']
        links, unresolved = [], []
        for npc_id in sorted(candidates):
            creature = ctx.entries.get('NpcData:' + str(npc_id))
            if not creature or creature.get('unnamed'):
                unresolved.append(npc_id)
                continue
            link = {key: creature[key] for key in ('id', 'name', 'category', 'icon') if key in creature}
            if npc_id in challenge_levels:
                link['challengeLevel'] = challenge_levels[npc_id]
            links.append(link)
        links.sort(key=lambda link: (link['name'].casefold(), link['id']))
        entry['sections'] = [section for section in entry['sections'] if section['title'] not in BOSS_TITLES]
        if links:
            entry['sections'].append({'title': 'reference.labels.bosses', 'links': links})
        entry['dungeonBosses'] = {
            'status': 'identified' if links else 'unconfirmed',
            'source': ('challenge-table' if challenge_pool else 'encounters' if candidates - spawned - reward_ids
                       else 'spawns' if spawned else 'rewards') if links else 'none',
        }
        published_ids = {int(link['id'].split(':')[1]) for link in links}
        entry['dungeonContents'], content_evidence = contents.build(row, source, encounter, published_ids)
        entry['dungeonBossMechanics'], mechanic_evidence = mechanics.build(published_ids, source, encounter)
        reason = ('identified' if links else 'map-unavailable' if not source
                  else 'no-spawn-data' if not spawned else 'no-boss-identified')
        if entry.get('adventure', {}).get('listed'):
            counts[reason] += 1
        audit.append({
            'id': entry['id'], 'mapId': map_id, 'name': entry['name'],
            'listed': entry.get('adventure', {}).get('listed', False),
            'status': reason, 'source': entry['dungeonBosses']['source'],
            'bossIds': [link['id'] for link in links], 'spawnedNpcCount': len(spawned),
            'unpublishedNpcIds': unresolved,
            'unmatchedRewardNpcIds': sorted(reward_ids - spawned) if spawned else [],
            'mapSource': {key: source[key] for key in ('asset', 'sha256')} if source else None,
            'eventSources': encounter['sources'] if encounter else [],
            'encounterKinds': sorted(encounter['kinds']) if encounter else [],
            'eventCombatNpcIds': sorted(event_npcs),
            'contents': content_evidence,
            'mechanics': mechanic_evidence,
        })
    import_module('creature-dungeon-contexts').attach(ctx.entries)
    listed = [entry for entry in audit if entry['listed']]
    report = {'version': 2, 'listedCounts': dict(counts), 'dungeons': audit,
              'contentCounts': {kind: sum(entry['contents']['counts'][kind] > 0 for entry in listed)
                                for kind in ('enemies', 'characters', 'resources', 'objects')},
              'dungeonsWithMechanics': sum(bool(entry['mechanics']) for entry in listed),
              'unpublishedMechanics': [{'abnormalId': identity, 'reason': reason}
                                       for identity, reason in sorted(mechanics.excluded.items())],
              'tables': [{'name': name, 'sha256': hashlib.sha256((ctx.tables / (name + '.json')).read_bytes()).hexdigest()}
                         for name in SOURCE_TABLES],
              'limitations': ['Spawn membership is mode-specific; no bosses are inferred from sibling dungeon names.',
                              'Static spawn records do not establish a complete encounter roster or live availability.',
                              'An unconfirmed boss list does not mean the dungeon has no bosses.',
                              'Challenge bosses describe the configured selectable pool, not the current seasonal rotation.',
                              'Inhabitants and objects describe configured content, not simultaneous or permanent availability.',
                              'Defensive modifiers are conditional effects, not base resistances or final damage multipliers.']}
    write(ctx.public / 'data/reference/dungeon-boss-audit.json', report)
    print('Dungeon boss import: ' + json.dumps(dict(counts)), flush=True)
