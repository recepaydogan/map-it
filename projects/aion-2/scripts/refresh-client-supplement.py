"""Merge a scoped, decoded client snapshot without replacing historical catalogs.

The scope is an explicit JSON input. Unknown schema fields never become UI facts.
Official rule overrides are recorded separately from decoded table evidence.
"""
import argparse
import copy
import hashlib
import importlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, human, value, write


def read(path):
    return json.loads(Path(path).read_text('utf8'))


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save_changed(path, data):
    if not path.exists() or read(path) != data:
        write(path, data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--localization', required=True)
    parser.add_argument('--raw', required=True)
    parser.add_argument('--scope', required=True)
    parser.add_argument('--public', default='public')
    parser.add_argument('--locale', default='src/i18n/locales/en.json')
    args = parser.parse_args()
    scope = read(args.scope)
    ctx = Context(args.tables, args.localization, args.public)
    base = ctx.public / 'data/reference'
    audit_path = base / 'client-supplement.json'
    previous_audit = read(audit_path) if audit_path.exists() else {}
    if previous_audit.get('build') != scope['build']:
        previous_audit = {}
    index = read(base / 'index.json')
    chunks = {}
    existing_summaries = {s['id']: s for s in index['entries']}

    class LazyEntries(dict):
        def __missing__(self, identity):
            summary = existing_summaries[identity]
            path = base / summary['category'] / (summary['chunk'] + '.json')
            if path not in chunks:
                chunks[path] = read(path)
            self[identity] = copy.deepcopy(chunks[path]['entries'][identity])
            return self[identity]

        def get(self, identity, default=None):
            return self[identity] if identity in self else default

        def __contains__(self, identity):
            return super().__contains__(identity) or identity in existing_summaries

    ctx.entries = LazyEntries()
    for summary in index['entries']:
        table, key = summary['id'].split(':', 1)
        ctx.aliases[table, key.casefold()] = summary['id']
    original_items = copy.deepcopy(ctx.items)
    dirty = set()
    touched_items = set()
    native_items = {str(value(r['ID'])): r for r in ctx.rows('Item')}
    selected_items = set(scope['itemIds'])
    selected_items.update(previous_audit.get('addedItemIds', []))
    if scope.get('addMissingItems'):
        selected_items.update(set(native_items) - set(ctx.items))
    icons = read(ctx.public / 'data/items/icon-sources.json')
    icon_by_key = {r['iconKey'].casefold(): r['assetPath'] for r in icons['items']}
    asset_by_path = {r['assetPath']: r for r in icons['assets']}

    def item_refresh(item_id):
        row = native_items[item_id]
        if item_id not in ctx.items:
            if row['ItemType'].endswith('::Equip'):
                raise ValueError('Equipment needs the full stat importer: ' + item_id)
            kind = row['ItemType'].split('::')[-1]
            field = {'Usable': 'UsableCategory', 'Misc': 'MiscCategory'}.get(kind)
            category = row.get(field, kind).split('::')[-1]
            category_key = 'STR_ITEM_TOOLTIP_' + ('Misc_' if kind == 'Misc' else '') + category
            ctx.items[item_id] = {
                'id': item_id, 'category': ctx.text(category_key, human(category)),
                'grade': ctx.text('Tooltip_Grade_' + row['ItemGrade'].split('::')[-1], human(row['ItemGrade'])),
                'usageLevel': row['PermitLevelMin'], 'itemLevel': row['ItemLevel'],
                'sections': [], 'enhancements': [],
                'source': ctx.source_prefix + 'Item.dat#' + item_id,
            }
            ctx.catalog['items'].append(ctx.items[item_id])
        item = ctx.items[item_id]
        name = ctx.text(row['Desc'])
        if not name:
            raise ValueError('Missing exact localized item name: ' + item_id)
        item.update(name=name, nameVerified=True, binding=human(row['ExchangeType']),
                    canDismantle=bool(row['CanDecompose']))
        item.pop('nameOrigin', None)
        description = ctx.text(row['DescLong'])
        if description:
            item['description'] = description
        asset = asset_by_path.get(icon_by_key.get(row['IconRes'].casefold()))
        if asset:
            item['icon'] = asset['path']
            if not any(i['id'] == item_id for i in icons['items']):
                icons['items'].append({'id': item_id, 'iconKey': row['IconRes'], 'assetPath': asset['assetPath']})
        touched_items.add(item_id)
        return item

    for item_id in sorted(selected_items):
        item_refresh(item_id)

    def entry(table, row, category, **kwargs):
        result = ctx.entry(table, row, category, **kwargs)
        dirty.add(result['id'])
        return result

    # Register current source names only against existing exact identities.
    for table in ['Dungeon', 'DaevanionBoard', 'Title', 'SkillAbnormal']:
        for row in ctx.rows(table):
            identity = table + ':' + str(value(row['ID']))
            if identity in ctx.entries and row.get('Name'):
                ctx.aliases[table, row['Name'].casefold()] = identity

    point_type = scope['pointType']
    boards = [r for r in ctx.rows('DaevanionBoard') if r['CostPointType'].split('::')[-1] == point_type]
    board_ids = {value(r['ID']) for r in boards}
    nodes = defaultdict(list)
    for row in ctx.rows('DaevanionNode'):
        if value(row['Board']) not in board_ids or row['Type'].endswith('::None'):
            continue
        if row['Type'].split('::')[-1] not in ('Stat', 'Start'):
            raise ValueError('Unsupported node type in selected board')
        bonuses = ctx.stats([{'StatType': row[f'Value{i:02}'], 'StatValue': float(row[f'Value{i+1:02}'])}
                             for i in range(1, 10, 2) if row[f'Value{i:02}'] and row[f'Value{i+1:02}']])
        conditions = [] if row['NeedConditionType'].endswith('::None') else ctx.facts(row, {'NeedConditionType': 'Condition', 'NeedConditionValue': 'Condition value'})
        nodes[value(row['Board'])].append({
            'id': str(value(row['ID'])), 'row': row['Row'], 'column': row['Col'],
            'name': ctx.text(row['Title'], human(row['Type'])), 'cost': row['CostDaevanionPoint'],
            'level': row['NeedLevel'], 'grade': human(row['Grade']), 'automatic': row['bAutoLearn'],
            'bonuses': bonuses, 'facts': bonuses + conditions + ctx.facts(row, {'ResetGold': 'Reset currency cost'}), 'links': [],
        })
    for row in boards:
        result = entry('DaevanionBoard', row, 'boards', group=human(row['Class']),
                       fields={'Class': 'Class', 'NeedLevel': 'Required level'})
        result['board'] = nodes[value(row['ID'])]
        for item_id in selected_items:
            item_row = native_items[item_id]
            if item_row.get('UseEffect') == 'EItemUseEffect::GetDaevanionPoint' and item_row['UseEffectValues'][0] == point_type:
                ctx.section(result, 'Unlock items', links=[ctx.link('Item', item_id)])
                ctx.item_section(item_id, 'Use effect', text=ctx.items[item_id].get('description'),
                                 links=[ctx.link('DaevanionBoard', row['ID'], note=human(row['Class']))])

    recipes = [r for r in ctx.rows('ConversionRecipe') if value(r['ID']) in scope['recipeIds']]
    replacements = {r['Name']: r['ReplacementItemList'] for r in ctx.rows('ConversionComponentReplacement')}
    for row in recipes:
        if not row['bShowRecipe']:
            raise ValueError('Selected conversion is hidden in the client: ' + row['Name'])
        output_id = ctx.item_names[row['Product'].casefold()]
        item_refresh(output_id)
        result = entry('ConversionRecipe', row, 'recipes', name=ctx.items[output_id]['name'], group=human('ConversionRecipe'),
                       fields={'QualificationRace': 'Faction', 'RegisterType': 'Unlock method', 'LimitResetCycleType': 'Limit reset cycle'})
        limit = scope.get('recipeRules', {}).get(str(value(row['ID'])))
        if limit:
            result['facts'] += [ctx.fact('Conversion limit', limit['limit']), ctx.fact('Limit scope', limit['scope'])]
        ctx.section(result, 'Produces', links=[ctx.link('Item', row['Product'], row['ProductCount'])])
        ctx.section(result, 'Ingredients', links=ctx.item_links(row['ComponentList']))
        ctx.section(result, 'Success and alternatives', facts=[ctx.fact('Success chance (%)', row['SuccessProp'] / 100)])
        ctx.item_section(output_id, 'Substance conversion', links=[ctx.link('ConversionRecipe', row['ID'])])
        for component in row['ComponentList']:
            choices = [{'Item': component['Item'], 'Count': component['Count']}] + replacements.get(component['ReplacementItem'], [])
            if len(choices) > 1:
                ctx.section(result, 'Alternative ingredients', links=ctx.item_links(choices[1:]))
            for choice in choices:
                item_id = ctx.item_names[choice['Item'].casefold()]
                item_refresh(item_id)
                ctx.item_section(item_id, 'Used in recipes', links=[ctx.link('ConversionRecipe', row['ID'])])

    # Exact item identities and quantities are available; values above 100% in
    # raw reward weights do not establish independent drop probabilities.
    packages = {r['PackageName']: r['Items'] for r in ctx.rows('RewardPackageItem')}
    direct = defaultdict(list)
    groups = defaultdict(list)
    for row in ctx.rows('RewardItem'):
        direct[row['Name']] += [i for i in row['Items'] if i['ItemProb'] > 0]
    for row in ctx.rows('RewardPackage'):
        groups[row['Name']] += [p for p in row['PackageItems'] if p['Prob'] > 0 and p['Count'] > 0]

    def pool_links(name):
        rows = direct[name] + [r for p in groups[name] for r in packages[p['Item']] if r['ItemProb'] > 0]
        links = []
        for row in rows:
            item_refresh(ctx.item_names[row['ItemName'].casefold()])
            for link in ctx.item_links([row]):
                if row['ItemCountMax'] > row['ItemCountMin']:
                    link['quantityMax'] = row['ItemCountMax']
                    link.pop('note', None)
                links.append(link)
        return list({(l['id'], l.get('quantity'), l.get('quantityMax')): l for l in links}.values())

    cubes = {r['Name']: r for r in ctx.rows('RewardOdEnergyCube')}
    maps = {value(r['ID']): r for r in ctx.rows('Map')}
    entrances = {r['Name']: r for r in ctx.rows('MapEntrance')}
    dungeon_rows = [r for r in ctx.rows('Dungeon') if value(r['ID']) in scope['dungeonIds']]
    for row in dungeon_rows:
        result = ctx.entries['Dungeon:' + str(value(row['ID']))]
        dirty.add(result['id'])
        result['adventure']['difficulty'] = scope['dungeonRules']['difficulty']
        minimum_level = entrances[maps[value(row['MapId'])]['EntranceName']]['MinLevel']
        result['adventure']['level'] = minimum_level
        result['facts'] = [f for f in result['facts'] if f['label'] not in [ctx.label('Difficulty'), ctx.label('Death limit'), ctx.label('Revival limit'), ctx.label('Recommended level')]]
        result['facts'].append(ctx.fact('Difficulty', scope['dungeonRules']['difficulty'].title()))
        replaced = {ctx.label(x) for x in ['Entry requirements', 'Possible rewards', 'Guaranteed rewards']}
        result['sections'] = [s for s in result['sections'] if s['title'] not in replaced]
        rules = scope.get('dungeonRuleOverrides', {}).get(str(value(row['ID'])), scope['dungeonRules'])
        ctx.section(result, 'Entry requirements', facts=[ctx.fact('Minimum level', minimum_level), ctx.fact('Equipment level', rules['itemLevel'])])
        if rules.get('revives') is not None:
            result['facts'] = [f for f in result['facts'] if f['label'] != ctx.label('Revival limit')]
            result['facts'].append(ctx.fact('Revival limit', rules['revives']))
        if rules.get('frenzySeconds') is not None:
            result['facts'] = [f for f in result['facts'] if f['label'] != ctx.label('Frenzy timer (seconds)')]
            result['facts'].append(ctx.fact('Frenzy timer (seconds)', rules['frenzySeconds']))
        cube = cubes[row['RewardOdEnergyCube']]
        ctx.section(result, 'Possible rewards', links=pool_links(cube['RewardCommon']))
        ctx.section(result, 'Guaranteed rewards', facts=[ctx.fact('Guarantee threshold', cube['CeilingMaxCount'])], links=ctx.item_links(cube['CeilingItems']))
        result['sections'][-1]['summary'] = {'key': 'reference.adventure.guaranteeSelection', 'values': {'count': cube['CeilingMaxCount']}}

    achievement_text = importlib.import_module('achievement-text')
    strings = achievement_text.strings_by_name(ctx)
    steps = defaultdict(list)
    rewards = defaultdict(list)
    for row in ctx.rows('AchievementStep'):
        steps[value(row['AchievementId'])].append(row)
    for row in ctx.rows('AchievementReward'):
        rewards[value(row['AchievementId']), row['Step']].append(row)
    achievement_groups = {r['Name']: r for r in ctx.rows('AchievementGroup')}
    achievements = [r for r in ctx.rows('Achievement') if value(r['AchievementId']) in scope['achievementIds']]
    for row in achievements:
        key = value(row['AchievementId'])
        group = achievement_groups[row['GroupName']]
        name = achievement_text.entry_name(ctx, row, steps[key][0], group, strings)
        if not name:
            raise ValueError('Missing achievement title: ' + str(key))
        result = entry('Achievement', row, 'achievements', name=name, group=ctx.text(group['Title']),
                       fields={'Grade': 'Grade', 'ResetCycleType': 'Reset cycle'}, description=ctx.text(row['CollectionDesc']))
        result['facts'].append(ctx.fact('Faction', human(group['Race'])))
    for row in achievements:
        key = value(row['AchievementId'])
        result = ctx.entries['Achievement:' + str(key)]
        milestones = []
        for step in steps[key]:
            reward_rows = rewards[key, step['Step']]
            raw_items = [i for r in reward_rows for i in r['ItemRewards']]
            for item in raw_items:
                item_refresh(ctx.item_names[item['Item'].casefold()])
            title, objective = achievement_text.step_text(ctx, step, strings)
            milestones.append({'name': title or str(step['Count']), 'description': objective,
                               'facts': [ctx.fact('Required count', step['Count']), ctx.fact('Reward points', sum(r['RewardPoint'] for r in reward_rows))],
                               'links': ctx.item_links(raw_items)})
        ctx.section(result, 'Milestones', rows=milestones)
        objective_table = {'ClearDungeon': 'Dungeon', 'UseItem': 'Item', 'ClearAchievement': 'Achievement', 'DaevanionNodeActivate': 'DaevanionBoard'}.get(row['ObjType'].split('::')[-1])
        if objective_table:
            targets = [s.strip() for cell in row['ObjValues'] for s in cell.split(',')]
            links = [ctx.link(objective_table, target) for target in targets]
            if any(link is None for link in links):
                raise ValueError('Unresolved typed achievement objective: ' + str(key))
            ctx.section(result, 'Objectives', links=links)
            for link in links:
                if link['category'] != 'items':
                    target = ctx.entries[link['id']]
                    # Rebuilding a supplement must not append duplicate links.
                    ctx.section(target, 'Achievements', links=[ctx.link('Achievement', key)])
                    dirty.add(target['id'])

    # New title grants and class-specific reward chests keep their typed joins.
    title_rows = {value(r['ID']): r for r in ctx.rows('Title')}
    boxes = defaultdict(list)
    for table in ['BoxReward', 'BoxClassReward']:
        for position, row in enumerate(ctx.rows(table)):
            boxes[row['Group']].append((table, position, row))
    decorations = {r['Name']: r for r in ctx.rows('AgitDecoItem')}
    abnormal_rows = {value(r['ID']): r for r in ctx.rows('SkillAbnormal')}
    abnormal_strings = {r['Name']: r for r in ctx.rows('SkillAbnormalString')}
    abnormal_effects = defaultdict(list)
    for effect_row in ctx.rows('SkillAbnormalEffect'):
        abnormal_effects[value(effect_row['AbnormalId'])].append(effect_row)
    for item_id in sorted(touched_items):
        row = native_items[item_id]
        effect = row.get('UseEffect')
        if effect == 'EItemUseEffect::GetTitle':
            title_row = title_rows[int(row['UseEffectValues'][0])]
            title = entry('Title', title_row, 'titles', description=ctx.text(title_row['DescLong']),
                          fields={'Race': 'Faction', 'Grade': 'Grade'})
            ctx.section(title, 'Equipped bonuses', facts=ctx.stats(title_row['EquipStatList']))
            ctx.section(title, 'Collection bonuses', facts=ctx.stats(title_row['StatList']))
            ctx.section(title, 'Unlock items', links=[ctx.link('Item', item_id)])
            ctx.item_section(item_id, 'Use effect', text=ctx.items[item_id].get('description'), links=[ctx.link('Title', title_row['ID'])])
        elif effect == 'EItemUseEffect::RewardBox' and row['UseEffectValues'][0] in boxes:
            box_links = []
            for table, position, box in boxes[row['UseEffectValues'][0]]:
                # Group and class are stable source identity; row positions are
                # retained in provenance but may shift after unrelated additions.
                key = box['Group'] + ':' + box.get('Class', box['Race']).split('::')[-1] + ':' + str(box['LevelMin'])
                box_entry = entry(table, box, 'boxes', name=ctx.items[item_id]['name'], key=key,
                                  group=human(box.get('Class', box['Race'])),
                                  fields={'Class': 'Class', 'Race': 'Faction', 'LevelMin': 'Minimum level', 'LevelMax': 'Maximum level'})
                box_entry['source'] = ctx.source_prefix + table + '.dat#' + str(position)
                ctx.section(box_entry, 'Contents', links=ctx.item_links(box['Items']))
                ctx.section(box_entry, 'Choose a reward', links=ctx.item_links(box['SelectItems']))
                random_items = [r for p in box['PackageItems'] for r in packages[p['Item']] if r['ItemProb'] > 0]
                ctx.section(box_entry, 'Possible contents', links=ctx.item_links(random_items))
                box_links.append(ctx.link(table, key))
                for link in ctx.item_links(box['Items'] + box['SelectItems'] + random_items):
                    ctx.item_section(link['id'], 'Available from boxes', links=[ctx.link('Item', item_id)])
            # Replace the earlier flat presentation on repeat imports.
            ctx.item_section(item_id, 'Box contents', links=box_links)
        elif effect == 'EItemUseEffect::GetDeco':
            decoration = decorations[row['UseEffectValues'][0]]
            abnormal = abnormal_rows[value(decoration['AbnormalId'])]
            texts = abnormal_strings.get(abnormal['SkillAbnormalString_Key'], {})
            effect_entry = entry('SkillAbnormal', abnormal, 'effects', name=ctx.text(texts.get('DescName')) or ctx.text(decoration['Desc']),
                                 description=ctx.text(texts.get('DescSummary')) or ctx.text(texts.get('DescEffect')))
            stats = []
            for change in abnormal_effects[value(abnormal['ID'])]:
                values = change['Values']
                if change['AbnormalEffectType'] != 'EAbnormalEffectType::StatChange' or len(values) != 5 or values[2:] != ['0', '0', '1'] or change['AbnormalEffectLvGroupId'] != 'None':
                    raise ValueError('Unsupported decoration effect: ' + str(value(change['ID'])))
                stats.append({'StatType': values[0], 'StatValue': float(values[1])})
            ctx.section(effect_entry, 'Effects', facts=ctx.stats(stats))
            ctx.item_section(item_id, 'Use effect', text=ctx.items[item_id].get('description'), links=[ctx.link('SkillAbnormal', abnormal['ID'])])
        elif effect and effect != 'EItemUseEffect::None' and item_id in selected_items:
            ctx.item_section(item_id, 'Use effect', text=ctx.items[item_id].get('description'))

    if scope.get('refreshProgression'):
        importlib.import_module('client-refresh-progression').build(ctx, scope, entry, item_refresh, touched_items)

    def deduplicate(sections):
        merged = {}
        for section in sections:
            target = merged.setdefault(section['title'], {'title': section['title']})
            for key, val in section.items():
                if isinstance(val, list):
                    target[key] = list({json.dumps(v, sort_keys=True): v for v in target.get(key, []) + val}.values())
                else:
                    target[key] = val
        return list(merged.values())

    def refresh_link_names(node):
        if isinstance(node, list):
            for child in node:
                refresh_link_names(child)
        elif isinstance(node, dict):
            if node.get('id') in dirty and 'category' in node and 'name' in node:
                node['name'] = ctx.entries[node['id']]['name']
            for child in node.values():
                refresh_link_names(child)

    # Strip reciprocal sources for rebuilt entries, then add their current links.
    item_chunk_paths = list((base / 'items').glob('*.json'))
    all_item_sections = {}
    for path in item_chunk_paths:
        all_item_sections.update(read(path)['items'])
    for item_id, sections in all_item_sections.items():
        if scope.get('refreshProgression') and item_id in selected_items and native_items[item_id]['ItemType'] == 'EItemType::Equip':
            sections[:] = [s for s in sections if s['title'] != ctx.label('Upgrades and sets')]
        if item_id in selected_items and native_items[item_id].get('UseEffect') == 'EItemUseEffect::RewardBox':
            sections[:] = [s for s in sections if s['title'] != ctx.label('Box contents')]
        for section in sections:
            if 'links' in section:
                section['links'] = [l for l in section['links'] if l['id'] not in dirty]
    for item_id, sections in ctx.item_sections.items():
        all_item_sections[item_id] = deduplicate(all_item_sections.get(item_id, []) + sections)
    refresh_link_names(all_item_sections)
    if any(k.startswith('unresolved-') and v for k, v in ctx.warnings.items()):
        raise ValueError('Supplement contains unresolved links: ' + str(ctx.warnings))
    item_chunks = defaultdict(dict)
    for item_id, sections in all_item_sections.items():
        sections = [s for s in sections if any(v for k, v in s.items() if k != 'title')]
        if sections:
            item_chunks[item_id[:3]][item_id] = sections
    for bucket, items in item_chunks.items():
        save_changed(base / 'items' / (bucket + '.json'), {'version': 1, 'items': items})

    summaries = {s['id']: s for s in index['entries']}
    for identity in sorted(dirty):
        result = ctx.entries[identity]
        result['sections'] = deduplicate(result['sections'])
        bucket = hashlib.sha256(identity.encode()).hexdigest()[:2]
        path = base / result['category'] / (bucket + '.json')
        previous = existing_summaries.get(identity)
        if previous and previous['category'] != result['category']:
            old_path = base / previous['category'] / (previous['chunk'] + '.json')
            if old_path not in chunks:
                chunks[old_path] = read(old_path)
            chunks[old_path]['entries'].pop(identity, None)
        if path not in chunks:
            chunks[path] = read(path) if path.exists() else {'version': 1, 'entries': {}}
        chunk = chunks[path]
        chunk['entries'][identity] = result
        summaries[identity] = {**{k: v for k, v in result.items() if k in ('id', 'category', 'name', 'subtitle', 'group', 'icon', 'unnamed', 'activity', 'travel', 'adventure', 'worldBoss')}, 'chunk': bucket}
    retired_items = set(scope.get('retiredItemIds', []))
    retired_entries = set(scope.get('removedEntryIds', []))
    retired = retired_items | retired_entries

    def prune(node):
        if isinstance(node, list):
            return [prune(child) for child in node if not (isinstance(child, dict) and child.get('id') in retired)]
        if isinstance(node, dict):
            return {key: prune(child) for key, child in node.items() if key not in retired}
        return node

    if retired:
        for path in base.glob('*/*.json'):
            if path not in chunks:
                text = path.read_text('utf8')
                if any('"' + identity + '"' in text for identity in retired):
                    chunks[path] = json.loads(text)
        summaries = {key: record for key, record in summaries.items() if key not in retired}
        ctx.catalog['items'] = [item for item in ctx.catalog['items'] if item['id'] not in retired_items]
        icons['items'] = [item for item in icons['items'] if item['id'] not in retired_items]
    for path, chunk in chunks.items():
        refresh_link_names(chunk)
        if retired:
            chunk = prune(chunk)
        save_changed(path, chunk)
    index['entries'] = list(summaries.values())
    counts = Counter(s['category'] for s in summaries.values())
    index['categories'] = [{'id': c['id'], 'count': counts[c['id']]} for c in index['categories']]
    save_changed(base / 'index.json', index)
    ctx.catalog['items'].sort(key=lambda i: (i['name'].lower(), int(i['id'])))
    save_changed(ctx.public / 'data/items/catalog.json', ctx.catalog)
    save_changed(ctx.public / 'data/items/icon-sources.json', icons)

    # Only the English authoring file receives labels; other locales fall back.
    locale_path = Path(args.locale)
    locale = read(locale_path)
    for key, label in ctx.labels.items():
        locale['reference']['labels'].setdefault(key, label)
    if read(locale_path) != locale:
        write(locale_path, locale, indent=2)
    audit = {
        'version': 1, 'build': scope['build'], 'scope': scope,
        'localizationSha256': digest(args.localization),
        'tables': [{'name': name, 'rows': len(rows), 'decodedSha256': digest(ctx.tables / (name + '.json')),
                    'rawSha256': digest(Path(args.raw) / (name + '.dat'))} for name, rows in sorted(ctx.cache.items())],
        'entryIds': sorted(dirty), 'itemIds': sorted(touched_items),
        'addedItemIds': sorted((set(ctx.items) - set(original_items)) | set(previous_audit.get('addedItemIds', []))),
        'retiredItemIds': sorted(retired_items), 'removedEntryIds': sorted(retired_entries),
        'boardNodes': {str(k): len(v) for k, v in nodes.items()},
        'warnings': dict(ctx.warnings),
    }
    save_changed(base / 'client-supplement.json', audit)
    manifest_path = base / 'manifest.json'
    manifest = read(manifest_path)
    manifest['categories'] = dict(counts)
    manifest['itemsWithReferenceSections'] = sum(sum(item_id not in retired_items for item_id in items) for items in item_chunks.values())
    manifest['clientSupplement'] = {'path': 'data/reference/client-supplement.json', 'sha256': digest(base / 'client-supplement.json')}
    save_changed(manifest_path, manifest)
    item_manifest_path = ctx.public / 'data/items/source-manifest.json'
    item_manifest = read(item_manifest_path)
    for key, relative in [('catalog', 'data/items/catalog.json'), ('iconSources', 'data/items/icon-sources.json')]:
        path = ctx.public / relative
        item_manifest[key] = {'path': relative, 'bytes': path.stat().st_size, 'sha256': digest(path)}
    items = ctx.catalog['items']
    item_manifest['counts'].update(items=len(items), localizedItemNames=sum(bool(i.get('nameVerified')) for i in items),
                                  itemsWithIcons=sum(bool(i.get('icon')) for i in items), uniqueIcons=len({i['icon'] for i in items if i.get('icon')}),
                                  itemsWithDescriptions=sum(bool(i.get('description')) for i in items))
    item_manifest['clientSupplement'] = manifest['clientSupplement']
    save_changed(item_manifest_path, item_manifest)
    print(json.dumps({'entriesRefreshed': len(dirty), 'itemsRefreshed': len(touched_items), 'addedItems': audit['addedItemIds'], 'boardNodes': audit['boardNodes'], 'warnings': audit['warnings']}, indent=2))


if __name__ == '__main__':
    main()
