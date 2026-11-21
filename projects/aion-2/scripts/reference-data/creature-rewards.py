"""Keep native loot-preview items when a probability table is unavailable."""
from context import value

DROP_TITLES = ('reference.labels.possible-drops', 'reference.labels.guaranteed-drops')


def build(ctx):
    added = []
    for row in ctx.rows('NpcLoot'):
        entry = ctx.entries.get('NpcData:' + str(value(row['NpcId'])))
        if not entry:
            continue
        known = {link['id'] for section in entry['sections'] if section['title'] in DROP_TITLES
                 for link in section.get('links', [])}
        # Souls have their own presentation and acquisition requirements.
        known.add(str(value(row['VehicleSoulItemId'])))
        for cell in row['LootList']:
            item_id = str(value(cell))
            if item_id in known:
                continue
            link = ctx.link('Item', cell)
            if not link:
                raise ValueError('Unresolved creature loot item: ' + item_id)
            section = next((section for section in entry['sections'] if section['title'] == DROP_TITLES[0]), None)
            if section is None:
                section = {'title': DROP_TITLES[0], 'links': []}
                entry['sections'].append(section)
            # The preview establishes identity, not quantity or probability.
            section.setdefault('links', []).append(link)
            known.add(item_id)
            added.append({'creature': entry['id'], 'item': item_id})
    return added
