"""Add a client-verified direct reward to its linked dungeon reference entries."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import write  # noqa: E402


def rows(folder, table):
    return json.loads((folder / f'{table}.json').read_text(encoding='utf-8-sig'))['Properties']['Data']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', type=Path, required=True)
    parser.add_argument('--item-id', type=int, required=True)
    args = parser.parse_args()

    public = Path(__file__).resolve().parents[1] / 'public'
    item = next(row for row in rows(args.tables, 'Item') if row['ID']['Value'] == args.item_id)
    route = next(row for row in rows(args.tables, 'ItemGetRoute') if row['ItemId']['Value'] == args.item_id)
    dungeon_ids = {cell['Value'] for group in route['PartyDungeonGetRoutes']
                   for cell in group['Value']['TableIds']}
    if not dungeon_ids:
        raise ValueError(f'Item {args.item_id} has no party dungeon routes')

    dungeons = {row['ID']['Value']: row for row in rows(args.tables, 'Dungeon')}
    rewards = {row['Name']: row for row in rows(args.tables, 'RewardItem')}
    catalog = json.loads((public / 'data/items/catalog.json').read_text(encoding='utf-8'))
    catalog_item = next(row for row in catalog['items'] if row['id'] == str(args.item_id))
    index = json.loads((public / 'data/reference/index.json').read_text(encoding='utf-8'))
    summaries = {row['id']: row for row in index['entries']}
    changed = {}
    title = 'reference.labels.event-completion-rewards'

    for dungeon_id in sorted(dungeon_ids):
        dungeon = dungeons[dungeon_id]
        cube = dungeon['RewardOdEnergyCube']
        if not cube.startswith('reward_'):
            raise ValueError(f'Dungeon {dungeon_id} has no recognizable reward group')
        group = 'REWARD_PARTYDUNGEON_' + cube.removeprefix('reward_').upper() + '_BOSS'
        matching = [reward for reward in rewards[group]['Items'] if reward['ItemName'] == item['Name']]
        if len(matching) != 1 or matching[0]['ItemProb'] != 100_000_000 \
                or matching[0]['ItemCountMin'] != matching[0]['ItemCountMax']:
            raise ValueError(f'Dungeon {dungeon_id} has no fixed direct reward for item {args.item_id}')

        reference_id = f'Dungeon:{dungeon_id}'
        chunk = summaries[reference_id]['chunk']
        path = public / 'data/reference/dungeons' / f'{chunk}.json'
        data = changed.setdefault(path, json.loads(path.read_text(encoding='utf-8')))
        entry = data['entries'][reference_id]
        link = {'id': str(args.item_id), 'name': catalog_item['name'], 'category': 'items',
                'icon': catalog_item['icon'], 'quantity': matching[0]['ItemCountMin']}
        entry['sections'] = [section for section in entry['sections'] if section['title'] != title]
        entry['sections'].append({'title': title, 'summaryNotice': 'reference.dungeon.eventRewardNotice',
                                  'links': [link]})

    for path, data in changed.items():
        write(path, data)
    print(f'Updated {len(dungeon_ids)} dungeon entries in {len(changed)} reference chunks.')


if __name__ == '__main__':
    main()
