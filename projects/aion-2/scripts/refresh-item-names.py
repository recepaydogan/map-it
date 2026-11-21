"""Refresh unresolved item names and their published links from exact source keys."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, value, write


def refresh(node, names):
    changed = False
    if isinstance(node, list):
        for child in node:
            changed = refresh(child, names) or changed
    elif isinstance(node, dict):
        match = names.get(str(node.get('id')))
        if match and node.get('name') == match[0]:
            node['name'] = match[1]
            if 'unresolvedName' in node:
                node['unresolvedName'] = False
            changed = True
        for child in node.values():
            if isinstance(child, (dict, list)):
                changed = refresh(child, names) or changed
    return changed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--localization', required=True)
    parser.add_argument('--public', default='public')
    args = parser.parse_args()
    public = Path(args.public)
    catalog_path = public / 'data/items/catalog.json'
    original = json.loads(catalog_path.read_text('utf8'))
    ctx = Context(args.tables, args.localization, public)
    names = {item['id']: (item['name'], ctx.items[item['id']]['name'])
             for item in original['items'] if item['name'] != ctx.items[item['id']]['name']}
    resolved_items = len(names)
    index = json.loads((public / 'data/reference/index.json').read_text('utf8'))
    summaries = {entry['id']: entry for entry in index['entries']}
    # Box and recipe headings inherit item names but have their own reference IDs.
    for table, field in [('BoxReward', 'Group'), ('BoxClassReward', 'Group'),
                         ('CraftRecipe', 'Product'), ('ConversionRecipe', 'Product')]:
        for position, row in enumerate(ctx.rows(table)):
            key = position if table in ('BoxReward', 'BoxClassReward') else value(row['ID'])
            entry = summaries.get(f'{table}:{key}')
            item = ctx.items.get(ctx.item_names.get(row[field].casefold()))
            if entry and item and item.get('nameVerified') and entry['name'] != item['name']:
                names[entry['id']] = (entry['name'], item['name'])
    changed_files = 0
    # Publish links before the catalog so interrupted runs can safely be repeated.
    for path in sorted((public / 'data').rglob('*.json')):
        if path == catalog_path:
            continue
        data = json.loads(path.read_text('utf8'))
        if refresh(data, names):
            write(path, data)
            changed_files += 1
    refresh(ctx.catalog, names)
    write(catalog_path, ctx.catalog)
    manifest_path = public / 'data/items/source-manifest.json'
    manifest = json.loads(manifest_path.read_text('utf8'))
    manifest['catalog'].update(bytes=catalog_path.stat().st_size,
                               sha256=hashlib.sha256(catalog_path.read_bytes()).hexdigest())
    manifest['counts']['localizedItemNames'] = sum(item.get('nameVerified') is True for item in ctx.items.values())
    write(manifest_path, manifest)
    print(json.dumps({'resolvedItems': resolved_items, 'resolvedHeadings': len(names) - resolved_items, 'updatedFiles': changed_files,
                      'names': names}, ensure_ascii=True))


if __name__ == '__main__':
    main()
