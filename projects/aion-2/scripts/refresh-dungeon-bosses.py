"""Refresh dungeon contents and boss details; leave other reference categories intact."""
import argparse
import hashlib
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, write


def refresh(tables, localization, public, map_data, map_events):
    root = Path(public) / 'data/reference'
    manifest = json.loads((root / 'manifest.json').read_text('utf8'))
    hashes = {source['name']: source['sha256'] for source in manifest['tables']}
    for name in ('Dungeon', 'NpcData', 'RewardOdEnergyCube'):
        digest = hashlib.sha256((Path(tables) / (name + '.json')).read_bytes()).hexdigest()
        if hashes.get(name) != digest:
            raise ValueError('Source version mismatch: ' + name)
    builder = importlib.import_module('dungeon-bosses')
    for name in builder.SOURCE_TABLES:
        if name in hashes and hashes[name] != hashlib.sha256((Path(tables) / (name + '.json')).read_bytes()).hexdigest():
            raise ValueError('Source version mismatch: ' + name)
    ctx = Context(tables, localization, public)
    chunks = {}
    for category in ('dungeons', 'creatures', 'exploration', 'quests'):
        for path in (root / category).glob('*.json'):
            data = json.loads(path.read_text('utf8'))
            ctx.entries.update(data['entries'])
            if category in ('dungeons', 'creatures', 'exploration', 'quests'):
                chunks[path] = (data, json.dumps(data, sort_keys=True))
    builder.build(ctx, map_data, map_events)
    importlib.import_module('instance-layer-details').build(ctx)
    changed = 0
    for path, (data, before) in chunks.items():
        if json.dumps(data, sort_keys=True) != before:
            write(path, data)
            changed += 1
    print(f'Published dungeon and instance-layer details in {changed} reference chunks.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--localization', required=True)
    parser.add_argument('--public', default='public')
    parser.add_argument('--map-data', required=True)
    parser.add_argument('--map-events', required=True)
    args = parser.parse_args()
    refresh(args.tables, args.localization, args.public, args.map_data, args.map_events)
