"""Attach exact dungeon-content membership to creature entries."""


def attach(entries):
    for creature in entries.values():
        if creature.get('category') == 'creatures':
            creature.pop('dungeonContexts', None)
    for dungeon in entries.values():
        if dungeon.get('category') != 'dungeons':
            continue
        contents = dungeon.get('dungeonContents', {})
        bosses = [link for section in dungeon.get('sections', [])
                  if section['title'] == 'reference.labels.bosses' for link in section.get('links', [])]
        for link in [*contents.get('enemies', []), *bosses]:
            creature = entries.get(link['id'])
            if creature:
                creature.setdefault('dungeonContexts', []).append({
                    'id': dungeon['id'], 'name': dungeon['name'], 'category': dungeon['category']})
    for creature in entries.values():
        if creature.get('dungeonContexts'):
            contexts = {link['id']: link for link in creature['dungeonContexts']}
            creature['dungeonContexts'] = sorted(contexts.values(), key=lambda link: (link['name'].casefold(), link['id']))
