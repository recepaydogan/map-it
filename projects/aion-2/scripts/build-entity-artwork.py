"""Publish exact native artwork associations without rewriting map/reference payloads."""
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import json
import os
from pathlib import Path
import struct
import tempfile
import time


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def publish(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    if path.exists() and path.read_bytes() == data:
        return
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as file:
        file.write(data)
        temporary = Path(file.name)
    try:
        for attempt in range(12):
            try:
                os.replace(temporary, path)
                break
            except OSError as error:
                if getattr(error, 'winerror', None) not in (5, 32, 33) or attempt == 11:
                    raise
                time.sleep(0.2 * (attempt + 1))
    finally:
        if temporary.exists():
            temporary.unlink()


def build(args):
    inputs = {}

    def rows(name):
        path = args.tables / (name + '.json')
        inputs[name] = sha256(path.read_bytes()).hexdigest()
        return read(path)['Properties']['Data']

    aliases = defaultdict(set)
    for path in sorted(args.ui_tables.rglob('UI_*.json')):
        inputs[path.name] = sha256(path.read_bytes()).hexdigest()
        for export in read(path):
            for key, row in export.get('Rows', {}).items():
                asset = (row.get('ResourceObject_Global', {}).get('AssetPathName')
                         or row.get('ResourceObject', {}).get('AssetPathName'))
                if asset:
                    aliases[key.casefold()].add(asset.split('.')[0])

    textures, texture_names = {}, defaultdict(set)
    for root in args.textures:
        for path in sorted(root.rglob('*.png')):
            relative = path.as_posix().split('/Content/', 1)
            if len(relative) != 2:
                continue
            asset = '/Game/' + relative[1][:-4]
            key = asset.casefold()
            if key in textures and textures[key].read_bytes() != path.read_bytes():
                raise ValueError('Conflicting texture exports: ' + asset)
            textures[key] = path
            texture_names[path.stem.casefold()].add(asset)

    candidates = defaultdict(list)

    def candidate(identity, key, source, priority=0):
        if key and key != 'None':
            record = {'key': key, 'source': source, 'priority': priority}
            if record not in candidates[identity]:
                candidates[identity].append(record)

    npc_rows, env_rows = rows('NpcData'), rows('EnvObjData')
    names = {}
    for table, data in [('NpcData', npc_rows), ('EnvObjData', env_rows)]:
        names[table] = {row['Name']: f"{table}:{row['ID']['Value']}" for row in data}
        for row in data:
            identity = f"{table}:{row['ID']['Value']}"
            candidate(identity, row.get('Portrait'), identity + '.Portrait')
            if table == 'NpcData':
                resource_key = row.get('ResourceKey')
                if resource_key and resource_key != 'None' and ('UT_256_' + resource_key).casefold() in texture_names:
                    candidate(identity, 'UT_256_' + resource_key,
                              identity + '.ResourceKey -> exact portrait texture', 3)
                if resource_key and resource_key.startswith('MOB_'):
                    vehicle_portrait = 'UT_Vehicle_Portrait_' + resource_key.removeprefix('MOB_')
                    if vehicle_portrait.casefold() in texture_names:
                        candidate(identity, vehicle_portrait,
                                  identity + '.ResourceKey -> exact vehicle portrait texture', 4)

    # Reward portraits explicitly identify the corresponding boss, including mid-bosses.
    for row in rows('RewardOdEnergyCube'):
        pairs = [(row['FinalBossName'], row['FinalBossPortrait'], 'FinalBossPortrait')]
        pairs += [(boss['BossName'], boss['Portrait'], 'RewardMiddleBossList') for boss in row['RewardMiddleBossList']]
        for name, key, field in pairs:
            if name in names['NpcData']:
                candidate(names['NpcData'][name], key, f"RewardOdEnergyCube:{row['ID']['Value']}.{field}", 1)

    # Only explicit speakers are eligible; dialogue names and title text are not identities.
    for row in rows('NpcTalk'):
        table = {'ENpcTalkSpeakerType::Npc': 'NpcData', 'ENpcTalkSpeakerType::EnvObj': 'EnvObjData'}.get(row['SpeakerType'])
        if table and row['SpeakerValue'] in names[table]:
            candidate(names[table][row['SpeakerValue']], row['Portrait'], f"NpcTalk:{row['ID']['Value']}.Portrait", 2)

    for table, field in [('Dungeon', 'ImageThumnailRes'), ('FieldEvent', 'Thumbnail'), ('BossChallengeGroup', 'InfoThumbnail')]:
        for row in rows(table):
            identity = f"{table}:{row['ID']['Value']}"
            candidate(identity, row[field], identity + '.' + field)

    filters = {row['Type']: row for row in rows('WorldMapFilterType')}
    quest_types = {row['Type']: row for row in rows('QuestType')}
    for row in rows('Quest'):
        identity = f"Quest:{row['ID']['Value']}"
        definition = quest_types.get(row['Type'], {})
        icon = filters.get(definition.get('WorldMapFilterType'), {})
        field = 'ImageDark' if row['Race'] == 'ERace::Dark' else 'ImageLight'
        candidate(identity, icon.get(field), f"QuestType:{row['Type']} -> WorldMapFilterType:{icon.get('Type')}.{field}")

    icons, evidence, assets, unresolved = {}, {}, {}, []
    for identity, choices in sorted(candidates.items()):
        resolved, failures = defaultdict(list), []
        for choice in choices:
            key = choice['key']
            paths = aliases.get(key.casefold(), set())
            method = 'resource-table'
            if not paths and key.startswith('/Game/'):
                paths, method = {key.split('.')[0]}, 'asset-path'
            if not paths and key.startswith('UT_'):
                # Some authored Portrait fields contain the exact texture object name.
                paths, method = texture_names.get(key.casefold(), set()), 'exact-texture-object-name'
            if len(paths) != 1:
                failures.append({**choice, 'reason': 'missing-alias' if not paths else 'ambiguous-alias'})
                continue
            asset = next(iter(paths))
            path = textures.get(asset.casefold())
            if not path:
                failures.append({**choice, 'asset': asset, 'reason': 'texture-not-exported'})
                continue
            resolved[choice['priority']].append({**choice, 'asset': asset, 'method': method})
        if not resolved:
            unresolved.append({'id': identity, 'references': failures})
            continue
        best = resolved[min(resolved)]
        if len({record['asset'].casefold() for record in best}) != 1:
            unresolved.append({'id': identity, 'reason': 'conflicting-explicit-portraits', 'references': best})
            continue
        chosen = best[0]
        asset = chosen['asset']
        if asset not in assets:
            data = textures[asset.casefold()].read_bytes()
            if data[:8] != b'\x89PNG\r\n\x1a\n':
                raise ValueError('Invalid PNG: ' + asset)
            width, height = struct.unpack('>II', data[16:24])
            if not width or not height:
                raise ValueError('Empty image: ' + asset)
            digest = sha256(data).hexdigest()
            filename = Path(asset).name.lower().replace('_', '-') + '-' + digest[:12] + '.png'
            destination = 'data/reference/artwork/' + filename
            target = args.public / destination
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists() or sha256(target.read_bytes()).hexdigest() != digest:
                target.write_bytes(data)
            assets[asset] = {'path': destination, 'sha256': digest, 'width': width, 'height': height}
        icons[identity] = assets[asset]['path']
        evidence[identity] = chosen

    catalog = read(args.public / 'data/items/catalog.json')
    item_icons = {item['id']: item['icon'] for item in catalog['items'] if item.get('icon')}
    source_items = {row['Name']: str(row['ID']['Value']) for row in rows('Item')}
    gathering = {row['Name']: row for row in rows('GatherSource')}
    materials = defaultdict(list)
    for row in rows('GatherSourceMaterial'):
        materials[row['MaterialGroup']].append(row)
    # A gathering node uses its first authored material tier, not a random possible bonus drop.
    for row in env_rows:
        identity = 'EnvObjData:' + str(row['ID']['Value'])
        if identity in icons or row['Usage'] != 'EEnvObjectUsage::GatherSource':
            continue
        source = gathering.get(row['UsageValue'], {})
        tiers = sorted(materials.get(source.get('MaterialGroup'), []), key=lambda tier: tier['GroupKey'])
        if tiers:
            item_id = source_items.get(tiers[0]['MaterialName'])
            if item_id in item_icons:
                icons[identity] = item_icons[item_id]
                evidence[identity] = {'source': 'EnvObjData.UsageValue -> GatherSource.MaterialGroup -> GatherSourceMaterial.MaterialName', 'itemId': item_id}

    # Entrance associations are already established by the source importer. Never borrow boss art for a dungeon.
    for path in sorted((args.public / 'data/reference/exploration').glob('*.json')):
        for identity, entry in read(path)['entries'].items():
            if identity in icons:
                continue
            related = {link['id'] for section in entry['sections'] for link in section.get('links', [])
                       if link['id'].startswith(('Dungeon:', 'FieldEvent:'))}
            paths = {icons[related_id] for related_id in related if related_id in icons}
            if related and all(related_id in icons for related_id in related) and len(paths) == 1:
                icons[identity] = paths.pop()
                evidence[identity] = {'source': 'explicit-entrance-destinations', 'ids': sorted(related)}

    counts, missing_markers, linked_markers, used_items = {}, [], [], {}
    for path in sorted((args.public / 'maps').glob('*/*.json')):
        if path.name not in ('metadata.json', 'gatherables.json', 'collectables.json') or path.parent.name == 'sample':
            continue
        data = read(path)
        count = counts.setdefault(path.parent.name, Counter())
        for point in data.get('locations', []):
            if point.get('hiddenFromMap'):
                continue
            count['total'] += 1
            identity = point.get('reference', {}).get('id')
            item_id = point.get('itemId')
            icon = item_icons.get(item_id) or icons.get(identity)
            if icon:
                if not (args.public / icon).is_file():
                    raise ValueError('Missing published artwork: ' + icon)
                count['linked'] += 1
                linked_markers.append({'mapId': path.parent.name, 'markerId': point['id'], 'referenceId': identity, 'itemId': item_id, 'icon': icon})
                if item_id in item_icons:
                    used_items[item_id] = item_icons[item_id]
            else:
                reason = 'unresolved-reference' if identity in candidates else 'no-authored-image-reference'
                count[reason] += 1
                missing_markers.append({'mapId': path.parent.name, 'markerId': point['id'], 'referenceId': identity, 'reason': reason})

    output = args.public / 'data/reference'
    missing_exports = [entry for entry in unresolved if entry['id'] not in icons
                       and any(reference.get('reason') == 'texture-not-exported' for reference in entry['references'])]
    if missing_exports:
        raise ValueError('Export the referenced textures before publishing: ' + json.dumps(missing_exports))
    publish(output / 'entity-artwork.json', {'version': 1, 'icons': icons, 'items': used_items})
    publish(output / 'entity-artwork-sources.json', {'version': 1, 'inputs': inputs, 'assets': assets, 'entities': evidence})
    audit = {'version': 1, 'maps': counts, 'linkedEntities': len(icons), 'publishedAssets': len(assets),
             'unresolvedReferences': [entry for entry in unresolved if entry['id'] not in icons],
             'linkedMarkers': linked_markers, 'markersWithoutEntityArtwork': missing_markers}
    publish(output / 'entity-artwork-audit.json', audit)
    print(json.dumps({'linkedEntities': len(icons), 'publishedAssets': len(assets), 'maps': counts,
                      'unresolvedEntities': len(audit['unresolvedReferences'])}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', type=Path, required=True)
    parser.add_argument('--ui-tables', type=Path, required=True)
    parser.add_argument('--textures', type=Path, action='append', required=True)
    parser.add_argument('--public', type=Path, default=Path('public'))
    build(parser.parse_args())
