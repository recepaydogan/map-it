"""Refresh creature dungeon links from already published dungeon contents."""
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import write


def refresh(public):
    root = Path(public) / 'data/reference'
    chunks, entries = {}, {}
    for category in ('creatures', 'dungeons'):
        for path in sorted((root / category).glob('*.json')):
            data = json.loads(path.read_text('utf8'))
            if category == 'creatures':
                chunks[path] = (data, json.dumps(data, sort_keys=True))
            entries.update(data['entries'])
    if not chunks or not any(entry.get('category') == 'dungeons' for entry in entries.values()):
        raise ValueError('Published creature or dungeon reference chunks are missing')
    importlib.import_module('creature-dungeon-contexts').attach(entries)
    changed = 0
    for path, (data, before) in chunks.items():
        if json.dumps(data, sort_keys=True) != before:
            write(path, data)
            changed += 1
    print(f'Published dungeon links in {changed} creature chunks.')


if __name__ == '__main__':
    refresh(sys.argv[1] if len(sys.argv) > 1 else 'public')
