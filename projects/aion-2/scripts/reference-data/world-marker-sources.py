"""Shared native world marker classification and coordinate conversion."""
import json
import math
from pathlib import Path
from context import value
from world import ENV_CATEGORIES, classify_boss_marker

TRAVEL_CATEGORIES = {'teleport', 'rift', 'portal'}
GATHER_CATEGORIES = {'Od': 'gather-od', 'Jewelry': 'gather-gems', 'Herb': 'gather-herbs',
                     'Flower': 'gather-herbs', 'Metal': 'gather-metal-ore', 'RareMetal': 'gather-metal-ore',
                     'Shellfish': 'gather-shellfish', 'Berry': 'gather-berries',
                     'Vegetable': 'gather-vegetables', 'Tree': 'gather-trees'}


def merchant_icon_path(shop_name):
    if '_conversion_' in shop_name:
        return 'icons/categories/merchant-conversion.png'
    if '_Dye_' in shop_name:
        return 'icons/categories/merchant-dye.png'
    for profession, icon in (
        ('_alchemy_', 'alchemist'),
        ('_blacksmithing_', 'blacksmith'),
        ('_cooking_', 'cooking'),
        ('_jewelcrafting_', 'jewelry'),
        ('_tailoring_', 'tailor'),
    ):
        if profession in shop_name:
            return f'icons/categories/merchant-{icon}.png'
    return None


def read_event_maps(directory):
    events = {}
    for path in sorted(Path(directory).glob('*.json')):
        data = json.loads(path.read_text('utf8'))['data']
        if data['Name'] in events and events[data['Name']] != data['MapID']:
            raise ValueError('Ambiguous map event: ' + data['Name'])
        events[data['Name']] = data['MapID']
    if not events:
        raise ValueError('No decoded map events found: ' + str(directory))
    return events


def read_exports(directory):
    exports = {}
    for path in sorted(Path(directory).glob('*.json')):
        export = json.loads(path.read_text('utf8'))
        data = export['data']['Properties']['Data']
        if '/InstanceLayer/' in export['asset']:
            continue
        map_id = value(data['MapId'])
        if map_id in exports:
            raise ValueError(f'Ambiguous map export: {map_id}')
        exports[map_id] = export
    if not exports:
        raise ValueError('No decoded map exports found: ' + str(directory))
    return exports


def project(position, projection, bounds):
    if any(projection['size'][axis] <= 0 for axis in ('X', 'Y')):
        raise ValueError('Invalid world projection size')
    point = {axis.lower(): round(bounds['min' + axis] + (position[axis] - projection['origin'][axis])
             * (bounds['max' + axis] - bounds['min' + axis]) / projection['size'][axis], 3) for axis in ('X', 'Y')}
    if not all(math.isfinite(number) for number in point.values()):
        raise ValueError('Non-finite marker coordinates')
    return point


def classify(table, row, entry, bosses):
    if table == 'EnvObjData':
        usage = row['Usage'].split('::')[-1]
        if usage in ('MoveMap', 'MovemapCondition'):
            return 'portal'
        if usage == 'EnterInstanceLayer':
            return 'instance-entrance'
        if row.get('Category', '').split('::')[-1] != 'None' or (row.get('bGetRewardOnce') and not row.get('bHideWorldMapMarker')):
            return 'collect-object'
        if usage not in ENV_CATEGORIES and any(section['title'] == 'reference.adventure.relatedQuests' for section in entry.get('sections', [])):
            return 'quest-object'
        return ENV_CATEGORIES.get(usage)
    function = row['FunctionType'].split('::')[-1]
    if function in ('EnterInstanceLayer', 'EnterFieldEvent'):
        return 'instance-entrance' if function == 'EnterInstanceLayer' else 'event-entrance'
    boss_category = classify_boss_marker(row, bosses)
    if boss_category:
        return boss_category
    if function == 'BuySell':
        if any('Halloween_Event' in shop for shop in row.get('FuncValues', [])):
            return 'event-npc'
        return 'merchant'
    if function.startswith('Craft') or function in ('Cook', 'Tailor', 'Blacksmith', 'Alchemy', 'Jewelcraft', 'GuildCraft'):
        return 'craft-service'
    if 'Storage' in function:
        return 'storage'
    if 'Teleport' in function:
        return 'teleport'
    if row['NpcType'].endswith('::Monster') and row['bCanBeAttacked']:
        return 'enemy'
    if row['NpcType'].endswith('::Citizen') and (function != 'None' or any(section['title'] == 'reference.adventure.relatedQuests' for section in entry.get('sections', []))):
        return 'npc'
    return None
