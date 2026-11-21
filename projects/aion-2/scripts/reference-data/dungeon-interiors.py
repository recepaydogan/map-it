"""Link exact dungeon map IDs to published interior images and region targets."""
from collections import defaultdict
import json
from context import value


def attach(entries, dungeon_rows, maps, event_entrances=None, event_summaries=None):
    interiors = defaultdict(list)
    event_areas = {}
    for slug, metadata in sorted(maps.items()):
        regions = {region['id'] for region in metadata.get('regions', []) if region.get('inset')}
        for region in metadata.get('regions', []):
            if region['id'].startswith('event-layer-'):
                map_id = int(region['id'].removeprefix('event-layer-'))
                event_areas[map_id] = {'mapId': slug, 'regionId': region['id'],
                                       'nameKey': 'mapInteriors.names.' + str(map_id)}
        for inset in metadata.get('insets', []):
            if inset['id'] in regions:
                interiors[inset['worldMapId']].append({
                    'mapId': slug, 'insetId': inset['id'], 'nameKey': inset['nameKey']})
    count = 0
    for row in dungeon_rows:
        entry = entries.get('Dungeon:' + str(value(row['ID'])))
        if not entry:
            continue
        entry.pop('interiorMaps', None)
        entry.pop('relatedInteriorMaps', None)
        entry.pop('eventArea', None)
        targets = interiors.get(value(row['MapId']))
        if targets:
            entry['interiorMaps'] = targets
            count += 1
        if value(row['MapId']) in event_areas:
            entry['eventArea'] = event_areas[value(row['MapId'])]
    if event_entrances and event_summaries:
        by_family = defaultdict(dict)
        for entrance in event_entrances.values():
            activity = event_summaries[entrance['eventId']]['activity']
            key = (activity['familyId'], activity['faction'])
            if interiors.get(entrance['mapId']):
                by_family[key][entrance['mapId']] = interiors[entrance['mapId']]
        for entrance in event_entrances.values():
            if interiors.get(entrance['mapId']):
                continue
            activity = event_summaries[entrance['eventId']]['activity']
            matches = by_family[(activity['familyId'], activity['faction'])]
            if len(matches) != 1:
                raise ValueError('Expected one image-backed map for event family ' + entrance['eventId'])
            destination = entries.get(entrance.get('destinationId'))
            if destination:
                destination['relatedInteriorMaps'] = next(iter(matches.values()))
    return count


def build(ctx):
    maps = {path.parent.name: json.loads(path.read_text('utf8'))
            for path in sorted((ctx.public / 'maps').glob('*/metadata.json'))}
    catalog_path = ctx.public / 'data/event-entrances.json'
    index_path = ctx.public / 'data/reference/index.json'
    entrances = json.loads(catalog_path.read_text('utf8'))['npcs'] if catalog_path.exists() else None
    summaries = {summary['id']: summary for summary in json.loads(index_path.read_text('utf8'))['entries']}
    return attach(ctx.entries, ctx.rows('Dungeon'), maps, entrances, summaries)
