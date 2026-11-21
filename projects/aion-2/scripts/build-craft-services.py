"""Publish selected crafting-table details from matching decoded client tables."""
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
import os
import tempfile


def rows(tables, name):
    return json.loads((tables / (name + '.json')).read_text('utf8'))['Properties']['Data']


def value(cell):
    return cell['Value'] if isinstance(cell, dict) else cell


def publish(tables, public, npc_ids):
    root = public / 'data/reference'
    manifest = json.loads((root / 'manifest.json').read_text('utf8'))
    hashes = {source['name']: source['sha256'] for source in manifest['tables']}
    for name in ('CraftRecipe', 'NpcData', 'ContentsUnlock', 'Item'):
        actual = hashlib.sha256((tables / (name + '.json')).read_bytes()).hexdigest()
        if hashes.get(name) != actual:
            raise ValueError('Source version mismatch: ' + name)

    npc_rows = {str(value(row['ID'])): row for row in rows(tables, 'NpcData')}
    recipes = rows(tables, 'CraftRecipe')
    recipes_by_name = {recipe['Name']: recipe for recipe in recipes}
    items_by_name = {item['Name']: item for item in rows(tables, 'Item')}
    unlocks = [row['UnlockLevel'] for row in rows(tables, 'ContentsUnlock')
               if row['ContentUnlockType'].split('::')[-1] == 'Craft']
    if len(unlocks) != 1:
        raise ValueError('Expected one crafting unlock rule')
    index = json.loads((root / 'index.json').read_text('utf8'))
    summaries = {entry['id']: entry for entry in index['entries'] if entry['category'] == 'recipes'}
    recipe_chunks = {}

    def product_icon(identity):
        summary = summaries[identity]
        chunk = summary['chunk']
        if chunk not in recipe_chunks:
            path = root / 'recipes' / (chunk + '.json')
            recipe_chunks[chunk] = json.loads(path.read_text('utf8'))['entries']
        entry = recipe_chunks[chunk][identity]
        outputs = [link for section in entry['sections']
                   if section['title'] == 'reference.labels.produces'
                   for link in section.get('links', [])]
        if len(outputs) != 1 or not outputs[0].get('icon'):
            raise ValueError('Recipe product icon is missing: ' + identity)
        if not (public / outputs[0]['icon']).is_file():
            raise ValueError('Recipe product icon file is missing: ' + identity)
        return outputs[0]['icon']

    def combo_result(recipe):
        if recipe['ComboProbability'] <= 0:
            return None
        if recipe['ComboRecipe'] == 'None':
            return 'unlisted'
        combo = recipes_by_name.get(recipe['ComboRecipe'])
        if not combo:
            raise ValueError('Unresolved combo recipe: ' + recipe['Name'])
        if combo['Category'] != recipe['Category'] or combo['QualificationRace'] != recipe['QualificationRace']:
            raise ValueError('Mismatched combo recipe: ' + recipe['Name'])
        base_item = items_by_name.get(recipe['Product'])
        combo_item = items_by_name.get(combo['Product'])
        if not base_item or not combo_item:
            raise ValueError('Unresolved combo product: ' + recipe['Name'])
        if combo['ProductCount'] > recipe['ProductCount']:
            return 'extra-items'
        if combo_item['ItemLevel'] > base_item['ItemLevel']:
            return 'higher-level'
        if combo['Product'] != recipe['Product']:
            return 'alternate'
        return 'same-item'

    stations = {}

    for npc_id in npc_ids:
        npc = npc_rows.get(npc_id)
        if not npc or npc['NpcSubType'].split('::')[-1] != 'Object':
            raise ValueError('Unknown crafting table NPC: ' + npc_id)
        function = npc['FunctionType'].split('::')[-1]
        faction = npc['RelationshipEntity'].split('_')[-1]
        category_recipes = [recipe for recipe in recipes
                            if recipe['Category'].split('::')[-1].removesuffix('ing') == function]
        matching = [recipe for recipe in category_recipes
                    if recipe['QualificationRace'].split('::')[-1] == faction]
        if not matching:
            raise ValueError('No faction recipes for crafting table: ' + npc_id)

        groups = defaultdict(list)
        for recipe in matching:
            if not recipe['bShowRecipe']:
                continue
            identity = 'CraftRecipe:' + str(value(recipe['ID']))
            if identity not in summaries or recipe['SubTab'] == 'None':
                raise ValueError('Unresolved listed recipe: ' + identity)
            craft_type = recipe['Type'].split('::')[-1]
            if craft_type == 'Succession' and recipe['MasteryLevel'] == 0 and not recipe['SuccessionComponentCandidateList']:
                raise ValueError('Transfer recipe has no eligible equipment: ' + identity)
            listed_recipe = {
                'id': identity, 'name': summaries[identity]['name'],
                'icon': product_icon(identity), 'mastery': recipe['MasteryLevel'],
                'craftType': craft_type, 'comboChance': recipe['ComboProbability'] / 100}
            result = combo_result(recipe)
            if result:
                listed_recipe['comboResult'] = result
            groups[recipe['SubTab']].append(listed_recipe)
        stations[npc_id] = {
            'unlockLevel': unlocks[0],
            'listedCount': sum(len(group) for group in groups.values()),
            'groups': [{'tab': tab, 'recipes': group} for tab, group in sorted(groups.items(),
                       key=lambda pair: pair[0].startswith('Misc_'))],
        }

    output = root / 'craft-services.json'
    content = json.dumps({'version': 1, 'stations': stations}, ensure_ascii=False,
                         separators=(',', ':'))
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf8', dir=output.parent,
                                     prefix=output.name + '.', suffix='.tmp', delete=False) as stream:
        temporary = stream.name
        stream.write(content)
    try:
        os.replace(temporary, output)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(json.dumps({'stations': len(stations), 'output': str(output)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', type=Path, required=True)
    parser.add_argument('--public', type=Path, default=Path('public'))
    parser.add_argument('--npc-ids', nargs='+', required=True)
    args = parser.parse_args()
    publish(args.tables, args.public, args.npc_ids)
