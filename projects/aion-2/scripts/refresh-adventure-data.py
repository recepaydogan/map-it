"""Refresh adventure presentation without modifying travel records or routes."""
import argparse
import hashlib
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, write


def refresh(tables, localization, public, spawns=None):
    root = Path(public) / 'data/reference'
    if spawns and any(json.loads(path.read_text('utf8')).get('nativeMarkerImportVersion')
                      for path in (Path(public) / 'maps').glob('*/metadata.json')):
        raise ValueError('These maps use canonical MapData coordinates. Refresh markers with refresh-world-markers.py; omit --spawns to refresh presentation only.')
    manifest = json.loads((root / 'manifest.json').read_text('utf8'))
    required = {'Dungeon', 'Quest', 'QuestStep', 'Map', 'MapEntrance', 'EnvObjData', 'NpcData', 'Subzone'}
    for source in manifest['tables']:
        if source['name'] in required:
            path = Path(tables) / (source['name'] + '.json')
            if hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
                raise ValueError('Source version mismatch: ' + source['name'])
    ctx = Context.__new__(Context)
    ctx.tables, ctx.public, ctx.cache, ctx.entries = Path(tables), Path(public), {}, {}
    ctx.strings = {k.casefold(): v for k, v in json.loads(Path(localization).read_text('utf8'))['Entries'].items()}
    categories = {'quests', 'dungeons', 'creatures', 'exploration'}
    for category in categories:
        for path in (root / category).glob('*.json'):
            ctx.entries.update(json.loads(path.read_text('utf8'))['entries'])
    importlib.import_module('adventure-identities').build(ctx)
    if spawns:
        importlib.import_module('adventure-markers').build(ctx, Path(spawns))

    def update(node):
        if isinstance(node, list):
            for child in node:
                update(child)
        elif isinstance(node, dict):
            target = ctx.entries.get(node.get('id'))
            if target and node.get('category') == target['category']:
                if 'sections' in node:
                    node.update(target)
                elif 'chunk' in node:
                    node['name'] = target['name']
                    node['unnamed'] = target['unnamed']
                    if 'adventure' in target:
                        node['adventure'] = target['adventure']
                    if target['category'] in ('creatures', 'exploration'):
                        node.pop('mapLocations', None)
                elif 'name' in node:
                    node['name'] = target['name']
            for child in node.values():
                if isinstance(child, (dict, list)):
                    update(child)

    changed = 0
    for path in root.rglob('*.json'):
        if path.parent.name == 'travel' or path.name.startswith('travel-'):
            continue
        data = json.loads(path.read_text('utf8'))
        before = json.dumps(data, ensure_ascii=False)
        update(data)
        if json.dumps(data, ensure_ascii=False) != before:
            write(path, data)
            changed += 1
    print(f'Updated adventure identities and links in {changed} files.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--localization', required=True)
    parser.add_argument('--public', default='public')
    parser.add_argument('--spawns')
    args = parser.parse_args()
    refresh(args.tables, args.localization, args.public, args.spawns)
