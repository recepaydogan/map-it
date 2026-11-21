"""Reconcile all shipped world maps against native spawn coordinates."""
import hashlib
import json
import math
from collections import Counter, defaultdict
from importlib import import_module
from context import value, write
from world import MAPS


def build(ctx, map_data, spawn_dir=None):
    sources = import_module('world-marker-sources')
    details = import_module('world-marker-details')
    details.register(ctx)
    details.connect_entrances(ctx)
    gathering = details.gathering(ctx)
    artwork_path = ctx.public / 'data/reference/entity-artwork.json'
    artwork = json.loads(artwork_path.read_text('utf8'))['icons'] if artwork_path.exists() else {}
    exports = sources.read_exports(map_data)
    entities = {table: {value(row['ID']): row for row in ctx.rows(table)} for table in ('NpcData', 'EnvObjData')}
    bosses = {row['FieldNamedName'] for row in ctx.rows('WorldMapFieldNamed')}
    internal = import_module('adventure-identities').INTERNAL_NAME
    report = {'version': 1, 'maps': [], 'unresolved': [], 'unmappedDungeons': []}
    actors = defaultdict(list)
    for map_id, slug, _, legacy_name, half in MAPS:
        path = ctx.public / 'maps' / slug / 'metadata.json'
        metadata = json.loads(path.read_text('utf8'))
        import_module('legacy-creature-references').restore(ctx, metadata, slug)
        projection = metadata.get('worldProjection')
        if not projection or projection['mapId'] != map_id or map_id not in exports:
            raise ValueError('Missing authoritative world map source or projection: ' + slug)
        export = exports[map_id]
        bounds, points = metadata['bounds'], metadata['locations']
        layers = {}
        for name in ('gatherables', 'collectables'):
            layer_path = path.parent / (name + '.json')
            if layer_path.exists():
                layers[layer_path] = json.loads(layer_path.read_text('utf8'))
        counts = Counter()
        for layer in layers.values():
            canvas = layer.get('sourceCanvas')
            if not canvas or not layer.get('scale'):
                continue
            scale_x = (bounds['maxX'] - bounds['minX']) / canvas['width']
            scale_y = (bounds['maxY'] - bounds['minY']) / canvas['height']
            if scale_x != scale_y:
                raise ValueError('Non-square snapshot scale requires explicit calibration: ' + slug)
            if abs(layer['scale'] - scale_x) > 1e-9:
                for point in layer['locations']:
                    if not point.get('worldPosition'):
                        point['x'] = round(bounds['minX'] + (point['x'] - bounds['minX']) / layer['scale'] * scale_x, 3)
                        point['y'] = round(bounds['minY'] + (point['y'] - bounds['minY']) / layer['scale'] * scale_y, 3)
                        counts['rescaledLayerPoints'] += 1
                layer['scale'] = scale_x
        all_points = points + [point for layer in layers.values() for point in layer['locations']]
        protected = {point['id']: json.dumps(point, sort_keys=True) for point in all_points if point['category'] in sources.TRAVEL_CATEGORIES}
        if half:
            # Previous UMap imports used an assumed centered square. Reconstruct
            # that basis once, then use the client's actual origin and sector size.
            native = defaultdict(list)
            if spawn_dir and legacy_name:
                legacy_path = spawn_dir / (legacy_name + '-spawns.jsonl')
                if legacy_path.exists():
                    for line in legacy_path.read_text('utf8').splitlines():
                        record = json.loads(line)
                        native[record['actor']].append(record)
            for point in points:
                if point['category'] in sources.TRAVEL_CATEGORIES or not point.get('sourceAsset', '').endswith('.umap'):
                    continue
                if metadata.get('nativeMarkerImportVersion') and not point.get('worldPosition'):
                    continue
                old_world = {axis: ((point[axis.lower()] - bounds['min' + axis]) / (bounds['max' + axis] - bounds['min' + axis]) - .5) * 2 * half for axis in ('X', 'Y')}
                old_world['Z'] = point.get('elevation', 0)
                candidates = native.get(point.get('sourceActor'), []) if not point.get('worldPosition') else []
                if candidates:
                    record = min(candidates, key=lambda record: math.hypot(record['worldX'] - old_world['X'], record['worldY'] - old_world['Y']))
                    old_world = {axis: record['world' + axis] for axis in ('X', 'Y', 'Z')}
                old_world = point.get('worldPosition', old_world)
                xy = sources.project(old_world, projection, bounds)
                if math.hypot(point['x'] - xy['x'], point['y'] - xy['y']) > 1:
                    counts['reprojected'] += 1
                point.update(xy)
                point['worldPosition'] = old_world

        by_reference, by_cell = defaultdict(list), defaultdict(list)
        for point in all_points:
            by_reference[point.get('reference', {}).get('id')].append(point)
            by_cell[(int(point['x'] // 4), int(point['y'] // 4))].append(point)
        seen, claimed, aliases = {}, set(), {}
        for spawn in export['data']['Properties']['Data']['SpawnInfoList']:
            for table, field in (('NpcData', 'NpcIdList'), ('EnvObjData', 'EnvObjIdList')):
                for cell in spawn[field]:
                    row = entities[table].get(value(cell))
                    if not row:
                        raise ValueError(f'Unknown native {table} ID: {value(cell)}')
                    reference = table + ':' + str(value(cell))
                    entry = ctx.entries.get(reference, {})
                    category = sources.classify(table, row, entry, bosses)
                    if not category or category in sources.TRAVEL_CATEGORIES:
                        continue
                    if not entry or entry.get('unnamed') or internal.search(entry.get('name', '')):
                        report['unresolved'].append({'mapId': slug, 'reference': reference, 'reason': 'missing-readable-name', 'actor': spawn['Name']})
                        continue
                    resource = gathering.get(reference)
                    if resource:
                        category = resource['category']
                    for transform in spawn['Positions']:
                        world = transform['Location']
                        xy = sources.project(world, projection, bounds)
                        identity = (reference, xy['x'], xy['y'])
                        if identity in seen:
                            continue
                        if not (bounds['minX'] <= xy['x'] <= bounds['maxX'] and bounds['minY'] <= xy['y'] <= bounds['maxY']):
                            report['unresolved'].append({'mapId': slug, 'reference': reference, 'reason': 'outside-map', 'actor': spawn['Name'], 'world': world})
                            continue
                        candidates = [point for point in by_reference[reference] if point['id'] not in claimed
                                      and point['category'] not in sources.TRAVEL_CATEGORIES
                                      and math.hypot(point['x'] - xy['x'], point['y'] - xy['y']) <= 4]
                        if resource or category == 'collect-object':
                            cell_x, cell_y = int(xy['x'] // 4), int(xy['y'] // 4)
                            nearby = [point for dx in (-1, 0, 1) for dy in (-1, 0, 1) for point in by_cell[(cell_x + dx, cell_y + dy)]]
                            snapshot_candidates = [point for point in nearby if point['id'] not in claimed and not point.get('reference')
                                          and math.hypot(point['x'] - xy['x'], point['y'] - xy['y']) <= 1
                                          and ((resource and (point.get('itemId') in resource['itemIds'] or point['category'] == category)) or
                                               (category == 'collect-object' and point['category'].startswith('collect-') and point['name'] == entry['name']))]
                            if len(snapshot_candidates) == 1:
                                digest = hashlib.sha256(f'{map_id}/{reference}/{world["X"]}/{world["Y"]}/{world["Z"]}'.encode()).hexdigest()[:16]
                                generated_id = f'{slug}-{category}-{digest}'
                                redundant = next((point for point in candidates if point['id'] == generated_id), None)
                                if redundant:
                                    # Only reconcile a marker generated by this importer,
                                    # retaining the older snapshot ID and player progress.
                                    aliases[generated_id] = snapshot_candidates[0]['id']
                                    points.remove(redundant)
                                    all_points.remove(redundant)
                                    counts['reusedSnapshotIds'] += 1
                                    candidates = snapshot_candidates
                                elif not candidates:
                                    candidates = snapshot_candidates
                        marker = min(candidates, key=lambda point: math.hypot(point['x'] - xy['x'], point['y'] - xy['y'])) if candidates else None
                        if marker is None:
                            digest = hashlib.sha256(f'{map_id}/{reference}/{world["X"]}/{world["Y"]}/{world["Z"]}'.encode()).hexdigest()[:16]
                            marker = {'id': f'{slug}-{category}-{digest}', 'name': entry['name'], 'category': category}
                            points.append(marker)
                            all_points.append(marker)
                            by_reference[reference].append(marker)
                            counts['added'] += 1
                        else:
                            counts['matched'] += 1
                            if math.hypot(marker['x'] - xy['x'], marker['y'] - xy['y']) > 1:
                                counts['corrected'] += 1
                        claimed.add(marker['id'])
                        seen[identity] = marker['id']
                        # Existing collectible IDs retain their category and item identity.
                        if not marker['category'].startswith('collect-'):
                            marker['category'] = category
                        marker.update({**xy, 'name': entry['name'], 'entityId': str(value(cell)),
                                       'reference': {'id': reference, 'category': entry['category']},
                                       'sourceActor': spawn['Name'], 'sourceAsset': export['asset'],
                                       'worldPosition': world, 'elevation': world['Z']})
                        if category == 'event-entrance' and reference in artwork:
                            marker['iconPath'] = artwork[reference]
                        if category == 'merchant':
                            shop_name = next(iter(row.get('FuncValues', [])), '')
                            merchant_icon = sources.merchant_icon_path(shop_name)
                            if merchant_icon:
                                marker['iconPath'] = merchant_icon
                        marker.pop('hiddenFromMap', None)
                        if resource and len(resource['itemIds']) == 1:
                            marker['itemId'] = next(iter(resource['itemIds']))
                        location = {'mapId': slug, 'markerId': marker['id'], 'name': metadata['displayName'] + ' · ' + marker['name']}
                        actors[spawn['Name']].append(location)
                        actors[row['Name']].append(location)
                        related = [entry] + [ctx.entries[link['id']] for section in entry['sections']
                                            if section['title'] in ('reference.labels.related-content', 'reference.adventure.dungeonGuide',
                                                                    'reference.adventure.entranceDestinations', 'reference.adventure.relatedQuests')
                                            for link in section.get('links', []) if link['id'] in ctx.entries and link['category'] in ('dungeons', 'quests')]
                        for target in related:
                            target['locations'].append(location)
        for quest, actor, world in details.quest_points(ctx, map_id, export['data']['Properties']['Data']):
            xy = sources.project(world, projection, bounds)
            if not (bounds['minX'] <= xy['x'] <= bounds['maxX'] and bounds['minY'] <= xy['y'] <= bounds['maxY']):
                raise ValueError('Quest objective is outside the published map: ' + actor)
            digest = hashlib.sha256(f'{map_id}/{quest["id"]}/{actor}'.encode()).hexdigest()[:16]
            marker_id = f'{slug}-quest-area-{digest}'
            marker = next((point for point in points if point['id'] == marker_id), None)
            if marker is None:
                marker = {'id': marker_id, 'name': quest['name'], 'category': 'quest-area'}
                points.append(marker)
                all_points.append(marker)
                counts['addedQuestAreas'] += 1
            marker.update({**xy, 'reference': {'id': quest['id'], 'category': 'quests'},
                           'worldPosition': world, 'sourceActor': actor, 'sourceAsset': export['asset']})
            quest['locations'].append({'mapId': slug, 'markerId': marker_id, 'name': metadata['displayName'] + ' · ' + quest['name']})
        for point in all_points:
            if point['id'] in protected and json.dumps(point, sort_keys=True) != protected[point['id']]:
                raise ValueError('Travel marker changed during world import: ' + point['id'])
        metadata['nativeMarkerImportVersion'] = 1
        if aliases:
            for entry in ctx.entries.values():
                if entry['category'] != 'travel':
                    for location in entry['locations']:
                        if location['mapId'] == slug and location['markerId'] in aliases:
                            location['markerId'] = aliases[location['markerId']]
        write(path, metadata)
        for layer_path, layer in layers.items():
            write(layer_path, layer)
        report['maps'].append({'mapId': slug, **dict(counts), 'source': export['asset'], 'coveredNativePositions': len(seen)})
        print(slug + ': ' + json.dumps(dict(counts)), flush=True)
    for row in ctx.rows('Achievement'):
        entry = ctx.entries.get('Achievement:' + str(value(row['AchievementId'])))
        if entry:
            for token in row.get('ObjValues', []):
                entry['locations'].extend(actors.get(token, []))
    quests = {row['Name']: ctx.entries.get('Quest:' + str(value(row['ID']))) for row in ctx.rows('Quest')}
    for row in ctx.rows('QuestStep'):
        entry = quests.get(row['QuestName'])
        if entry:
            for goal in row['GoalList']:
                for cell in goal['Value']:
                    for token in cell.split(','):
                        entry['locations'].extend(actors.get(token.strip(), []))
    for entry in ctx.entries.values():
        if entry['category'] != 'travel':
            entry['locations'] = list({(location['mapId'], location['markerId']): location for location in entry['locations']}.values())
        if entry['category'] == 'dungeons' and entry.get('adventure', {}).get('listed') and not entry['locations']:
            report['unmappedDungeons'].append(entry['id'])
    write(ctx.public / 'data/reference/world-marker-import.json', report)
    return report
