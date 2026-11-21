"""Publish adventure markers only at verified native spawn coordinates."""
import hashlib
import json
import math
from collections import defaultdict
from importlib import import_module
from context import value, write
from world import MAPS


def build(ctx, spawn_dir):
    internal = import_module('adventure-identities').INTERNAL_NAME
    npcs = {row['Name']: row for row in ctx.rows('NpcData')}
    envs = {row['Name']: row for row in ctx.rows('EnvObjData')}
    categories = {'EnterDungeon': 'dungeon', 'PartyDungeon': 'dungeon', 'Quest': 'quest-object',
                  'Monolith': 'monolith', 'AbyssArtifact': 'objective', 'FlightRing': 'flight', 'GatherSource': 'native-resource'}
    report = {'version': 1, 'added': [], 'linked': 0, 'hiddenInternal': 0, 'unmappedDungeons': []}
    hidden = set()
    for _, slug, _, spawn_name, half in MAPS:
        path = ctx.public / 'maps' / slug / 'metadata.json'
        if not path.exists():
            continue
        # Read the latest file and preserve every travel marker exactly as published.
        data = json.loads(path.read_text('utf8'))
        points = data['locations']
        by_position = defaultdict(list)
        for point in points:
            by_position[(point['category'], point['x'], point['y'])].append(point)
            if point['category'] not in ('teleport', 'rift', 'portal') and internal.search(point['name']):
                point['hiddenFromMap'] = True
                hidden.add((slug, point['id']))
                report['hiddenInternal'] += 1
            elif point['category'] not in ('teleport', 'rift', 'portal'):
                point.pop('hiddenFromMap', None)
        if spawn_name:
            bounds = data['bounds']
            width, height = bounds['maxX'] - bounds['minX'], bounds['maxY'] - bounds['minY']
            for line in (spawn_dir / (spawn_name + '-spawns.jsonl')).read_text('utf8').splitlines():
                spawn = json.loads(line)
                row = envs.get(spawn['npcName'])
                entry = ctx.entries.get('EnvObjData:' + str(value(row['ID']))) if row else None
                category = categories.get(row['Usage'].split('::')[-1]) if row else None
                if not row:
                    row = npcs.get(spawn['npcName'])
                    entry = ctx.entries.get('NpcData:' + str(value(row['ID']))) if row else None
                    if entry and entry.get('group') == 'Boss':
                        category = 'boss'
                    elif row and row['NpcType'].endswith('::Monster') and row['bCanBeAttacked']:
                        category = 'enemy'
                    elif entry and row['NpcType'].endswith('::Citizen') and any(s['title'] == 'reference.adventure.relatedQuests' for s in entry['sections']):
                        category = 'npc'
                if not entry or not category or internal.search(entry['name']) or entry.get('unnamed'):
                    continue
                x = round(bounds['minX'] + width / 2 + spawn['worldX'] * width / (2 * half))
                y = round(bounds['minY'] + height / 2 + spawn['worldY'] * height / (2 * half))
                world_position = {axis: spawn['world' + axis] for axis in ('X', 'Y', 'Z')}
                if data.get('worldProjection'):
                    projected = import_module('world-marker-sources').project(world_position, data['worldProjection'], bounds)
                    x, y = projected['x'], projected['y']
                if not (bounds['minX'] <= x <= bounds['maxX'] and bounds['minY'] <= y <= bounds['maxY']):
                    continue
                candidates = by_position[(category, x, y)]
                point = next((p for p in candidates if p.get('entityId') == str(value(row['ID'])) or p['name'] == entry['name']), None)
                if point is None:
                    # A service NPC already drawn at this exact location keeps its service category.
                    point = next((p for p in points if p['category'] not in ('teleport', 'rift', 'portal') and p.get('entityId') == str(value(row['ID'])) and math.hypot(p['x'] - x, p['y'] - y) <= 1), None)
                if point is None:
                    digest = hashlib.sha1(f'{slug}/{category}/{row["Name"]}/{x}/{y}'.encode()).hexdigest()[:16]
                    point = {'id': f'{slug}-{category}-{digest}', 'name': entry['name'], 'category': category, 'x': x, 'y': y}
                    points.append(point)
                    by_position[(category, x, y)].append(point)
                    report['added'].append({'mapId': slug, 'markerId': point['id'], 'category': category})
                point.update({'reference': {'id': entry['id'], 'category': entry['category']},
                              'entityId': str(value(row['ID'])), 'worldPosition': world_position, 'sourceActor': spawn['actor'], 'sourceAsset': spawn['asset']})
                location = {'mapId': slug, 'markerId': point['id'], 'name': data['displayName'] + ' · ' + point['name']}
                entry['locations'] = list({(p['mapId'], p['markerId']): p for p in entry['locations'] + [location]}.values())
                if category == 'dungeon':
                    for section in entry['sections']:
                        for link in section.get('links', []):
                            target = ctx.entries.get(link['id'])
                            if target and target['category'] == 'dungeons':
                                target['locations'] = list({(p['mapId'], p['markerId']): p for p in target['locations'] + [location]}.values())
                                report['linked'] += 1
        write(path, data)
    for entry in ctx.entries.values():
        entry['locations'] = [location for location in entry['locations'] if (location['mapId'], location['markerId']) not in hidden]
    report['unmappedDungeons'] = [entry['id'] for entry in ctx.entries.values()
        if entry['category'] == 'dungeons' and entry.get('adventure', {}).get('listed') and not entry['locations']]
    write(ctx.public / 'data/reference/adventure-map-audit.json', report)
    print(f'Added {len(report["added"])} verified markers; linked {report["linked"]} dungeon entrances.')
