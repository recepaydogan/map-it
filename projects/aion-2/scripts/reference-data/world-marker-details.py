"""Publish readable object details and exact entrance relationships."""
from collections import defaultdict
from importlib import import_module
from context import value


def register(ctx):
    sources = import_module('world-marker-sources')
    bosses = {row['FieldNamedName'] for row in ctx.rows('WorldMapFieldNamed')}
    objectives = {token.strip() for row in ctx.rows('QuestStep') for goal in row['GoalList']
                  for cell in goal['Value'] for token in cell.split(',')}
    for row in ctx.rows('EnvObjData'):
        identity = 'EnvObjData:' + str(value(row['ID']))
        if identity in ctx.entries:
            continue
        category = sources.classify('EnvObjData', row, {}, bosses)
        if category in sources.TRAVEL_CATEGORIES or not (category or row['Name'] in objectives):
            continue
        name = ctx.text(row['Desc'])
        if not name:
            continue
        ctx.entry('EnvObjData', row, 'exploration', name=name,
                  description=ctx.text(row['InteractDesc'].get('StringKey')) or ctx.text(row['InteractDesc']),
                  fields={'Level': 'Required level', 'CombatPower': 'Required combat power', 'bGetRewardOnce': 'One-time reward'})


def connect_entrances(ctx):
    dungeon_ids = {str(value(row['ID'])): ctx.entries['Dungeon:' + str(value(row['ID']))] for row in ctx.rows('Dungeon')}
    maps = {value(row['ID']): row for row in ctx.rows('Map')}
    targets = defaultdict(dict)
    for row in ctx.rows('Dungeon'):
        entry = dungeon_ids[str(value(row['ID']))]
        map_row = maps.get(value(row['MapId']), {})
        for key in (str(value(row['MapId'])), row['Name'], map_row.get('Name'), map_row.get('EntranceName')):
            if key and key != 'None':
                targets[key][entry['id']] = entry
    for table, rows in (('EnvObjData', ctx.rows('EnvObjData')), ('NpcData', ctx.rows('NpcData'))):
        for row in rows:
            kind = row.get('Usage', row.get('FunctionType', '')).split('::')[-1]
            if kind not in ('EnterDungeon', 'EnterInstanceLayer'):
                continue
            token = row['UsageValue'] if table == 'EnvObjData' else next(iter(row['FuncValues']), '')
            # Preserve undecoded control characters as unresolved; do not interpret
            # them as numeric dungeon IDs or copy a sibling mode by its name.
            if not token or any(ord(char) < 32 for char in token):
                continue
            linked = [dungeon_ids[token]] if token in dungeon_ids else list(targets.get(token, {}).values())
            entry = ctx.entries.get(table + ':' + str(value(row['ID'])))
            if not entry or not linked:
                continue
            entry['sections'] = [section for section in entry['sections'] if section['title'] != 'reference.adventure.entranceDestinations']
            entry['sections'].append({'title': 'reference.adventure.entranceDestinations', 'links': [
                {key: dungeon[key] for key in ('id', 'name', 'category')} for dungeon in linked]})


def gathering(ctx):
    sources = {row['Name']: row for row in ctx.rows('GatherSource')}
    materials = defaultdict(list)
    for row in ctx.rows('GatherSourceMaterial'):
        materials[row['MaterialGroup']].append(row)
    result = {}
    categories = import_module('world-marker-sources').GATHER_CATEGORIES
    for row in ctx.rows('EnvObjData'):
        if not row['Usage'].endswith('::GatherSource'):
            continue
        entry = ctx.entries.get('EnvObjData:' + str(value(row['ID'])))
        source = sources.get(row['UsageValue'])
        if not source or not entry:
            continue
        links = {}
        for material in materials[source['MaterialGroup']]:
            link = ctx.link('Item', material['MaterialName'])
            if link:
                links[link['id']] = link
        category = categories.get(source['SourceType'].split('::')[-1], 'native-resource')
        result[entry['id']] = {'category': category, 'itemIds': set(links)}
        if links:
            entry['sections'] = [section for section in entry['sections'] if section['title'] != 'reference.adventure.gatheringResults']
            entry['sections'].append({'title': 'reference.adventure.gatheringResults', 'links': list(links.values())})
    return result


def quest_points(ctx, map_id, data):
    quests = {row['Name']: ctx.entries.get('Quest:' + str(value(row['ID']))) for row in ctx.rows('Quest')}
    positions = {row['Key']: row['Value']['Location'] for row in data.get('QuestMovePointDataMap', [])}
    seen = set()
    for step in ctx.rows('QuestStep'):
        quest = quests.get(step['QuestName'])
        if not quest or not quest.get('adventure', {}).get('listed'):
            continue
        for goal in step['GoalList']:
            actor = goal['QuestMovePointName']
            if value(goal['MapId']) != map_id or not goal['bMarker'] or goal['bHideUI'] or actor == 'None':
                continue
            position = positions.get(actor)
            if position is None and goal['Type'].endswith('::ClearMapEvent'):
                event_map = getattr(ctx, 'map_events', {}).get(goal['Value'][0])
                areas = [area['Value'] for area in data.get('InstanceLayerVolumeInfoMap', [])
                         if value(area['Value']['MapId']) == event_map and value(area['Value']['BaseMapId']) == map_id]
                if len(areas) == 1:
                    position = areas[0]['Location']
            if position is None:
                raise ValueError(f'Missing quest objective position: {map_id}/{actor}')
            key = (quest['id'], actor)
            if key not in seen:
                seen.add(key)
                yield quest, actor, position
