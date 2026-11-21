"""Attach native boss loot previews and map-matched dungeon cube rewards."""
import argparse
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import write


DROP_TITLE = 'reference.labels.possible-drops'
CUBE_TITLE = 'reference.labels.dungeon-rewards'
SOURCE_TABLES = ('NpcData', 'NpcLoot', 'Dungeon', 'RewardOdEnergyCube',
                 'RewardItem', 'RewardPackage', 'RewardPackageItem', 'Item')


def read(path):
    return json.loads(path.read_text(encoding='utf8'))


def refresh(audit_path, tables_path, public_path):
    audit = read(audit_path)
    for name in SOURCE_TABLES:
        path = tables_path / f'{name}.json'
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if audit['tables'][name]['sha256'] != actual:
            raise ValueError(f'Native source hash mismatch: {name}')

    expected = {f"NpcData:{boss['npcId']}": {marker['markerId'] for marker in boss['markers']}
                for boss in audit['bosses']}
    actual = defaultdict(set)
    for path in (public_path / 'maps').glob('*/metadata.json'):
        for marker in read(path)['locations']:
            reference = marker.get('reference', {}).get('id', '')
            if marker['category'] == 'dungeon-boss' and reference.startswith('NpcData:'):
                actual[reference].add(marker['id'])
    if expected != dict(actual):
        raise ValueError('Bosses filter markers differ from the audited native source')

    items = {int(item['id']): item for item in read(public_path / 'data/items/catalog.json')['items']}
    chunks = {}
    for path in (public_path / 'data/reference/creatures').glob('*.json'):
        data = read(path)
        for entry_id in data['entries']:
            if entry_id in expected:
                chunks[entry_id] = (path, data)
    if set(chunks) != set(expected):
        raise ValueError('Some audited bosses have no creature reference entry')

    changed = set()
    preview_bosses = cube_bosses = 0
    for boss in audit['bosses']:
        entry_id = f"NpcData:{boss['npcId']}"
        path, data = chunks[entry_id]
        entry = data['entries'][entry_id]
        sections = entry['sections']
        known = {link['id'] for section in sections if section['title'] in
                 (DROP_TITLE, 'reference.labels.guaranteed-drops')
                 for link in section.get('links', [])}
        new_loot = sorted(set(boss['npcLootIds']) - {int(item_id) for item_id in known}
                          - set(boss['vehicleSoulIds']))
        if new_loot:
            section = next((section for section in sections if section['title'] == DROP_TITLE), None)
            if section is None:
                section = {'title': DROP_TITLE, 'links': []}
                sections.append(section)
            section['links'].extend(item_link(items, item_id) for item_id in new_loot)
            preview_bosses += 1
            changed.add(path)

        previous = next((section for section in sections if section['title'] == CUBE_TITLE), None)
        sections[:] = [section for section in sections if section['title'] != CUBE_TITLE]
        roles = boss['cubeRoles']
        if len(roles) > 1:
            raise ValueError(f'Ambiguous cube roles for {entry_id}')
        if roles:
            role = roles[0]
            if set(role['matchedMarkerIds']) != expected[entry_id]:
                raise ValueError(f'Cube reward does not match every marker for {entry_id}')
            item_ids = sorted({item['itemId'] for item in role['items']})
            if not item_ids:
                raise ValueError(f'Empty cube reward pool for {entry_id}')
            sections.append({
                'title': CUBE_TITLE,
                'summaryNotice': 'reference.dungeon.bossCubeNotice',
                'facts': [{'label': 'reference.labels.reward-ticket-cost', 'value': role['ticketCost']}],
                'markerIds': sorted(role['matchedMarkerIds']),
                'links': [item_link(items, item_id) for item_id in item_ids],
            })
            cube_bosses += 1
        if previous != next((section for section in sections if section['title'] == CUBE_TITLE), None):
            changed.add(path)

    for path in sorted(changed):
        data = next(data for file_path, data in chunks.values() if file_path == path)
        write(path, data)
    print(json.dumps({'bosses': len(audit['bosses']), 'newPreviewBosses': preview_bosses,
                      'dungeonCubeBosses': cube_bosses, 'changedChunks': len(changed)}))


def item_link(items, item_id):
    item = items.get(item_id)
    if not item:
        raise ValueError(f'Native reward item missing from app catalog: {item_id}')
    return {key: item[key] for key in ('id', 'name', 'icon') if key in item} | {'category': 'items'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audit', required=True, type=Path)
    parser.add_argument('--tables', required=True, type=Path)
    parser.add_argument('--public', default='public', type=Path)
    args = parser.parse_args()
    refresh(args.audit, args.tables, args.public)
