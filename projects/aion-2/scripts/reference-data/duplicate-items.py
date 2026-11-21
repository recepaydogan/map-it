"""Keep the most complete equivalent item in every item-list category."""
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

from context import value, write


def read(path):
    return json.loads(path.read_text(encoding='utf8'))


def hide_bound_imprint_variants(items, raw_items):
    # Listing policy only: reward links must retain the original binding rules.
    groups = defaultdict(list)
    for item in items:
        item.pop('hiddenFromList', None)
        raw = raw_items.get(item['id'], {})
        if raw.get('UseEffect') != 'EItemUseEffect::ImprintMagicStone':
            continue
        effect = raw.get('UseEffectValues')
        if not effect or not item.get('nameVerified'):
            continue
        signature = [item['category'], item['grade'], item.get('usageLevel'),
                     item.get('itemLevel'), effect]
        groups[json.dumps(signature, sort_keys=True)].append((item, raw))
    for group in groups.values():
        if not any(raw.get('ExchangeType') == 'EExchangeType::Exchangeable'
                   for _, raw in group):
            continue
        for item, raw in group:
            if raw.get('ExchangeType') == 'EExchangeType::NonExchangeable':
                item['hiddenFromList'] = True


def normalized(data, item_id):
    """Ignore provenance and self-link identities, never gameplay values."""
    if isinstance(data, dict):
        return {key: ('$item' if key == 'id' and str(val) == item_id else normalized(val, item_id))
                for key, val in data.items() if key != 'source'}
    if isinstance(data, list):
        return [normalized(val, item_id) for val in data]
    return data


def tokens(data, path=()):
    """Compare missing fields as subsets; keep array records intact."""
    if isinstance(data, dict):
        return set().union(*(tokens(val, path + (key,)) for key, val in data.items())) if data else set()
    if isinstance(data, list):
        # A stat's key and value must remain paired when comparing arrays.
        return {(path, json.dumps(val, sort_keys=True, ensure_ascii=False)) for val in data}
    if data is None or data == '':
        return set()
    return {(path, json.dumps(data, ensure_ascii=False))}


def mark_duplicates(catalog, sections, acquisition):
    groups = defaultdict(list)
    profiles = {}
    for item in catalog['items']:
        item.pop('duplicateOf', None)
        # Explicitly listed records keep their own detail route even if their content matches another item.
        if not item.get('nameVerified') or item.get('hiddenFromList') or item.get('preserveInList'):
            continue
        item_id = item['id']
        core = {key: val for key, val in item.items()
                if key not in ('id', 'source', 'duplicateOf', 'hiddenFromList')}
        profile = tokens(normalized(core, item_id), ('item',))
        for section in sections.get(item_id, []):
            profile |= tokens(normalized({key: val for key, val in section.items() if key != 'title'}, item_id),
                              ('section', section['title']))
        profile |= tokens(normalized(acquisition.get(item_id, {}), item_id), ('acquisition',))
        profiles[item_id] = profile
        groups[(item['name'], item['category'], item['grade'])].append(item)

    duplicates = {}
    for group in groups.values():
        # A superset sorts before its incomplete copy; ties use a stable identity.
        ordered = sorted(group, key=lambda item: (-len(profiles[item['id']]), item['id']))
        keepers = []
        for item in ordered:
            keeper = next((candidate for candidate in keepers
                           if profiles[item['id']] <= profiles[candidate['id']]), None)
            if keeper:
                item['duplicateOf'] = keeper['id']
                duplicates[item['id']] = keeper['id']
            else:
                keepers.append(item)
    return duplicates


def annotate_catalog(tables, public, dry_run=False):
    catalog_path = public / 'data/items/catalog.json'
    catalog = read(catalog_path)
    if tables is not None:
        raw_items = {str(value(row['ID'])): row for row in read(tables / 'Item.json')['Properties']['Data']}
        hide_bound_imprint_variants(catalog['items'], raw_items)
    sections = {}
    for path in sorted((public / 'data/reference/items').glob('*.json')):
        sections.update(read(path)['items'])

    acquisition = {}
    acquisition_dir = public / 'data/items/acquisition'
    for prefix in read(acquisition_dir / 'index.json')['prefixes']:
        acquisition.update(read(acquisition_dir / (prefix + '.json'))['items'])
    # Preserve catalog-only recipe information as well as extended reference data.
    for recipe in catalog['recipes']:
        payload = {key: val for key, val in recipe.items() if key not in ('id', 'source')}
        for output_id in [recipe['outputItemId'], recipe.get('comboOutputItemId')]:
            if output_id and recipe['ingredients']:
                acquisition.setdefault(output_id, {}).setdefault('recipes', []).append(payload)
        for ingredient in recipe['ingredients']:
            acquisition.setdefault(ingredient['itemId'], {}).setdefault('ingredientUses', []).append(payload)

    duplicates = mark_duplicates(catalog, sections, acquisition)
    if dry_run:
        return duplicates
    write(catalog_path, catalog)
    manifest_path = public / 'data/items/source-manifest.json'
    manifest = read(manifest_path)
    manifest['catalog'].update({
        'bytes': catalog_path.stat().st_size,
        'sha256': hashlib.sha256(catalog_path.read_bytes()).hexdigest(),
    })
    write(manifest_path, manifest)
    return duplicates


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', type=Path, help='Optional raw tables to refresh the existing bound-imprint listing policy')
    parser.add_argument('--public', default='public', type=Path)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    duplicates = annotate_catalog(args.tables, args.public, args.dry_run)
    items = {item['id']: item for item in read(args.public / 'data/items/catalog.json')['items']}
    categories = defaultdict(int)
    for item_id in duplicates:
        categories[items[item_id]['category']] += 1
    print(json.dumps({'hiddenDuplicates': len(duplicates), 'categories': dict(sorted(categories.items()))}, indent=2))
