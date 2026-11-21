"""Link single-kill achievement titles by native NPC, reward item and title IDs."""
from collections import defaultdict
from context import value

SECTION = 'reference.loot.firstKillTitle'
SOURCE_TABLES = ('NpcData', 'Achievement', 'AchievementStep', 'AchievementReward', 'Item', 'Title')


def build(ctx):
    npcs = {row['Name']: 'NpcData:' + str(value(row['ID'])) for row in ctx.rows('NpcData')}
    items = {row['Name']: row for row in ctx.rows('Item')}
    titles = {key: row for row in ctx.rows('Title') for key in (str(value(row['ID'])), row['Name'])}
    steps = {(value(row['AchievementId']), row['Step']): row for row in ctx.rows('AchievementStep')}
    rewards = defaultdict(list)
    for row in ctx.rows('AchievementReward'):
        rewards[value(row['AchievementId']), row['Step']].extend(row['ItemRewards'])
    for entry in ctx.entries.values():
        if entry['category'] == 'creatures':
            entry['sections'] = [section for section in entry['sections'] if section['title'] != SECTION]
    linked = defaultdict(dict)
    for row in ctx.rows('Achievement'):
        if (row['ObjType'] != 'EAchievementObjectiveType::KillNpc' or len(row['ObjValues']) != 1
                or row['ResetCycleType'] != 'EResetCycleType::None' or value(row['UnlockAchievementId'])):
            continue
        entry_id = npcs.get(row['ObjValues'][0])
        if entry_id not in ctx.entries:
            continue
        key = (value(row['AchievementId']), 1)
        if steps.get(key, {}).get('Count') != 1:
            continue
        for reward in rewards[key]:
            item = items.get(reward['Item'])
            if not item or item.get('UseEffect') != 'EItemUseEffect::GetTitle' or reward['Count'] <= 0:
                continue
            unlock = ctx.link('Item', item['Name'])
            if not unlock:
                raise ValueError('Missing achievement title item: ' + item['Name'])
            for target in item['UseEffectValues']:
                title = titles.get(target)
                if not title:
                    raise ValueError('Missing achievement title: ' + target)
                title_id = 'Title:' + str(value(title['ID']))
                link = {'id': title_id, 'category': 'titles', 'name': ctx.text(title['Desc'], unlock['name'])}
                if unlock.get('icon'):
                    link['icon'] = unlock['icon']
                linked[entry_id][title_id] = link
    for entry_id, links in linked.items():
        ctx.entries[entry_id]['sections'].append({'title': SECTION, 'links': list(links.values())})
    return len(linked)
