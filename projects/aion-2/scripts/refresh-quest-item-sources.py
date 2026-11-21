"""Remove random-only quest acquisition links using the matching client tables."""
import argparse
import hashlib
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, write


def refresh(tables, localization, public):
    root = Path(public) / 'data/reference'
    rules = importlib.import_module('random-quest-sources')
    manifest = json.loads((root / 'manifest.json').read_text('utf8'))
    hashes = {row['name']: row['sha256'] for row in manifest['tables']}
    for name in rules.SOURCE_TABLES:
        digest = hashlib.sha256((Path(tables) / (name + '.json')).read_bytes()).hexdigest()
        if hashes.get(name) != digest:
            raise ValueError('Source version mismatch: ' + name)
    ctx = Context(tables, localization, public)
    excluded = rules.random_only_pairs(ctx)
    changed, removed = 0, 0
    for path in sorted((root / 'items').glob('*.json')):
        data = json.loads(path.read_text('utf8'))
        count = rules.remove_sources(data['items'], excluded)
        if count:
            write(path, data)
            changed += 1
            removed += count
    # Catalog aliases and box source cards depend on the acquisition links.
    importlib.import_module('duplicate-items').annotate_catalog(None, Path(public))
    importlib.import_module('box-catalog').publish(public)
    print(json.dumps({'removedQuestLinks': removed, 'changedItemChunks': changed,
                      'randomOnlyPairs': len(excluded)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--localization', required=True)
    parser.add_argument('--public', default='public')
    args = parser.parse_args()
    refresh(args.tables, args.localization, args.public)
