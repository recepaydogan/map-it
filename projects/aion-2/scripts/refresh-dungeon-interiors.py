"""Refresh dungeon-to-interior navigation without rebuilding images or markers."""
import argparse
import hashlib
import importlib
import json
from pathlib import Path
from types import SimpleNamespace
import sys

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import write


def refresh(args):
    root = Path(args.public) / 'data/reference'
    manifest = json.loads((root / 'manifest.json').read_text('utf8'))
    raw = (Path(args.tables) / 'Dungeon.json').read_bytes()
    expected = next(row['sha256'] for row in manifest['tables'] if row['name'] == 'Dungeon')
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError('Source version mismatch: Dungeon')
    rows = json.loads(raw)['Properties']['Data']
    chunks = {path: json.loads(path.read_text('utf8')) for path in (root / 'dungeons').glob('*.json')}
    before = {path: json.dumps(chunk, sort_keys=True) for path, chunk in chunks.items()}
    entries = {key: entry for chunk in chunks.values() for key, entry in chunk['entries'].items()}
    ctx = SimpleNamespace(public=Path(args.public), entries=entries, rows=lambda _: rows)
    count = importlib.import_module('dungeon-interiors').build(ctx)
    for path, chunk in chunks.items():
        if json.dumps(chunk, sort_keys=True) != before[path]:
            write(path, chunk)
    print(json.dumps({'dungeonsWithInteriorMaps': count}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--public', default='public')
    refresh(parser.parse_args())
