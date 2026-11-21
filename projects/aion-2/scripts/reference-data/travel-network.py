"""Resolve travel presentation and reciprocal markers using explicit reference links."""
import re
from collections import defaultdict


KINDS = {'TeleportArtifact': 'teleport', 'NpcTeleport': 'npc', 'RiftData': 'rift', 'EnvObjData': 'portal'}


def linked_travel(entry, entries):
    ids = [entry['id']] if entry.get('category') == 'travel' else [
        link['id'] for section in entry.get('sections', [])
        if section['title'] in ('reference.labels.related-content', 'reference.labels.destinations')
        for link in section.get('links', []) if link['category'] == 'travel'
    ]
    return [entries[key] for key in dict.fromkeys(ids)]


def enrich(entries, maps):
    travel = {key: entry for key, entry in entries.items() if entry['category'] == 'travel'}
    locations = defaultdict(dict)
    unresolved = []
    marker_count = 0
    # Source positions come only from actual markers and explicit object/NPC links.
    # A destination actor or a matching display name is never a source position.
    for slug, metadata in sorted(maps.items()):
        for marker in metadata['locations']:
            if marker['category'] not in ('teleport', 'rift', 'portal'):
                continue
            marker_count += 1
            source = entries.get(marker.get('reference', {}).get('id'))
            targets = linked_travel(source, entries) if source else []
            if not targets:
                unresolved.append({'mapId': slug, 'markerId': marker['id']})
            for target in targets:
                locations[target['id']][(slug, marker['id'])] = {
                    'mapId': slug, 'markerId': marker['id'],
                    'name': metadata['displayName'] + ' · ' + marker['name'],
                }
    for key, entry in travel.items():
        entry['locations'] = list(locations[key].values())
        match = re.fullmatch(r'Instantly teleport to (.+?)\.?', entry.get('description', '').strip())
        destination_name = match[1] if match else None
        technical = bool(re.fullmatch(r'(?:Teleport Artifact|Npc Teleport|Rift Data) \d+', entry['name']))
        if technical and destination_name:
            entry['name'] = destination_name
            technical = False
        entry['unnamed'] = technical
        regions = {location['mapId']: maps[location['mapId']]['displayName'] for location in entry['locations']}
        if entry.get('arrival', {}).get('mapId'):
            regions[entry['arrival']['mapId']] = entry['arrival']['mapName']
        for section in entry['sections']:
            if section['title'] == 'reference.labels.destination':
                for link in section.get('links', []):
                    regions[link['id']] = link['name']
        # Merge source and destination region labels without creating guessed coordinates.
        region_names = sorted(set(regions.values()))
        facts = {fact['label']: fact['value'] for fact in entry['facts']}
        entry['travel'] = {
            'kind': KINDS[key.split(':')[0]],
            'faction': facts.get('reference.labels.faction', 'unknown'),
            'regions': region_names, 'hasMarker': bool(entry['locations']),
        }
        if entry.get('route', {}).get('destinationName'):
            entry['travel']['destinationName'] = entry['route']['destinationName']
        elif destination_name:
            entry['travel']['destinationName'] = destination_name
        elif key.startswith('NpcTeleport:'):
            entry['travel']['destinationName'] = entry['name']
        elif entry.get('arrival', {}).get('mapId'):
            entry['travel']['destinationName'] = entry['arrival']['mapName']
    return {
        'version': 1, 'entries': len(travel), 'markers': marker_count,
        'entriesWithMarkers': sum(bool(e['locations']) for e in travel.values()),
        'entriesWithArrivalCoordinates': sum(bool(e.get('arrival', {}).get('points')) for e in travel.values()),
        'navigableArrivals': sum(e.get('arrival', {}).get('status') == 'resolved' for e in travel.values()),
        'regionOnlyArrivals': sorted(e['id'] for e in travel.values() if e.get('arrival', {}).get('status') == 'region-only'),
        'unavailableDestinationMaps': sorted(e['id'] for e in travel.values() if e.get('arrival', {}).get('status') == 'map-unavailable'),
        'unresolvedMarkers': unresolved,
        'entriesWithoutMarkers': sorted(e['id'] for e in travel.values() if not e['locations']),
    }


def refresh_names(node, entries):
    if isinstance(node, list):
        for child in node:
            refresh_names(child, entries)
    elif isinstance(node, dict):
        if node.get('category') == 'travel' and node.get('id') in entries and 'name' in node:
            node['name'] = entries[node['id']]['name']
        for child in node.values():
            if isinstance(child, (dict, list)):
                refresh_names(child, entries)


def build(ctx):
    import json
    from context import write
    maps = {path.parent.name: json.loads(path.read_text('utf8')) for path in (ctx.public / 'maps').glob('*/metadata.json')}
    audit = enrich(ctx.entries, maps)
    write(ctx.public / 'data/reference/travel-audit.json', audit)
