"""Quest chains, objectives and achievement progression."""
from collections import defaultdict
import importlib
from context import human, value

achievement_text = importlib.import_module('achievement-text')


COUNT_OBJECTIVES = {'KillNpc', 'UseEnvObj', 'CollectItem'}


def objective_required_count(goal):
    kind = goal['Type'].split('::')[-1]
    cells = goal['Value']
    return int(cells[1]) if kind in COUNT_OBJECTIVES and len(cells) > 1 and cells[1].isdigit() else None


def add_rewards(ctx, entry, rewards):
    for reward in rewards:
        facts = ctx.facts(reward, {'ExpReward': 'Experience'})
        class_name = human(reward['Class']) if reward.get('Class') else None
        for title, items in [
            ('Rewards', reward.get('ItemRewards', []) + reward.get('ItemNormalRewards', [])),
            ('Choose a reward', reward.get('ItemSelectRewards', [])),
        ]:
            links = ctx.item_links(items)
            if class_name:
                links = [{**link, 'note': ' · '.join(filter(None, [link.get('note'), class_name]))} for link in links]
            ctx.section(entry, title, facts=facts if title == 'Rewards' else [], links=links)


def build(ctx):
    texts = {r['Name']: r for r in ctx.rows('QuestString')}
    rewards = defaultdict(list)
    for table in ['QuestReward', 'QuestClassReward']:
        for row in ctx.rows(table):
            rewards[row['Group']].append(row)
    steps = defaultdict(list)
    for row in ctx.rows('QuestStep'):
        steps[row['QuestName']].append(row)
    for row in ctx.rows('Quest'):
        entry = ctx.entries['Quest:' + str(value(row['ID']))]
        text = texts.get(row['QuestText'], {})
        entry['description'] = ctx.text(text.get('JournalProgressSummary')) or ctx.text(text.get('ShortSummary'))
        chain = [ctx.link('Quest', row['NextQuestName'])] if row['NextQuestName'] != 'None' else []
        ctx.section(entry, 'Next quest', links=[x for x in chain if x])
        next_entry = ctx.entries.get(ctx.aliases.get(('Quest', row['NextQuestName'].casefold())))
        if next_entry:
            ctx.section(next_entry, 'Previous quest', links=[ctx.link('Quest', row['Name'])])
        objectives = []
        for step in sorted(steps[row['Name']], key=lambda r: r['Order']):
            for goal_index, goal in enumerate(step['GoalList']):
                links = []
                for target in [part.strip() for cell in goal['Value'] for part in cell.split(',')]:
                    if not target:
                        continue
                    # Numeric objective parameters are counts, levels, or grades;
                    # none of these goal types names a dungeon by its ID.
                    for table in ['NpcData', 'Item', 'Quest']:
                        if (table, target.casefold()) in ctx.aliases or (table == 'Item' and target.casefold() in ctx.item_names):
                            link = ctx.link(table, target)
                            if link:
                                links.append(link)
                label = human(goal['Type'])
                details = []
                obj_texts = text.get('ObjDescArray', [])
                if step['Order'] <= len(obj_texts):
                    objective = obj_texts[step['Order'] - 1]
                    descriptions = objective.get('ObjDescList', [])
                    description = ctx.text(descriptions[goal_index]) if goal_index < len(descriptions) else ''
                    description = description or ctx.text(objective.get('StepDesc'))
                    if description:
                        details.append(description)
                facts = [ctx.fact('Optional', goal['bOptional'])]
                required_count = objective_required_count(goal)
                if required_count is not None:
                    facts.append(ctx.fact('Required count', required_count))
                objectives.append({'name': str(step['Order']) + ' · ' + label, 'description': '\n'.join(details), 'facts': facts, 'links': links})
        ctx.section(entry, 'Objectives', rows=objectives)
        prerequisite_rows = []
        for condition in row['AcquirableConditions']:
            prerequisite_rows.append({'name': human(condition.get('Type', condition.get('ConditionType', 'Requirement'))), 'facts': [ctx.fact(human(k), human(v)) for k, v in condition.items() if isinstance(v, (str, int, bool))]})
        ctx.section(entry, 'Prerequisites', rows=prerequisite_rows)
        add_rewards(ctx, entry, rewards[str(value(row['ID']))] + rewards[row['Name']])
    achievement_steps = defaultdict(list)
    achievement_rewards = defaultdict(list)
    achievement_strings = achievement_text.strings_by_name(ctx)
    for row in ctx.rows('AchievementStep'):
        achievement_steps[value(row['AchievementId'])].append(row)
    for row in ctx.rows('AchievementReward'):
        achievement_rewards[(value(row['AchievementId']), row['Step'])].append(row)
    for row in ctx.rows('Achievement'):
        entry = ctx.entries['Achievement:' + str(value(row['AchievementId']))]
        entry['description'] = ctx.text(row['CollectionDesc'])
        progression = []
        for step in achievement_steps[value(row['AchievementId'])]:
            reward_rows = achievement_rewards[(value(row['AchievementId']), step['Step'])]
            title, objective = achievement_text.step_text(ctx, step, achievement_strings)
            progression.append({'name': title or str(step['Step']), 'facts': [ctx.fact('Required count', step['Count']), ctx.fact('Reward points', sum(r['RewardPoint'] for r in reward_rows))], 'links': ctx.item_links([i for r in reward_rows for i in r['ItemRewards']]), **({'description': objective} if objective else {})})
        ctx.section(entry, 'Milestones', rows=progression)
        prerequisite = ctx.link('Achievement', row['UnlockAchievementId']) if value(row['UnlockAchievementId']) else None
        ctx.section(entry, 'Prerequisites', links=[prerequisite] if prerequisite else [])
        links = []
        for target in row['ObjValues']:
            for table in ['NpcData', 'Quest', 'Dungeon', 'Item', 'TeleportArtifact']:
                if (table, str(target).casefold()) in ctx.aliases or (table == 'Item' and str(target).casefold() in ctx.item_names):
                    link = ctx.link(table, target)
                    if link:
                        links.append(link)
        ctx.section(entry, 'Objectives', links=links)
