"""Verify source-specific loot previews and exact legacy marker recovery."""
import argparse
import copy
import hashlib
import importlib
import json
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import value

rewards = importlib.import_module('creature-rewards')
legacy = importlib.import_module('legacy-creature-references')


def test_builders():
    rate = {'kind': 'direct', 'percent': 3, 'quantityMin': 1, 'quantityMax': 1}
    entry = {'id': 'NpcData:1', 'category': 'creatures', 'locations': [], 'sections': [
        {'title': 'reference.labels.possible-drops', 'links': [{'id': '10', 'rewardRates': [rate]}]}]}
    duplicate = {'id': 'NpcData:2', 'category': 'creatures', 'locations': [], 'sections': []}
    loot = [{'NpcId': {'Value': 1}, 'VehicleSoulItemId': {'Value': 12},
             'LootList': [{'Value': i} for i in (10, 11, 11, 12)]}]
    npcs = [{'ID': {'Value': 1}, 'Name': 'native-one'}, {'ID': {'Value': 2}, 'Name': 'native-two'}]
    ctx = SimpleNamespace(entries={e['id']: e for e in (entry, duplicate)},
        rows=lambda name: loot if name == 'NpcLoot' else npcs,
        link=lambda table, cell: {'id': str(value(cell)), 'category': 'items', 'name': 'Material (Bound)'})
    assert rewards.build(ctx) == [{'creature': 'NpcData:1', 'item': '11'}]
    links = entry['sections'][0]['links']
    assert len(links) == 2 and links[0]['rewardRates'] == [rate]
    assert 'quantity' not in links[1] and 'rewardRates' not in links[1]
    assert links[1]['name'] == 'Material (Bound)'
    assert not duplicate['sections'] and not rewards.build(ctx)
    marker_id = 'region-enemy-' + hashlib.sha1(b'region/enemy/native-one/10/20').hexdigest()[:16]
    point = {'id': marker_id, 'name': 'Shared display name', 'category': 'enemy', 'x': 10, 'y': 20}
    unproven = {**point, 'id': 'unproven'}
    metadata = {'displayName': 'Region', 'locations': [point, unproven]}
    assert len(legacy.restore(ctx, metadata, 'region')) == 1
    assert point['reference']['id'] == 'NpcData:1' and 'reference' not in unproven
    assert point['id'] == marker_id and (point['x'], point['y']) == (10, 20)
    assert entry['locations'][0]['markerId'] == marker_id and not duplicate['locations']
    snapshot = copy.deepcopy(metadata)
    assert not legacy.restore(ctx, metadata, 'region') and metadata == snapshot


def test_published(tables):
    read = lambda path: json.loads(path.read_text('utf8'))
    root = Path('public/data/reference')
    entries = {key: entry for path in (root / 'creatures').glob('*.json') for key, entry in read(path)['entries'].items()}
    catalog = read(root / 'map-companion-sources.json')['sources']
    for companion_id, companion in read(root / 'intelligence/companions.json')['entries'].items():
        if companion['available']:
            for source in companion['sources']:
                assert any(row['companion']['id'] == companion_id for row in catalog.get(source['npc']['id'], [])), source['npc']['id']
    for path in Path('public/maps').glob('*/metadata.json'):
        for point in read(path)['locations']:
            if point['category'] in ('enemy', 'boss', 'dungeon-boss'):
                assert point.get('reference', {}).get('id') in entries, point['id']
    if tables:
        for row in read(Path(tables) / 'NpcLoot.json')['Properties']['Data']:
            entry = entries.get('NpcData:' + str(value(row['NpcId'])))
            if not entry:
                continue
            known = {link['id'] for section in entry['sections'] if section['title'] in rewards.DROP_TITLES
                     for link in section.get('links', [])}
            expected = {str(value(cell)) for cell in row['LootList']} - {str(value(row['VehicleSoulItemId']))}
            assert expected <= known, (entry['id'], expected - known)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables')
    args = parser.parse_args()
    test_builders()
    test_published(args.tables)
    print('Creature rewards preserve source identities, known rates, unknown quantities and unmapped souls.')
