"""Restore proven creature rewards and legacy references without rebuilding maps."""
import argparse
import hashlib
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context

publish_json = importlib.import_module('refresh-creature-combat').publish_json


def refresh(tables, localization, public):
    root = Path(public) / 'data/reference'
    title_rewards = importlib.import_module('creature-title-rewards')
    for manifest_path in (root / 'manifest.json', root / 'intelligence/manifest.json'):
        manifest = json.loads(manifest_path.read_text('utf8'))
        for source in manifest['tables']:
            if source['name'] in (*title_rewards.SOURCE_TABLES, 'NpcLoot'):
                path = Path(tables) / (source['name'] + '.json')
                if hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
                    raise ValueError('Source version mismatch: ' + source['name'])
    ctx = Context(tables, localization, public)
    files = {}
    originals = {}
    for path in sorted((root / 'creatures').glob('*.json')):
        originals[path] = path.read_text('utf8')
        files[path] = json.loads(originals[path])
        ctx.entries.update(files[path]['entries'])
    added = importlib.import_module('creature-rewards').build(ctx)
    title_count = title_rewards.build(ctx)
    restored = []
    for path in sorted((Path(public) / 'maps').glob('*/metadata.json')):
        originals[path] = path.read_text('utf8')
        files[path] = json.loads(originals[path])
        restored.extend(importlib.import_module('legacy-creature-references').restore(ctx, files[path], path.parent.name))
    changed = 0
    for path, data in files.items():
        if json.loads(originals[path]) != data:
            publish_json(path, data)
            changed += 1
    print(json.dumps({'firstKillTitleSources': title_count, 'addedLootLinks': len(added), 'creaturesWithAddedLoot': len({r['creature'] for r in added}),
                      'restoredReferences': restored, 'changedFiles': changed}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--localization', required=True)
    parser.add_argument('--public', default='public')
    args = parser.parse_args()
    refresh(args.tables, args.localization, args.public)
