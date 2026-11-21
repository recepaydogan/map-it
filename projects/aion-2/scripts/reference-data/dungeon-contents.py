"""Resolve dungeon inhabitants and useful objects from exact native references."""
import hashlib
import json
import re
from collections import defaultdict
from importlib import import_module
from context import value


def readable(ctx, row):
    name = ctx.text(row.get('Desc'))
    internal = import_module('adventure-identities').INTERNAL_NAME
    return name if name and not internal.search(name) and not re.fullmatch(r'[?\s.…\d]+', name) else ''


class Contents:
    def __init__(self, ctx):
        self.ctx = ctx
        self.npcs = {value(row['ID']): row for row in ctx.rows('NpcData')}
        self.npc_names = {row['Name']: identity for identity, row in self.npcs.items()}
        self.envs = {value(row['ID']): row for row in ctx.rows('EnvObjData')}
        self.env_names = {row['Name']: identity for identity, row in self.envs.items()}
        self.gathering = {row['Name']: row for row in ctx.rows('GatherSource')}
        self.materials = defaultdict(list)
        for row in ctx.rows('GatherSourceMaterial'):
            self.materials[row['MaterialGroup']].append(row)
        self.waves = {row['Name']: row for row in ctx.rows('WaveData')}
        self.wave_steps = defaultdict(list)
        for row in ctx.rows('WaveStepData'):
            self.wave_steps[row['WaveName']].append(row)

    def build(self, row, source, encounter, boss_ids):
        ctx = self.ctx
        npc_ids = set(source['npcIds']) if source else set()
        env_ids = set(source['envIds']) if source else set()
        event_npcs = set()
        wave_names = set(encounter['waves']) if encounter else set()
        wave_names.update(name for name, wave in self.waves.items()
                          if row['DungeonWaveGroupName'] != 'None' and wave['Group'] == row['DungeonWaveGroupName'])
        wave_actors = {actor for name in wave_names for step in self.wave_steps[name] for actor in step['SpawnerList']}
        unresolved_wave_actors = []
        for actor in sorted(wave_actors):
            if source and actor in source['actors']:
                event_npcs.update(source['actors'][actor])
            else:
                unresolved_wave_actors.append(actor)
        if encounter:
            for name in encounter['combatNpcs'] | encounter['summonedNpcs']:
                if name in self.npc_names:
                    event_npcs.add(self.npc_names[name])
            for name in encounter['objects']:
                if name in self.env_names:
                    env_ids.add(self.env_names[name])
            for actor in encounter['combatSpawners']:
                event_npcs.update(source['actors'].get(actor, set()) if source else set())
        npc_ids.update(event_npcs)
        result = {'enemies': [], 'characters': [], 'resources': [], 'objects': []}
        unpublished = []
        object_evidence, uninterpreted_objects = [], []
        for npc_id in sorted(npc_ids - boss_ids):
            npc = self.npcs.get(npc_id)
            entry = ctx.entries.get('NpcData:' + str(npc_id))
            if not npc or not entry or not readable(ctx, npc) or entry.get('unnamed'):
                unpublished.append('NpcData:' + str(npc_id))
                continue
            monster = npc['NpcType'] == 'ENpcType::Monster'
            if monster and not (npc['bCanBeAttacked'] or npc_id in event_npcs):
                continue
            kind = 'enemies' if monster else 'characters'
            link = {key: entry[key] for key in ('id', 'name', 'category', 'icon') if key in entry}
            # Only definitions identical apart from their native ID and actor name
            # may share one row in a dungeon list.
            definition = {key: val for key, val in npc.items() if key not in ('ID', 'Name')}
            link['contentGroup'] = hashlib.sha256(json.dumps(definition, sort_keys=True).encode()).hexdigest()[:16]
            result[kind].append(link)
        for env_id in sorted(env_ids):
            env = self.envs.get(env_id)
            name = readable(ctx, env) if env else ''
            if not name:
                unpublished.append('EnvObjData:' + str(env_id))
                continue
            usage = env['Usage'].split('::')[-1]
            record = {'id': 'EnvObjData:' + str(env_id), 'name': name}
            if usage == 'GatherSource':
                gathering = self.gathering.get(env['UsageValue'])
                links = {}
                if gathering:
                    record['requiredMastery'] = gathering['MasteryLevel']
                    for material in self.materials[gathering['MaterialGroup']]:
                        link = ctx.link('Item', material['MaterialName'])
                        if link:
                            links[link['id']] = link
                record['items'] = list(links.values())
                result['resources'].append(record)
            elif usage in ('MapEvent', 'OdEnergyCube', 'Overlap') or (
                    usage == 'Normal' and (env['InteractTime'] > 0 or env['bCanBeAttacked'])) or (
                    encounter and env['Name'] in encounter['objects']):
                # Navigation objects belong to the independently maintained travel feature.
                if usage in ('TeleportArtifact', 'DungeonTeleportArtifact', 'PartyTeleportGate'):
                    continue
                # InteractDesc is a progress message ("Examining..."), never a
                # description of what the player gains or needs to do here.
                purposes = encounter.get('objectPurposes', {}).get(env['Name'], []) if encounter else []
                if purposes:
                    record['purposes'] = list({str(item['purpose']): item['purpose'] for item in purposes}.values())
                    result['objects'].append(record)
                    object_evidence.append({'id': record['id'], 'evidence': purposes})
                else:
                    uninterpreted_objects.append({'id': record['id'], 'name': name, 'reason': 'no-player-facing-purpose'})
        for records in result.values():
            records.sort(key=lambda item: (item['name'].casefold(), item['id']))
        evidence = {'npcIds': sorted(npc_ids), 'environmentIds': sorted(env_ids),
                    'waveNames': sorted(wave_names), 'unresolvedWaveActors': unresolved_wave_actors,
                    'unpublishedIds': unpublished, 'objectPurposes': object_evidence,
                    'uninterpretedObjects': uninterpreted_objects,
                    'counts': {key: len(records) for key, records in result.items()}}
        return result, evidence
