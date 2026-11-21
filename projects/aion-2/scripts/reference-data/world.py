"""Join verified native spawns and UI region actor positions without replacing IDs."""
import hashlib
import json
from collections import defaultdict
from context import human, value, write

MAPS = [
    (1010, 'world-l-a', 'World_L_A', 'verteron', 408000),
    (1110, 'world-d-a', 'World_D_A', 'altgard', 408000),
    (1000, 'world-l-starter', 'World_L_Starter', 'poeta', 204000),
    (1100, 'world-d-starter', 'World_D_Starter', 'ishalgen', 204000),
    (1011, 'world-l-b', 'World_L_B', None, None),
    (1111, 'world-d-b', 'World_D_B', None, None),
    # Validated against all 200 independently published collectible positions;
    # maximum residual 0.659 pixels, median 0.396 pixels at a 4096px canvas.
    (20, 'reshanta-a', 'Abyss_Reshanta_A', 'reshanta-a', 204000),
]
ENV_CATEGORIES = {'TeleportArtifact': 'teleport', 'EnterDungeon': 'dungeon', 'PartyDungeon': 'dungeon', 'Monolith': 'monolith', 'Rift': 'rift', 'AbyssArtifact': 'objective', 'FlightRing': 'flight', 'Quest': 'quest-object', 'GatherSource': 'native-resource'}

# Reviewed EliteMonster encounters with a native KillNpc objective and multiple
# scripted HP objectives. Their Boss label is editorial, not a native subtype.
EDITORIAL_BOSS_NPC_IDS = frozenset({2200196, 2200202, 2290046, 2500166, 2500180, 2590256})


def classify_boss_marker(npc, world_boss_names):
    if value(npc['ID']) in EDITORIAL_BOSS_NPC_IDS:
        return 'dungeon-boss'
    if npc['Name'] in world_boss_names:
        return 'boss'
    if npc.get('bNamed') and npc.get('NpcSubType') in ('ENpcSubType::HeroMonster', 'ENpcSubType::LegendMonster'):
        return 'dungeon-boss'
    return None


def ui_positions(path):
    data = json.loads(path.read_text('utf8'))
    exports = {e['index']: e for e in data['exports']}
    positions = {}
    for entry in exports.values():
        props = entry['properties']
        if 'LocationName' not in props or 'RootComponent' not in props:
            continue
        index = int(props['RootComponent']['ObjectPath'].split('.')[-1])
        positions[props['LocationName']] = exports[index]['properties'].get('RelativeLocation', {'X': 0, 'Y': 0})
    return positions


def build(ctx, spawn_dir, world_dir, publish_markers=True):
    npcs = {r['Name']: r for r in ctx.rows('NpcData')}
    envs = {r['Name']: r for r in ctx.rows('EnvObjData')}
    bosses = {r['FieldNamedName'] for r in ctx.rows('WorldMapFieldNamed')}
    map_rows = {value(r['ID']): r for r in ctx.rows('Map')}
    dungeon_by_map = defaultdict(list)
    for row in ctx.rows('Dungeon'):
        dungeon_by_map[value(row['MapId'])].append(row)
    for row in envs.values():
        usage = row['Usage'].split('::')[-1]
        if usage not in ENV_CATEGORIES:
            continue
        entry = ctx.entry('EnvObjData', row, 'exploration', name=ctx.text(row['Desc'], human(usage)), group=human(usage), fields={'bHideWorldMapMarker': 'Hidden on the game world map', 'bPeriodObj': 'Periodic object', 'bGetRewardOnce': 'One-time reward', 'Level': 'Required level', 'CombatPower': 'Required combat power'}, description=ctx.text(row['InteractDesc']))
        table = {'TeleportArtifact': 'TeleportArtifact', 'Monolith': 'Monolith', 'Rift': 'RiftData', 'GatherSource': 'GatherSource', 'EnterDungeon': 'Dungeon', 'PartyDungeon': 'Dungeon'}.get(usage)
        links = []
        if table and (table, str(row['UsageValue']).casefold()) in ctx.aliases:
            links.append(ctx.link(table, row['UsageValue']))
        if usage in ('EnterDungeon', 'PartyDungeon'):
            for map_id, map_row in map_rows.items():
                if row['UsageValue'] in (map_row['Name'], map_row['EntranceName']):
                    links += [ctx.link('Dungeon', r['ID']) for r in dungeon_by_map[map_id]]
        ctx.section(entry, 'Related content', links=links)
    for map_id, slug, internal, spawn_name, half in MAPS:
        path = ctx.public / 'maps' / slug / 'metadata.json'
        metadata = json.loads(path.read_text('utf8'))
        bounds = metadata['bounds']
        width = bounds['maxX'] - bounds['minX']
        height = bounds['maxY'] - bounds['minY']
        entry = ctx.entry('Map', map_rows[map_id], 'exploration', name=metadata['displayName'], group='Region')
        ui_file = world_dir / ('WorldMap_' + internal + '.json')
        design_file = world_dir / ('WorldMap_' + internal + '_Design.json')
        ui_data = json.loads(ui_file.read_text('utf8'))
        planes = [e for e in ui_data['exports'] if 'SectorTexture' in e['properties']]
        grid_size = round(len(planes) ** .5)
        if grid_size * grid_size != len(planes):
            raise ValueError(f'Non-square UI plane grid: {slug}')
        ui_width = grid_size * 1024
        positions = ui_positions(ui_file)
        if design_file.exists():
            positions.update(ui_positions(design_file))
        regions = []
        for row in ctx.rows('WorldMapUIRegion'):
            if value(row['MapId']) != map_id or not row['bEnableWorldMap']:
                continue
            pos = positions.get(row['WorldMapNameActor'])
            if not pos:
                ctx.warnings['unresolved-region-position'] += 1
                continue
            x, y = round((pos['X'] / ui_width + .5) * width), round((pos['Y'] / ui_width + .5) * height)
            if not (0 <= x <= width and 0 <= y <= height):
                ctx.warnings['out-of-bounds-region'] += 1
                continue
            importance = 'major' if row['WorldMapInfoType'].endswith('::Region_Rank1') else 'minor'
            regions.append({'id': row['WorldMapNameActor'], 'name': ctx.text(row['Desc'], human(row['WorldMapNameActor'])), 'importance': importance, 'x': x, 'y': y, 'description': ctx.text(row['DetailDesc'])})
        metadata['regions'] = list({r['id']: r for r in regions}.values())
        ctx.section(entry, 'Regions', rows=[{'name': r['name'], 'description': r['description']} for r in metadata['regions']])
        if not publish_markers:
            write(path, metadata)
            continue
        if not spawn_name:
            ctx.warnings['missing-world-spawn-export'] += 1
            write(path, metadata)
            continue
        old = {(p['category'], p['name'], p['x'], p['y']): p for p in metadata['locations']}
        seen = set()
        native = []
        actors = defaultdict(list)
        for line in (spawn_dir / (spawn_name + '-spawns.jsonl')).read_text('utf8').splitlines():
            record = json.loads(line)
            entity = npcs.get(record['npcName'])
            category, reference = None, None
            if entity:
                function = entity['FunctionType'].split('::')[-1]
                category = classify_boss_marker(entity, bosses)
                if not category:
                    if function == 'BuySell':
                        category = 'merchant'
                    elif function.startswith('Craft') or function in ('Cook', 'Tailor', 'Blacksmith', 'Alchemy', 'Jewelcraft', 'GuildCraft'):
                        category = 'craft-service'
                    elif 'Storage' in function:
                        category = 'storage'
                    elif 'Teleport' in function:
                        category = 'teleport'
                    elif entity['NpcType'].endswith('::Monster') and entity['bCanBeAttacked']:
                        category = 'enemy'
                reference = ctx.link('NpcData', entity['ID']) if category else None
            else:
                entity = envs.get(record['npcName'])
                if entity:
                    category = ENV_CATEGORIES.get(entity['Usage'].split('::')[-1])
                    reference = ctx.link('EnvObjData', entity['ID']) if category else None
            if not category or not reference:
                continue
            name = ctx.text(entity['Desc'], reference['name'])
            x = round(bounds['minX'] + width / 2 + record['worldX'] * width / (2 * half))
            y = round(bounds['minY'] + height / 2 + record['worldY'] * height / (2 * half))
            world_position = {axis: record['world' + axis] for axis in ('X', 'Y', 'Z')}
            if metadata.get('worldProjection'):
                from importlib import import_module
                projected = import_module('world-marker-sources').project(world_position, metadata['worldProjection'], bounds)
                x, y = projected['x'], projected['y']
            if not (bounds['minX'] <= x <= bounds['maxX'] and bounds['minY'] <= y <= bounds['maxY']):
                ctx.warnings['out-of-bounds-native-spawn'] += 1
                continue
            unique = (category, name, x, y)
            if unique in seen:
                continue
            seen.add(unique)
            point = old.get(unique)
            if not point:
                digest = hashlib.sha1(f'{slug}/{category}/{entity["Name"]}/{x}/{y}'.encode()).hexdigest()[:16]
                point = {'id': f'{slug}-{category}-{digest}', 'name': name, 'category': category, 'x': x, 'y': y}
                native.append(point)
            point.update({'entityId': str(value(entity['ID'])), 'reference': {'id': reference['id'], 'category': reference['category']}, 'worldPosition': world_position, 'elevation': record['worldZ'], 'spawnCount': record['spawnCount'], 'spawnProbability': record['probability'], 'sourceActor': record['actor'], 'sourceAsset': record['asset']})
            location = {'mapId': slug, 'markerId': point['id'], 'name': metadata['displayName'] + ' · ' + name}
            target = ctx.entries[reference['id']]
            target['locations'].append(location)
            for section in target['sections']:
                if section['title'] == ctx.label('Related content'):
                    for link in section.get('links', []):
                        related = ctx.entries[link['id']]
                        related['locations'].append(location)
                        if link['id'].startswith('TeleportArtifact:') and related['name'].startswith('Teleport Artifact '):
                            related['name'] = name
            actors[record['actor']].append(location)
            actors[entity['Name']].append(location)
        metadata['locations'].extend(native)
        for row in ctx.rows('Achievement'):
            target = ctx.entries['Achievement:' + str(value(row['AchievementId']))]
            for val in row.get('ObjValues', []):
                target['locations'].extend(actors.get(val, []))
                for table in ('TeleportArtifact', 'EnvObjData', 'NpcData'):
                    key = ctx.aliases.get((table, str(val).casefold()))
                    if key:
                        target['locations'].extend(l for l in ctx.entries[key]['locations'] if l['mapId'] == slug)
        for row in ctx.rows('QuestStep'):
            target = ctx.entries.get(ctx.aliases.get(('Quest', row['QuestName'].casefold())))
            if not target:
                continue
            for goal in row['GoalList']:
                for val in [part.strip() for cell in goal['Value'] for part in cell.split(',')]:
                    target['locations'].extend(actors.get(val, []))
                    for table in ('NpcData', 'EnvObjData'):
                        key = ctx.aliases.get((table, str(val).casefold()))
                        if key:
                            target['locations'].extend(l for l in ctx.entries[key]['locations'] if l['mapId'] == slug)
        write(path, metadata)
    for entry in ctx.entries.values():
        destination = entry.get('destination')
        if destination and ('Map', str(destination['mapId'])) in ctx.aliases:
            ctx.section(entry, 'Destination', links=[ctx.link('Map', destination['mapId'])])
    for row in ctx.rows('NpcData'):
        entry = ctx.entries.get('NpcData:' + str(value(row['ID'])))
        if not entry:
            continue
        function = row['FunctionType'].split('::')[-1]
        if function in ('Cook', 'Tailor', 'Blacksmith', 'Alchemy', 'Jewelcraft'):
            ctx.section(entry, 'Available recipes', links=[ctx.link('CraftRecipe', r['ID']) for r in ctx.rows('CraftRecipe') if r['Category'].split('::')[-1] == function])
        if function == 'NpcTeleport':
            ctx.section(entry, 'Destinations', links=[ctx.link('NpcTeleport', r['ID']) for r in ctx.rows('NpcTeleport') if str(r['GroupId']) in row['FuncValues']])
