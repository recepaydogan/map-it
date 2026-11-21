"""Player-facing quest and dungeon identities, derived from explicit source fields."""
import re
from collections import defaultdict
from context import value

QUEST_KINDS = {'Hero': 'story', 'District': 'regional', 'Exploration': 'exploration',
               'GatherCraftMastery': 'profession', 'DutyMission': 'mission',
               'DutyScroll': 'scroll', 'Ascension': 'ascension', 'Daevagauge': 'progression'}
DUNGEON_KINDS = {'Party': 'party', 'Raid': 'raid', 'Seal': 'seal', 'Ascension': 'ascension',
                 'Growth': 'growth', 'Daily': 'daily', 'Awaken': 'awakening',
                 'BossChallenge': 'challenge', 'AbyssArtifact': 'stronghold'}
INTERNAL_NAME = re.compile(r'(?i)(?:\[test\]|\(test\)|\btest\s*\d+\b|\bunused\b|\bdeprecated\b|미사용|테스트)')


def suffix(cell):
    return str(cell).split('::')[-1]


def quest_requirements(ctx, row, quest_rows, quest_steps, environment, subzones):
    requirements = []
    unresolved = []
    for condition in row['AcquirableConditions']:
        condition_type = suffix(condition['Type'])
        target_name = condition.get('Value', '')
        target = None
        if condition_type in ('ClearQuest', 'IncompleteQuest'):
            target_row = quest_rows.get(target_name)
            target = ctx.entries.get('Quest:' + str(value(target_row['ID']))) if target_row else None
        elif condition_type == 'ClearQuestStep':
            step = quest_steps.get(target_name, {})
            target_row = quest_rows.get(step.get('QuestName'))
            target = ctx.entries.get('Quest:' + str(value(target_row['ID']))) if target_row else None
        elif condition_type == 'CloseEnvObj':
            target_row = environment.get(target_name)
            target = ctx.entries.get('EnvObjData:' + str(value(target_row['ID']))) if target_row else None
        key = 'reference.adventure.requirements.' + condition_type
        if target:
            requirement = {'label': key, 'link': {k: target[k] for k in ('id', 'category', 'name')}}
            if condition_type == 'ClearQuestStep':
                requirement['value'] = str(quest_steps[target_name]['Order'])
            requirements.append(requirement)
        elif condition_type == 'SubZone':
            subzone = subzones.get(target_name)
            name = ctx.text(subzone['DisplayName']) if subzone else ''
            if name:
                requirements.append({'label': key, 'value': name})
            else:
                unresolved.append(condition)
        elif condition_type.endswith('Mastery') or condition_type == 'UnifiedObjectiveScore':
            requirements.append({'label': key, 'value': target_name})
        else:
            unresolved.append(condition)
    return requirements, bool(unresolved)


def build(ctx):
    maps = {value(row['ID']): row for row in ctx.rows('Map')}
    entrances = {row['Name']: row for row in ctx.rows('MapEntrance')}
    quest_rows = {row['Name']: row for row in ctx.rows('Quest')}
    quest_steps = {str(value(row['ID'])): row for row in ctx.rows('QuestStep')}
    environment = {row['Name']: row for row in ctx.rows('EnvObjData')}
    subzones = {row['Name']: row for row in ctx.rows('Subzone')}
    for row in ctx.rows('Dungeon'):
        entry = ctx.entries['Dungeon:' + str(value(row['ID']))]
        map_row = maps.get(value(row['MapId']), {})
        title = ctx.text(row['Title']) or ctx.text(map_row.get('Desc'))
        description = ctx.text(row['Desc'])
        kind = DUNGEON_KINDS.get(suffix(row['DungeonType']), 'other')
        entry['name'] = title or entry['name']
        entry['description'] = description if description != title else ''
        entry['unnamed'] = not bool(title) or bool(re.fullmatch(r'[?\s.…\d]+', title))
        entrance = entrances.get(map_row.get('EntranceName'), {})
        tier = re.search(r'(\d+)Tier', row.get('PartDungeonTier', ''))
        entry['adventure'] = {
            'familyId': 'dungeon:' + kind + ':' + (row['Title'].get('Key') or entry['id']),
            'kind': kind, 'faction': suffix(map_row.get('MapRace', 'All')),
            'level': entrance.get('MinLevel', 0) or row.get('RecommendLevel', 0),
            'difficulty': suffix(row['DungeonDifficulty']).lower(),
            'tier': int(tier[1]) if tier else 0,
            'partySize': entrance.get('MaxMember', 0) or row.get('RecommendMaxMember', 0),
            'listed': kind != 'other' and not entry['unnamed'] and not bool(INTERNAL_NAME.search(entry['name'])),
        }
        # Zero and None in these optional source fields mean no published requirement.
        entry['facts'] = [fact for fact in entry['facts'] if fact['value'] not in (0, 'None', '')]

    for row in ctx.rows('Quest'):
        entry = ctx.entries['Quest:' + str(value(row['ID']))]
        entry['name'] = re.sub(r'^\[Upgrade\]\s*', '', entry['name'])
        region = ctx.text(maps.get(value(row['AcquireMapId']), {}).get('Desc'))
        entry['adventure'] = {
            'familyId': 'quest:' + row['QuestText'],
            'kind': QUEST_KINDS.get(suffix(row['Type']), 'other'),
            'faction': suffix(row['Race']), 'level': row['UnlockLevel'], 'region': region,
            'listed': not entry['unnamed'] and not bool(INTERNAL_NAME.search(entry['name'])),
        }
        requirements, unresolved = quest_requirements(ctx, row, quest_rows, quest_steps, environment, subzones)
        entry['questRequirements'] = requirements
        entry['unresolvedRequirements'] = unresolved

    # Keep world objects linked to their actual quest objectives, not a separate catalog.
    for row in quest_steps.values():
        quest_row = quest_rows.get(row['QuestName'])
        entry = ctx.entries.get('Quest:' + str(value(quest_row['ID']))) if quest_row else None
        section = next((s for s in entry['sections'] if s['title'] == 'reference.labels.objectives'), None) if entry else None
        if not section:
            continue
        matching = [r for r in section.get('rows', []) if r['name'].startswith(str(row['Order']) + ' · ')]
        for goal, objective in zip(row['GoalList'], matching):
            for cell in goal['Value']:
                for token in cell.split(','):
                    env = environment.get(token.strip())
                    target = ctx.entries.get('EnvObjData:' + str(value(env['ID']))) if env else None
                    if target and not any(link['id'] == target['id'] for link in objective.get('links', [])):
                        objective.setdefault('links', []).append({k: target[k] for k in ('id', 'category', 'name')})

    # Match environment entrances by explicit map IDs, names or entrance keys.
    targets = defaultdict(list)
    party_families = defaultdict(list)
    for row in ctx.rows('Dungeon'):
        entry = ctx.entries['Dungeon:' + str(value(row['ID']))]
        map_row = maps.get(value(row['MapId']), {})
        for key in {str(value(row['MapId'])), str(value(row['ID'])), row['Name'],
                    map_row.get('Name'), map_row.get('EntranceName')} - {None, '', 'None'}:
            targets[key].append(entry)
        if suffix(row['DungeonType']) == 'Party' and entry['adventure']['listed']:
            party_families[entry['name'].casefold()].append(entry)
    for row in ctx.rows('EnvObjData'):
        if suffix(row['Usage']) not in ('EnterDungeon', 'PartyDungeon'):
            continue
        entry = ctx.entries.get('EnvObjData:' + str(value(row['ID'])))
        if not entry:
            continue
        linked = {e['id']: e for e in targets.get(str(row['UsageValue']), [])}
        guide = False
        if not linked and suffix(row['Usage']) == 'PartyDungeon':
            # An exact localized entrance title identifies a guide family, not
            # a verified mode ID. Keep that distinction visible in both views.
            title = ctx.text(row['Desc'])
            if title.endswith(' Entrance'):
                candidates = party_families.get(title[:-len(' Entrance')].casefold(), [])
                if len({e['adventure']['familyId'] for e in candidates}) == 1:
                    linked = {e['id']: e for e in candidates}
                    guide = True
        if linked:
            sections = [s for s in entry['sections'] if s['title'] not in ('reference.labels.related-content', 'reference.adventure.dungeonGuide')]
            sections.append({'title': 'reference.adventure.dungeonGuide' if guide else 'reference.labels.related-content', 'links': [
                {k: e[k] for k in ('id', 'category', 'name')} for e in linked.values()]})
            entry['sections'] = sections
            for dungeon in linked.values():
                if guide:
                    dungeon['adventure']['entranceAssociation'] = 'family'
                dungeon['locations'] = list({(p['mapId'], p['markerId']): p for p in
                    dungeon['locations'] + entry['locations']}.values())

    # Reciprocal quest links make an object or creature useful in its map panel.
    for entry in list(ctx.entries.values()):
        if entry['category'] != 'quests':
            continue
        for section in entry['sections']:
            if section['title'] != 'reference.labels.objectives':
                continue
            for objective in section.get('rows', []):
                for link in objective.get('links', []):
                    target = ctx.entries.get(link['id'])
                    if target and target['category'] in ('creatures', 'exploration'):
                        related = next((s for s in target['sections'] if s['title'] == 'reference.adventure.relatedQuests'), None)
                        if related is None:
                            related = {'title': 'reference.adventure.relatedQuests', 'links': []}
                            target['sections'].append(related)
                        if not any(item['id'] == entry['id'] for item in related['links']):
                            related['links'].append({k: entry[k] for k in ('id', 'category', 'name')})
