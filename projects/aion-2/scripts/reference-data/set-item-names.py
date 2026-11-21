"""Give unnamed set pieces descriptive names without claiming official localization."""
from collections import defaultdict


def name_set_items(items, entries):
    memberships = defaultdict(list)
    for entry in entries:
        if entry['category'] != 'sets':
            continue
        for section in entry['sections']:
            if section['title'] != 'reference.labels.set-pieces':
                continue
            for link in section.get('links', []):
                if link['category'] == 'items' and entry['name'] not in memberships[link['id']]:
                    memberships[link['id']].append(entry['name'])
    changed = set()
    for item_id, sets in memberships.items():
        item = items[item_id]
        if item['nameVerified']:
            continue
        item['name'] = ' / '.join(sets) + ' · ' + item['category']
        item['nameOrigin'] = 'set'
        changed.add(item_id)
    return changed


def build(ctx):
    name_set_items(ctx.items, ctx.entries.values())
