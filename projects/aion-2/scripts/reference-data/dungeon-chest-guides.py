"""Join mapped reward objects to their own dungeon's ordered event objectives."""
from collections import defaultdict
import hashlib
from importlib import import_module
import json
from pathlib import Path
from context import value, write


def event_guide(ctx, event, object_ids):
    """Stage/step arrays establish sequence; localization suffixes do not."""
    encounter = import_module('dungeon-encounters')
    steps, completion = [], set()
    for stage in event['Stages']:
        for step in stage['Steps']:
            objectives = step.get('Objectives', [])
            visible = [o for o in objectives if o.get('ShowUI') and ctx.text(o.get('Desc'))]
            descriptions = [(o['Desc'], bool(o.get('Optional'))) for o in visible]
            if not descriptions and ctx.text(step.get('Desc')):
                descriptions = [(step['Desc'], False)]
            for source_key, optional in descriptions:
                identity = hashlib.sha256(f'{event["Name"]}:{stage["Id"]}:{step["Id"]}:{source_key}'.encode()).hexdigest()[:16]
                key = 'dungeon-objective-' + identity
                ctx.labels[key] = ctx.text(source_key)
                steps.append({'label': 'reference.labels.' + key, 'optional': optional})
            required = [o for o in objectives if not o.get('Optional')]
            for objective in required:
                clears = any(d['Type'] == 'DungeonClear' for d in objective.get('PostDirectives', []))
                clears |= len(required) == 1 and any(d['Type'] == 'DungeonClear' for d in step.get('PostDirectives', []))
                args = encounter.values(objective)
                if clears and objective['Type'] == 'UseEnvObj' and len(args) > 1 and args[1] == '1':
                    # A composite target is not proof that one particular chest clears the dungeon.
                    names = encounter.tokens(args[0])
                    if len(names) == 1 and next(iter(names)) in object_ids:
                        completion.add(object_ids[next(iter(names))])
    return {'steps': steps, 'completionObjectIds': sorted(completion)}


def build(ctx, map_events):
    for entry in ctx.entries.values():
        entry.pop('chestGuide', None)
    chests = import_module('world-object-rewards').chest_rows(ctx)
    object_ids = {r['Name']: 'EnvObjData:' + identity for identity, r in chests.items()}
    dungeons = defaultdict(list)
    for row in ctx.rows('Dungeon'):
        entry = ctx.entries.get('Dungeon:' + str(value(row['ID'])))
        if entry and entry.get('adventure', {}).get('listed'):
            dungeons[value(row['MapId'])].append((row, entry))
    events = {}
    for path in sorted(Path(map_events).glob('*.json')):
        raw = path.read_bytes()
        export = json.loads(raw)
        data = export['data']
        if data['Name'] in events:
            raise ValueError('Duplicate event name: ' + data['Name'])
        events[data['Name']] = (data, {'asset': export['asset'], 'sha256': hashlib.sha256(raw).hexdigest()})
    if not events:
        raise ValueError('No decoded map events found: ' + str(map_events))
    contexts = defaultdict(lambda: defaultdict(list))
    used = {}
    for path in sorted((ctx.public / 'maps').glob('*/metadata.json')):
        metadata = json.loads(path.read_text('utf8'))
        insets = {inset['id']: inset for inset in metadata.get('insets', [])}
        for point in metadata['locations']:
            identity = point.get('reference', {}).get('id', '')
            if identity.removeprefix('EnvObjData:') not in chests:
                continue
            inset = insets.get(point.get('insetId'))
            if not inset or point.get('sourceAsset') != inset['sourceMap']:
                continue
            candidates = dungeons.get(inset['worldMapId'], [])
            if len(candidates) != 1:
                continue
            row, dungeon = candidates[0]
            indicator_events = [events[name] for name in row['IndicatorMapEventList'] if name in events]
            # Multiple event graphs need an explicit inter-event sequence before a linear guide is safe.
            if len(indicator_events) != 1 or indicator_events[0][0]['MapID'] != inset['worldMapId']:
                continue
            if dungeon['id'] not in used:
                data, source = indicator_events[0]
                guide = event_guide(ctx, data, object_ids)
                if not guide['steps']:
                    continue
                dungeon['chestGuide'] = guide
                used[dungeon['id']] = {'dungeonId': dungeon['id'], 'mapId': inset['worldMapId'], 'event': source,
                                       'stepCount': len(guide['steps']), 'completionObjectIds': guide['completionObjectIds']}
            contexts[identity][(dungeon['id'], path.parent.name)].append(point['id'])
    for entry in ctx.entries.values():
        if 'rewardObject' not in entry:
            continue
        entry['rewardObject'].pop('dungeonContexts', None)
        if entry['id'] in contexts:
            entry['rewardObject']['dungeonContexts'] = [
                {'dungeonId': dungeon_id, 'mapId': map_id, 'markerIds': sorted(set(markers))}
                for (dungeon_id, map_id), markers in sorted(contexts[entry['id']].items())]
    report = {'version': 1, 'dungeons': list(used.values()),
              'markerCount': sum(len(set(markers)) for groups in contexts.values() for markers in groups.values())}
    write(ctx.public / 'data/reference/dungeon-chest-guide-audit.json', report)
    return report
