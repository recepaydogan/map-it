"""Apply client-verified reference sections after map markers are generated."""
import json
from pathlib import Path


def apply(ctx):
    source = Path(__file__).with_suffix('.json')
    overrides = json.loads(source.read_text(encoding='utf8'))
    if overrides['version'] != 1:
        raise ValueError('Unsupported verified reference section version')

    map_markers = {}
    for reference_id, override in overrides['entries'].items():
        entry = ctx.entries.get(reference_id)
        if not entry:
            raise ValueError(f'Verified reference entry is missing: {reference_id}')
        sections = override['sections']
        existing_titles = {section['title'] for section in entry['sections']}
        if existing_titles.intersection(section['title'] for section in sections):
            raise ValueError(f'Verified reference section already exists: {reference_id}')
        for section in sections:
            links = section.get('links', []) + [tier['link'] for tier in section.get('tierCards', {}).get('tiers', [])]
            for link in links:
                if link['id'] not in (ctx.items if link['category'] == 'items' else ctx.entries):
                    raise ValueError(f'Verified reference link is missing: {link["id"]}')
            for row in section.get('rows', []):
                location = row.get('location')
                if not location:
                    continue
                icon = row.get('locationIcon')
                if icon and not (ctx.public / icon.lstrip('/')).is_file():
                    raise ValueError(f'Verified location icon is missing: {icon}')
                map_id = location['mapId']
                if map_id not in map_markers:
                    path = ctx.public / 'maps' / map_id / 'metadata.json'
                    metadata = json.loads(path.read_text(encoding='utf8'))
                    map_markers[map_id] = {marker['id']: marker for marker in metadata['locations']}
                marker = map_markers[map_id].get(location['markerId'])
                if not marker or marker.get('reference', {}).get('id') != location.get('referenceId'):
                    raise ValueError(f'Verified map marker is missing or changed: {location["markerId"]}')
        entry['sections'].extend(sections)
