"""Recover source identities only when the original marker digest proves them."""
import hashlib
from context import value


def restore(ctx, metadata, map_id):
    restored = []
    for point in metadata['locations']:
        if point['category'] not in ('enemy', 'boss', 'dungeon-boss') or point.get('reference'):
            continue
        matches = []
        for npc in ctx.rows('NpcData'):
            identity = 'NpcData:' + str(value(npc['ID']))
            if identity not in ctx.entries:
                continue
            original = f'{map_id}/{point["category"]}/{npc["Name"]}/{point["x"]}/{point["y"]}'
            digest = hashlib.sha1(original.encode()).hexdigest()[:16]
            if point['id'] == f'{map_id}-{point["category"]}-{digest}':
                matches.append(identity)
        if len(matches) > 1:
            raise ValueError('Ambiguous legacy creature identity: ' + point['id'])
        if not matches:
            continue
        entry = ctx.entries[matches[0]]
        point.update({'reference': {'id': entry['id'], 'category': entry['category']},
                      'entityId': entry['id'].split(':', 1)[1]})
        location = {'mapId': map_id, 'markerId': point['id'], 'name': metadata['displayName'] + ' · ' + point['name']}
        if not any(row['mapId'] == map_id and row['markerId'] == point['id'] for row in entry['locations']):
            entry['locations'].append(location)
        restored.append({'mapId': map_id, 'marker': point['id'], 'creature': entry['id']})
    return restored
