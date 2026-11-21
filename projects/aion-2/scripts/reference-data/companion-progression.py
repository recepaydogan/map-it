"""Join companion growth and genus insight through explicit client table keys."""
from collections import defaultdict
from context import human, value, write

SOURCE_TABLES = ('VehicleList', 'VehicleStat', 'VehicleLevel', 'VehicleCreatureLevel', 'VehicleCreatureSlot')


def build(ctx):
    groups = defaultdict(list)
    for row in ctx.rows('VehicleStat'):
        groups[row['Group']].append({'level': row['Level'], 'stats': ctx.stats(row['StatList'])})
    levels = [{'level': row['Level'], 'soulsToNextLevel': row['NeedSoulCount'],
               'genusExperience': row['GetCreatureExp']} for row in ctx.rows('VehicleLevel')]
    genera = {}
    for slot in ctx.rows('VehicleCreatureSlot'):
        kind = slot['CreatureType']
        name = ctx.text('UI_MAINTARGET_CREATURETYPE_' + kind.split('::')[-1].upper(), human(kind))
        genera[kind] = {'name': name, 'levels': [], 'slotLevels': slot['SlotOpenLevel'],
                        'analysisCrystals': slot['SoulCrystalCount'], 'analysisCurrency': slot['GoldCount']}
    for row in ctx.rows('VehicleCreatureLevel'):
        genera[row['CreatureType']]['levels'].append({
            'level': row['Level'], 'experienceToNextLevel': row['NeedExp'],
            'analysisExperience': row['GetExp'],
            'grades': [{'grade': key.removeprefix('Prob_').lower(), 'percent': val / 100}
                       for key, val in row.items() if key.startswith('Prob_')],
        })
    pets = {}
    for row in ctx.rows('VehicleList'):
        identity = 'VehicleList:' + str(value(row['ID']))
        entry = ctx.entries[identity]
        kind = row['CreatureType']
        if kind not in genera:
            raise ValueError('Missing companion genus: ' + kind)
        group = row['StatGroupName']
        if group != 'None' and group not in groups:
            raise ValueError('Missing companion stat group: ' + group)
        pets[identity] = {'genus': kind, 'statGroup': None if group == 'None' else group,
                          'runSpeed': row['ArtRunSpeed'], 'sprintSpeed': row['ArtSprintSpeed']}
        entry['group'] = entry['subtitle'] = genera[kind]['name']
        for fact in entry['facts']:
            if fact['label'] == 'reference.labels.type':
                fact['value'] = genera[kind]['name']
        item = ctx.link('Item', row['VehicleItemName'])
        if item and item.get('icon'):
            entry['icon'] = item['icon']
    for rows in groups.values():
        rows.sort(key=lambda row: row['level'])
    for genus in genera.values():
        genus['levels'].sort(key=lambda row: row['level'])
    data = {'version': 1, 'pets': pets, 'statGroups': dict(groups),
            'levels': sorted(levels, key=lambda row: row['level']), 'genera': genera}
    write(ctx.public / 'data/reference/companion-progression.json', data)
    return data
