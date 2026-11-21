"""Publish quest access and exact entrance links for instance layers."""
import json
from collections import defaultdict
from context import value


def build(ctx):
    maps = {value(row['ID']): row for row in ctx.rows('Map')}
    entrances = {row['Name']: row for row in ctx.rows('MapEntrance')}
    steps = {value(row['ID']): row for row in ctx.rows('QuestStep')}
    quests = {row['Name']: row for row in ctx.rows('Quest')}
    environment = {value(row['ID']): row for row in ctx.rows('EnvObjData')}
    dungeons_by_name = defaultdict(list)

    for row in ctx.rows('Dungeon'):
        if row['DungeonType'] != 'EDungeonType::InstanceLayer':
            continue
        entry = ctx.entries['Dungeon:' + str(value(row['ID']))]
        dungeons_by_name[row['Name']].append(entry)
        entrance_name = maps[value(row['MapId'])]['EntranceName']
        entrance = entrances[entrance_name]
        access = {}
        for cell in entrance['QuestStepIdList']:
            step_id = value(cell)
            step = steps[step_id]
            quest_row = quests[step['QuestName']]
            quest = ctx.entries['Quest:' + str(value(quest_row['ID']))]
            access.setdefault(quest['id'], {key: quest[key] for key in ('id', 'category', 'name')})
        entry['instanceLayer'] = {'questAccess': list(access.values())}
        for quest_link in access.values():
            quest = ctx.entries[quest_link['id']]
            title = 'reference.instanceLayer.questInstances'
            section = next((section for section in quest['sections'] if section['title'] == title), None)
            if section is None:
                section = {'title': title, 'links': []}
                quest['sections'].append(section)
            if not any(link['id'] == entry['id'] for link in section['links']):
                section['links'].append({key: entry[key] for key in ('id', 'category', 'name')})

    # A native spawn actor named exactly after an instance layer identifies its
    # door even when the object's UsageValue is an undecoded control character.
    for path in sorted((ctx.public / 'maps').glob('*/metadata.json')):
        metadata = json.loads(path.read_text('utf8'))
        for marker in metadata.get('locations', []):
            actor = marker.get('sourceActor', '')
            reference = marker.get('reference', {}).get('id', '')
            if not actor.endswith('_EnterDoor') or not reference.startswith('EnvObjData:'):
                continue
            env_id = int(reference.split(':', 1)[1])
            env = environment.get(env_id)
            if not env or env['Usage'] != 'EEnvObjectUsage::EnterInstanceLayer':
                continue
            matches = dungeons_by_name.get(actor[:-len('_EnterDoor')], [])
            if len(matches) != 1:
                continue
            dungeon = matches[0]
            door = ctx.entries.get(reference)
            if not door:
                continue
            title = 'reference.adventure.entranceDestinations'
            sections = [section for section in door['sections'] if section['title'] == title]
            if sections and any(link['id'] != dungeon['id'] for section in sections
                                for link in section.get('links', [])):
                continue
            door['sections'] = [section for section in door['sections'] if section['title'] != title]
            door['sections'].append({'title': title, 'links': [
                {key: dungeon[key] for key in ('id', 'category', 'name')}]})
            location = {'mapId': path.parent.name, 'markerId': marker['id'],
                        'name': metadata['displayName'] + ' \u00b7 ' + marker['name']}
            existing = next((point for point in dungeon['locations']
                             if point['mapId'] == location['mapId'] and point['markerId'] == location['markerId']), None)
            if existing:
                existing['name'] = location['name']
            else:
                dungeon['locations'].append(location)
