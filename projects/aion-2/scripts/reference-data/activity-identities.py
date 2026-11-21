"""Publish readable activity identities and explicit source-defined families."""
from context import human, value


def build(ctx):
    maps = {value(row['ID']): row for row in ctx.rows('Map')}
    npcs = {row['Name']: row for row in ctx.rows('NpcData')}
    for row in ctx.rows('FieldEvent'):
        entry = ctx.entries['FieldEvent:' + str(value(row['ID']))]
        title = ctx.text(row['Title'])
        if title:
            entry['name'] = title
        map_row = maps.get(value(row['MapId']), {})
        entry['activity'] = {
            'kind': 'event',
            # Unclassified client records are retained for links, not normal browsing.
            'listed': row['FieldEventKind'] != 'EFieldEventKind::None',
            'familyId': 'event:' + (row['Title']['Key'] if title else str(value(row['ID']))),
            'region': ctx.text(map_row.get('Desc')),
            'faction': human(map_row.get('MapRace', '')).lower(),
        }
    for row in ctx.rows('BossChallengeContents'):
        entry = ctx.entries['BossChallengeContents:' + str(value(row['ID']))]
        npc = npcs.get(row['SpawnNpc'], {})
        entry['name'] = ctx.text(npc.get('Desc')) or entry['name']
        entry['activity'] = {**entry.get('activity', {}), 'kind': 'challenge', 'familyId': 'challenge:' + row['GroupName'], 'level': row['Level']}
