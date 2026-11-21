"""Refresh exact field-event links and existing map icons from local client tables."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import write
from importlib import import_module


def rows(tables, name):
    return json.loads((tables / (name + '.json')).read_text('utf8'))['Properties']['Data']


def refresh(tables, public):
    root = public / 'data/reference'
    chunks = {}
    entries = {}
    for path in root.glob('*/*.json'):
        data = json.loads(path.read_text('utf8'))
        if 'entries' in data:
            chunks[path] = data
            entries.update(data['entries'])
    previous = {identity: entry.get('fieldEvent') for identity, entry in entries.items() if identity.startswith('NpcData:')}
    connected = import_module('field-event-entrances').connect(entries, rows(tables, 'NpcData'), rows(tables, 'FieldEvent'))
    changed = 0
    for path, data in chunks.items():
        if any(entry.get('fieldEvent') != previous.get(identity) for identity, entry in data['entries'].items()
               if identity.startswith('NpcData:')):
            write(path, data)
            changed += 1
    icons = json.loads((root / 'entity-artwork.json').read_text('utf8'))['icons']
    markers = 0
    for path in sorted((public / 'maps').glob('*/metadata.json')):
        data = json.loads(path.read_text('utf8'))
        dirty = False
        for point in data['locations']:
            if point['category'] != 'event-entrance':
                continue
            icon = icons.get(point.get('reference', {}).get('id'))
            if icon and point.get('iconPath') != icon:
                point['iconPath'] = icon
                markers += 1
                dirty = True
        if dirty:
            write(path, data)
    print(f'Field-event entrances: {connected} linked, {changed} chunks, {markers} marker icons')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', type=Path, required=True)
    parser.add_argument('--public', type=Path, default=Path('public'))
    args = parser.parse_args()
    refresh(args.tables, args.public)
