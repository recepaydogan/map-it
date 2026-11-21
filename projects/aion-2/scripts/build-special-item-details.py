"""Publish item details backed by explicit client-table relationships."""

import argparse
import json
from pathlib import Path


def rows(directory, name):
    return json.loads((directory / f'{name}.json').read_text(encoding='utf-8'))['Properties']['Data']


def publish(tables, public):
    items = rows(tables, 'Item')
    objects = {row['Name']: row for row in rows(tables, 'EnvObjData')}
    kisks = {row['Name']: row for row in rows(tables, 'KiskData')}
    hidden_recipes = sorted(f"ConversionRecipe:{row['ID']['Value']}" for row in rows(tables, 'ConversionRecipe')
                            if row.get('bShowRecipe') is False)
    extendable = sorted(str(row['ID']['Value']) for row in items if row.get('ExtendingWeapon') is True)
    item_kisks = {}
    for item in items:
        if item.get('UseEffect') != 'EItemUseEffect::SetupKisk':
            continue
        source = next((objects.get(name) for name in item['UseEffectValues'] if name in objects), None)
        kisk = kisks.get(source['UsageValue']) if source else None
        if not source or source.get('Usage') != 'EEnvObjectUsage::Kisk' or not kisk:
            raise ValueError(f'Unresolved Kisk item: {item["Name"]}')
        item_kisks[str(item['ID']['Value'])] = {
            'maxMembers': kisk['MaxMemberCount'],
            'maxResurrections': kisk['MaxUseCount'],
            'durationSeconds': kisk['LifeTime'],
        }

    destination = public / 'data/reference/intelligence/special-item-details.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps({
        'version': 1,
        'extendableWeapons': extendable,
        'kisks': item_kisks,
        'hiddenRecipes': hidden_recipes,
    }, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Published {len(extendable)} extendable weapons, {len(item_kisks)} Kisk items, and {len(hidden_recipes)} hidden recipe IDs.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True, type=Path)
    parser.add_argument('--public', default='public', type=Path)
    args = parser.parse_args()
    publish(args.tables, args.public)
