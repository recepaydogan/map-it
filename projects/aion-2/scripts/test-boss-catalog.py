"""Check reward-grade preservation, boss schedules, and optional source fidelity."""
import argparse
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, value

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tables')
parser.add_argument('--localization')
args = parser.parse_args()
root = Path(__file__).parent.parent / 'public/data/reference'
index = json.loads((root / 'index.json').read_text('utf8'))
entries = {}
for category in ('activities', 'creatures'):
    for path in (root / category).glob('*.json'):
        entries.update(json.loads(path.read_text('utf8'))['entries'])
challenges = [entry for entry in entries.values() if entry.get('activity', {}).get('kind') == 'challenge']
bosses = [entry for entry in entries.values() if entry.get('worldBoss')]
assert len(challenges) == 260
assert len({entry['activity']['familyId'] for entry in challenges}) == 26
assert len(bosses) == 85
from collections import Counter
records = [record for entry in bosses for record in entry['worldBoss']]
assert Counter(record['spawnType'] for record in records) == {'Basic': 73, 'PeriodSpawn': 12}
assert Counter(record['level'] for record in records if record['spawnType'] == 'Basic') == {45: 46, 51: 2, 65: 1, 80: 24}
assert all(record['berserkEnabled'] is False for record in records)
assert entries['NpcData:2400074']['worldBoss'][0]['spawnType'] == 'Basic'
assert 'schedule' not in entries['NpcData:2400074']['worldBoss'][0]
assert entries['NpcData:2600520']['worldBoss'][0]['region'] == 'Chaotic Middle Reshanta'

for entry in challenges:
    assert entry['activity']['tier'] in (1, 2, 3, 4)
    assert entry['activity']['bossLevel'] > 0
    assert entry['activity']['region']
    assert entry['description']
    rewards = [s for s in entry['sections'] if s['title'] in ('reference.labels.first-clear-rewards', 'reference.labels.repeat-rewards')]
    assert len(rewards) == 2, entry['id']
    for section in rewards:
        rows = section.get('rows', [])
        assert len({r['name'] for r in rows}) == len(rows)
        links = section.get('links', []) + [link for row in rows for link in row['links']]
        assert links and all(link['quantity'] > 0 and 'rewardRates' not in link for link in links)
pinopi = entries['BossChallengeContents:100101']
first = next(s for s in pinopi['sections'] if s['title'] == 'reference.labels.first-clear-rewards')
repeat = next(s for s in pinopi['sections'] if s['title'] == 'reference.labels.repeat-rewards')
assert first['links'][0]['quantity'] == 500
assert first['links'][0]['name'] == 'Phantasmal Fragment'
assert {row['name']: row['links'][0]['quantity'] for row in repeat['rows']} == {
    '0': 100, '1': 250, '2': 230, '3': 210, '4': 185, '5': 170,
    '6': 155, '7': 145, '8': 130, '9': 120, '10': 110, '11': 100,
}
assert entries['NpcData:2600520']['worldBoss'][0]['schedule']['days'] == [1, 4, 6]
assert entries['NpcData:2600520']['worldBoss'][0]['schedule']['time'] == '21:30'
assert entries['NpcData:2600520']['locations'] == [{
    'mapId': 'dungeon-atlas',
    'markerId': 'interior-22-18fa7ebdf9821c56',
    'name': 'Chaotic Middle Reshanta · Executioner Dramos',
}]
for summary in index['entries']:
    if summary['id'] in entries:
        for field in ('activity', 'worldBoss'):
            assert summary.get(field) == entries[summary['id']].get(field)

if args.tables or args.localization:
    assert args.tables and args.localization, 'Supply both source arguments'
    ctx = Context(args.tables, args.localization, root.parent.parent)
    ctx.entries = entries
    before = json.dumps(entries, sort_keys=True)
    builder = importlib.import_module('boss-catalog')
    builder.build(ctx)
    assert json.dumps(entries, sort_keys=True) == before, 'Published records must match exact source joins'
    builder.build(ctx)
    assert json.dumps(entries, sort_keys=True) == before, 'A repeated import must not duplicate rewards or regions'
    # Reject a schedule attached to the right NPC but the wrong world map.
    period = next(r for r in ctx.rows('PeriodSpawn') if value(r['ID']) == 1153)
    period['MapId'] = {'Value': 20}
    try:
        builder.build(ctx)
    except ValueError as error:
        assert 'map/spawner' in str(error)
    else:
        raise AssertionError('A mismatched schedule must fail')
print(f'Boss catalog verified: {len(challenges)} challenge levels, {len(bosses)} world bosses.')
