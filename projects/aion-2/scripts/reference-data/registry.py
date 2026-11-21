"""Register reference identities before resolving cross-table relationships."""
import importlib
from context import human, value

achievement_text = importlib.import_module('achievement-text')


TABLES = {
    'Quest': ('quests', {'Race': 'Faction', 'UnlockLevel': 'Required level', 'RecommendedLevel': 'Recommended level', 'RepeatType': 'Repeat cycle'}),
    'Dungeon': ('dungeons', {'DungeonDifficulty': 'Difficulty', 'RecommendLevel': 'Recommended level', 'RecommendMinMember': 'Minimum party size', 'RecommendMaxMember': 'Maximum party size', 'DeathLimit': 'Death limit', 'RebirthLimitCount': 'Revival limit'}),
    'FieldEvent': ('activities', {'ProgressTime': 'Duration (table units)', 'ReadyDuration': 'Preparation (table units)', 'StartMemberCount': 'Required participants', 'TimeType': 'Schedule type'}),
    'BossChallengeContents': ('activities', {'Level': 'Level', 'PreLevel': 'Previous level', 'RecommendPCBattlePower': 'Recommended combat power', 'bApply': 'Enabled in client'}),
    'TeleportArtifact': ('travel', {'Race': 'Faction', 'AcquireType': 'Unlock method', 'TeleportCostItemCount': 'Travel item cost', 'CanAutoMove': 'Automatic travel'}),
    'NpcTeleport': ('travel', {'Race': 'Faction', 'Cost': 'Travel cost'}),
    'RiftData': ('travel', {'MinLevel': 'Minimum level', 'MaxLevel': 'Maximum level', 'LifeTime': 'Lifetime (table units)'}),
    'GatherSource': ('gathering', {'SourceGrade': 'Grade', 'MasteryLevel': 'Required mastery'}),
    'CraftRecipe': ('recipes', {'Category': 'Profession', 'QualificationRace': 'Faction', 'MasteryLevel': 'Required mastery'}),
    'ConversionRecipe': ('recipes', {'QualificationRace': 'Faction', 'RegisterType': 'Unlock method', 'RegisterValue': 'Required mastery or level', 'ConversionCount': 'Conversion limit', 'LimitResetCycleType': 'Limit reset cycle'}),
    'Monolith': ('progression', {'Race': 'Faction'}),
    'Title': ('titles', {'Race': 'Faction', 'Grade': 'Grade', 'ApplyTargetType': 'Applies to'}),
    'Wing': ('wings', {'Grade': 'Grade', 'PcRace': 'Faction'}),
    'VehicleList': ('mounts', {'CreatureType': 'Type', 'NeedSoul': 'Required souls', 'bIsOpen': 'Enabled in client', 'ArtRunSpeed': 'Run speed (table units)', 'ArtSprintSpeed': 'Sprint speed (table units)'}),
    'DaevanionBoard': ('boards', {'Class': 'Class', 'NeedLevel': 'Required level', 'CostPointType': 'Point type'}),
    'ContentsTicket': ('tickets', {'RechargeMaxCount': 'Maximum charges', 'DailyRechargeCount': 'Daily recharge', 'WeeklyRechargeCount': 'Weekly recharge', 'TimeRechargeCycle': 'Recharge interval (table units)', 'TimeRechargeCount': 'Timed recharge', 'ItemChargeMaxCount': 'Maximum item recharges', 'OwnerType': 'Limit scope'}),
    'ContentsUnlock': ('progression', {'UnlockLevel': 'Required level', 'UnlockAscensionGrade': 'Required ascension', 'UnlockEquipItemLevel': 'Required equipment level'}),
    'PeriodItemCollection': ('collections', {'Race': 'Faction', 'LevelMin': 'Minimum level'}),
    'SeasonSchedule': ('seasons', {'SeasonNumber': 'Season'}),
    'Ascension': ('progression', {'Grade': 'Grade'}),
    'GodstoneData': ('stones', {'Grade': 'Grade', 'GodstoneType': 'Type', 'bCanCombineMaterial': 'Can be combined'}),
}


def register(ctx):
    quest_strings = {r['Name']: r for r in ctx.rows('QuestString')}
    for table, (category, fields) in TABLES.items():
        for row in ctx.rows(table):
            name = None
            key = None
            if table == 'Quest':
                texts = quest_strings.get(row['QuestText'], {})
                name = ctx.text(texts.get('Title'))
            elif table in ('CraftRecipe', 'ConversionRecipe'):
                item_id = ctx.item_names.get(row['Product'].casefold())
                name = ctx.items.get(item_id, {}).get('name')
            elif table == 'SeasonSchedule':
                name = human(row['GroupName']) + ' · ' + str(row['SeasonNumber'])
            elif table == 'GodstoneData':
                name = ctx.text(row['NameString'])
                key = value(row['GodstoneId'])
            group = human(row.get('Type', row.get('DungeonType', row.get('SourceType', row.get('Class', table)))))
            ctx.entry(table, row, category, name=name, key=key, fields=fields, description=ctx.text(row.get('DescLong')) or ctx.text(row.get('DetailDesc')), group=group)
    groups = {r['Name']: r for r in ctx.rows('AchievementGroup')}
    achievement_strings = achievement_text.strings_by_name(ctx)
    steps = {}
    for row in ctx.rows('AchievementStep'):
        steps.setdefault(value(row['AchievementId']), row)
    for row in ctx.rows('Achievement'):
        step = steps.get(value(row['AchievementId']), {})
        group = groups.get(row['GroupName'], {})
        name = achievement_text.entry_name(ctx, row, step, group, achievement_strings)
        entry = ctx.entry('Achievement', row, 'achievements', name=name, fields={'Grade': 'Grade', 'ResetCycleType': 'Reset cycle'}, group=ctx.text(group.get('Title'), human(row['ObjType'])))
        entry['unnamed'] = not bool(achievement_text.localized_title(ctx, row, step, achievement_strings))
    for row in ctx.rows('ItemSet'):
        ctx.entry('ItemSet', row, 'sets', name=ctx.text(row['SetNameDesc'], human(row['SetName'])), key=row['SetName'], group=human(row['SetType']))
    for table in ['BoxReward', 'BoxClassReward']:
        for index, row in enumerate(ctx.rows(table)):
            item = ctx.link('Item', row['Group'])
            ctx.entry(table, row, 'boxes', name=item['name'] if item else human(row['Group']), key=str(index), group=human(row.get('Class', row['Race'])), fields={'Class': 'Class', 'Race': 'Faction', 'LevelMin': 'Minimum level', 'LevelMax': 'Maximum level'})
    skill_strings = {r['Name']: r for r in ctx.rows('SkillString')}
    classes = {}
    for row in ctx.rows('SkillAcquireData'):
        classes.setdefault(value(row['SkillId']), set()).add(human(row['ClassType']))
    for row in ctx.rows('Skill'):
        texts = skill_strings.get(row['SkillString_Key'], {})
        name = ctx.text(texts.get('SkillName'))
        if not name:
            continue
        ctx.entry('Skill', row, 'skills', name=name, description=ctx.text(texts.get('SkillSpecDesc')) or ctx.text(texts.get('SkillDescEffect')), fields={'SkillType': 'Type', 'SkillLvMax': 'Maximum level', 'NeedCostMp': 'MP cost', 'NeedCostHp': 'HP cost', 'NeedCoolTime': 'Cooldown (table units)', 'CastingTime': 'Casting time (table units)'}, group=', '.join(sorted(classes.get(value(row['ID']), {human(row['SkillType'])}))))
    bosses = {r['FieldNamedName'] for r in ctx.rows('WorldMapFieldNamed')}
    for row in ctx.rows('NpcData'):
        name = ctx.text(row['Desc'])
        if not name:
            continue
        group = 'Boss' if row['Name'] in bosses else human(row['NpcType'])
        ctx.entry('NpcData', row, 'creatures', name=name, group=group, description=ctx.text(row['SubDesc']), fields={'Level': 'Level', 'Grade': 'Grade', 'FunctionType': 'Service', 'NpcCreatureType': 'Creature type', 'bCanBeAttacked': 'Can be attacked', 'bNamed': 'Named creature', 'bUseBossBerserk': 'Has berserk phase', 'BossBerserkInvokeTime': 'Berserk time (table units)'})
