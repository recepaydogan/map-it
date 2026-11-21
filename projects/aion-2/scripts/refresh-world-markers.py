"""Refresh source-backed world markers and reference links, preserving travel data."""
import argparse
import hashlib
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, write


def refresh(tables, localization, public, map_data, spawns, map_events):
    ctx = Context(tables, localization, public)
    ctx.map_events = importlib.import_module('world-marker-sources').read_event_maps(map_events)
    root = ctx.public / 'data/reference'
    manifest = json.loads((root / 'manifest.json').read_text('utf8'))
    hashes = {source['name']: source['sha256'] for source in manifest['tables']}
    for name in ('NpcData', 'EnvObjData', 'Dungeon', 'Map', 'Quest', 'QuestStep', 'Subzone', 'WorldMapFieldNamed', 'GatherSource', 'GatherSourceMaterial'):
        if hashes.get(name) != hashlib.sha256((ctx.tables / (name + '.json')).read_bytes()).hexdigest():
            raise ValueError('Source version mismatch: ' + name)
    for path in root.glob('*/*.json'):
        data = json.loads(path.read_text('utf8'))
        if 'entries' in data:
            ctx.entries.update(data['entries'])
    importlib.import_module('world-marker-details').register(ctx)
    importlib.import_module('adventure-identities').build(ctx)
    importlib.import_module('dungeon-bosses').build(ctx, map_data, map_events)
    report = importlib.import_module('world-markers').build(ctx, map_data, Path(spawns) if spawns else None)
    chunks = {}
    for entry in ctx.entries.values():
        if entry['category'] == 'travel':
            continue
        bucket = hashlib.sha256(entry['id'].encode()).hexdigest()[:2]
        path = root / entry['category'] / (bucket + '.json')
        chunks.setdefault(path, {'version': 1, 'entries': {}})['entries'][entry['id']] = entry
    for path, data in chunks.items():
        # Reload before comparing because original entry objects were enriched in place.
        if not path.exists() or json.loads(path.read_text('utf8')) != data:
            write(path, data)
    index_path = root / 'index.json'
    index = json.loads(index_path.read_text('utf8'))
    summaries = {entry['id']: entry for entry in index['entries']}
    for entry in ctx.entries.values():
        if entry['category'] == 'travel':
            continue
        summary = {key: entry[key] for key in ('id', 'category', 'name', 'subtitle', 'group', 'icon', 'unnamed', 'activity', 'adventure') if key in entry}
        summary['chunk'] = hashlib.sha256(entry['id'].encode()).hexdigest()[:2]
        summaries[entry['id']] = summary
    index['entries'] = list(summaries.values())
    for category in index['categories']:
        category['count'] = sum(entry['category'] == category['id'] for entry in index['entries'])
    write(index_path, index)
    manifest['categories'].update({category['id']: category['count'] for category in index['categories']})
    write(root / 'manifest.json', manifest)
    legacy_audit_path = root / 'adventure-map-audit.json'
    if legacy_audit_path.exists():
        legacy_audit = json.loads(legacy_audit_path.read_text('utf8'))
        legacy_audit['unmappedDungeons'] = report['unmappedDungeons']
        legacy_audit['currentSourceReport'] = 'world-marker-import.json'
        write(legacy_audit_path, legacy_audit)
    print('Remaining listed dungeon locations: ' + str(len(report['unmappedDungeons'])), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--localization', required=True)
    parser.add_argument('--public', default='public')
    parser.add_argument('--map-data', required=True)
    parser.add_argument('--map-events', required=True)
    parser.add_argument('--spawns')
    args = parser.parse_args()
    refresh(args.tables, args.localization, args.public, args.map_data, args.spawns, args.map_events)
