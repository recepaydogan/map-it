"""Refresh reward objects and reconcile their source-defined map variants."""
import argparse
import hashlib
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, write


def refresh(tables, localization, public, map_data):
    ctx = Context(tables, localization, public)
    root = ctx.public / 'data/reference'
    manifest = json.loads((root / 'manifest.json').read_text('utf8'))
    hashes = {row['name']: row['sha256'] for row in manifest['tables']}
    for name in ['EnvObjData', 'Item', 'Achievement', 'AchievementReward', 'RewardItem', 'RewardPackage', 'RewardPackageItem', 'Wing', 'WingEnchantEffect']:
        if hashlib.sha256((ctx.tables / (name + '.json')).read_bytes()).hexdigest() != hashes.get(name):
            raise ValueError('Source version mismatch: ' + name)
    reward_hash = hashlib.sha256((ctx.tables / 'RewardData.json').read_bytes()).hexdigest()
    if hashes.get('RewardData', reward_hash) != reward_hash:
        raise ValueError('Source version mismatch: RewardData')
    chunks = {}
    for directory in root.iterdir():
        if directory.is_dir() and directory.name in ('exploration', 'achievements', 'quests', 'wings'):
            for path in directory.glob('*.json'):
                data = json.loads(path.read_text('utf8'))
                if isinstance(data, dict) and isinstance(data.get('entries'), dict):
                    chunks[path] = data
                    ctx.entries.update(data['entries'])
    before = {path: json.dumps(data, sort_keys=True) for path, data in chunks.items()}
    module = importlib.import_module('world-object-rewards')
    module.build(ctx)
    importlib.import_module('wing-owned-effects').build(ctx)
    report = module.normalize_markers(ctx, map_data)
    changed = 0
    for path, data in chunks.items():
        if json.dumps(data, sort_keys=True) != before[path]:
            write(path, data)
            changed += 1
    if 'RewardData' not in hashes:
        manifest['tables'].append({'name': 'RewardData', 'rows': len(ctx.rows('RewardData')), 'sha256': reward_hash})
        manifest['tables'].sort(key=lambda row: row['name'])
        write(root / 'manifest.json', manifest)
    print(json.dumps({'changedChunks': changed, 'maps': report}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['tables', 'localization', 'map-data']:
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--public', default='public')
    args = parser.parse_args()
    refresh(args.tables, args.localization, args.public, args.map_data)
