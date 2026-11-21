"""Add missing pet and wing references from a matching client table snapshot."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, human, value, write


def write_changed(path, data):
    if not path.exists() or json.loads(path.read_text('utf8')) != data:
        write(path, data)


def refresh(tables, localization, public, item_ids):
    ctx = Context(tables, localization, public)
    root = ctx.public / 'data/reference'
    index_path = root / 'index.json'
    index = json.loads(index_path.read_text('utf8'))
    known = {entry['id'] for entry in index['entries']}
    progression_path = root / 'companion-progression.json'
    progression = json.loads(progression_path.read_text('utf8'))
    item_rows = {str(value(row['ID'])): row for row in ctx.rows('Item')}
    source_rows = {
        'Wing': {str(value(row['ID'])): row for row in ctx.rows('Wing')},
        'VehicleList': {str(value(row['ID'])): row for row in ctx.rows('VehicleList')},
    }
    wing_effects = ctx.rows('WingEnchantEffect')
    vehicle_stats = ctx.rows('VehicleStat')
    changed_items = set()
    added = []

    for item_id in item_ids:
        item = ctx.items[item_id]
        row = item_rows[item_id]
        table = {'EItemUseEffect::GetWing': 'Wing',
                 'EItemUseEffect::GetVehicle': 'VehicleList'}.get(row['UseEffect'])
        if not table or len(row['UseEffectValues']) != 1:
            raise ValueError(f'Unsupported unlock effect for item {item_id}')
        target_id = str(value(row['UseEffectValues'][0]))
        source = source_rows[table][target_id]
        entry_id = f'{table}:{target_id}'
        if entry_id in known:
            item_sections = json.loads((root / 'items' / f'{item_id[:3]}.json').read_text('utf8'))['items'].get(item_id, [])
            if any(link['id'] == entry_id for section in item_sections
                   for link in section.get('links', [])):
                continue
            raise ValueError(f'Existing reference should be refreshed by the full importer: {entry_id}')

        if table == 'VehicleList':
            kind = source['CreatureType']
            if kind not in progression['genera']:
                raise ValueError(f'Missing companion genus: {kind}')
            group = source['StatGroupName']
            growth = [stat for stat in vehicle_stats if stat['Group'] == group]
            if group != 'None' and not growth:
                raise ValueError(f'Missing companion stat group: {group}')
            entry = ctx.entry(table, source, 'mounts', fields={
                'CreatureType': 'Type', 'NeedSoul': 'Required souls',
                'bIsOpen': 'Enabled in client', 'ArtRunSpeed': 'Run speed (table units)',
                'ArtSprintSpeed': 'Sprint speed (table units)',
            })
            genus = progression['genera'][kind]['name']
            entry['group'] = entry['subtitle'] = genus
            for fact in entry['facts']:
                if fact['label'] == 'reference.labels.type':
                    fact['value'] = genus
            entry['icon'] = item.get('icon')
            ctx.section(entry, 'Equipped bonuses', facts=ctx.stats(source.get('EquipStatList', [])))
            ctx.section(entry, 'Collection bonuses', facts=ctx.stats(source.get('StatList', [])))
            ctx.section(entry, 'Growth bonuses', rows=[
                {'name': str(stat['Level']), 'facts': ctx.stats(stat['StatList'])}
                for stat in growth
            ])
            progression['pets'][entry_id] = {
                'genus': kind, 'statGroup': None if group == 'None' else group,
                'runSpeed': source['ArtRunSpeed'], 'sprintSpeed': source['ArtSprintSpeed'],
            }
            if group != 'None' and group not in progression['statGroups']:
                progression['statGroups'][group] = sorted([
                    {'level': stat['Level'], 'stats': ctx.stats(stat['StatList'])}
                    for stat in growth
                ], key=lambda stat: stat['level'])
        else:
            entry = ctx.entry(table, source, 'wings', group='Wing',
                              fields={'Grade': 'Grade', 'PcRace': 'Faction'})
            entry['icon'] = item.get('icon')
            ctx.section(entry, 'Equipped bonuses', facts=ctx.stats(source.get('EquipStatList', [])))
            base = next((effect for effect in wing_effects
                         if effect['EffectGroup'] == source['EffectGroup'] and effect['Level'] == 0), None)
            if base:
                ctx.section(entry, 'Owned effects', facts=ctx.stats(base['Stats']))

        ctx.section(entry, 'Unlock items', links=[{
            'id': item_id, 'category': 'items', 'name': item['name'], 'icon': item.get('icon'),
        }])
        chunk_name = hashlib.sha256(entry_id.encode()).hexdigest()[:2]
        chunk_path = root / entry['category'] / f'{chunk_name}.json'
        chunk = json.loads(chunk_path.read_text('utf8')) if chunk_path.exists() else {'version': 1, 'entries': {}}
        chunk['entries'][entry_id] = entry
        write_changed(chunk_path, chunk)
        summary = {key: entry[key] for key in
                   ('id', 'category', 'name', 'subtitle', 'group', 'icon', 'unnamed')
                   if key in entry} | {'chunk': chunk_name}
        category_positions = [position for position, existing in enumerate(index['entries'])
                              if existing['category'] == entry['category']]
        sort_key = (entry['unnamed'], entry['name'].casefold(), entry_id)
        insert_at = next((position for position in category_positions
                          if (index['entries'][position].get('unnamed', False),
                              index['entries'][position]['name'].casefold(),
                              index['entries'][position]['id']) > sort_key),
                         category_positions[-1] + 1 if category_positions else len(index['entries']))
        index['entries'].insert(insert_at, summary)
        known.add(entry_id)
        added.append(entry_id)

        item_ref_path = root / 'items' / f'{item_id[:3]}.json'
        item_ref = json.loads(item_ref_path.read_text('utf8'))
        sections = item_ref['items'].setdefault(item_id, [])
        if any(section['title'] == 'reference.labels.use-effect' for section in sections):
            raise ValueError(f'Existing use effect must be reviewed before replacement: {item_id}')
        sections.insert(0, {
            'title': 'reference.labels.use-effect',
            'facts': [{'label': 'reference.labels.effect', 'value': human(row['UseEffect'])}],
            'links': [{'id': entry_id, 'category': entry['category'], 'name': entry['name']}],
            'text': item.get('description', ''),
        })
        write_changed(item_ref_path, item_ref)
        changed_items.add(item_id)

    for category_row in index['categories']:
        if category_row['id'] in ('mounts', 'wings'):
            category_row['count'] = sum(entry['category'] == category_row['id']
                                        for entry in index['entries'])
    write_changed(index_path, index)
    if not added:
        print('All requested pet and wing references already exist.')
        return
    write_changed(progression_path, progression)

    manifest_path = root / 'manifest.json'
    manifest = json.loads(manifest_path.read_text('utf8'))
    for category in ('mounts', 'wings'):
        manifest['categories'][category] = next(row['count'] for row in index['categories'] if row['id'] == category)
    manifest['itemsWithReferenceSections'] += len(changed_items)
    manifest['unlockReferenceSupplement'] = {
        'entryIds': added, 'itemIds': sorted(changed_items),
        'tables': {name: hashlib.sha256((ctx.tables / f'{name}.json').read_bytes()).hexdigest()
                   for name in ('Item', 'VehicleList', 'VehicleStat', 'Wing', 'WingEnchantEffect')},
    }
    write_changed(manifest_path, manifest)
    print(f'Added {len(added)} pet and wing references from installed client tables.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--localization', required=True)
    parser.add_argument('--public', default='public')
    parser.add_argument('item_ids', nargs='+')
    args = parser.parse_args()
    refresh(args.tables, args.localization, args.public, args.item_ids)
