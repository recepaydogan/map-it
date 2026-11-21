"""Publish conditional defensive modifiers with an explicit NPC target."""
from collections import defaultdict
from context import value

DEFENSIVE_STATS = {'DecreaseDamage', 'DecreaseCriticalDamage', 'DecreaseWeaponDamage',
                   'PvEDecreaseDamage', 'ResistFire', 'ResistWater', 'ResistWind', 'ResistEarth'}
ABNORMAL_POSITIONS = {'ESkillEffectType::Abnormal': 2, 'ESkillEffectType::Abnormal_True': 2,
                      'ESkillEffectType::Abnormal_Cc': 2, 'ESkillEffectType::Abnormal_Passive': 0}


class Mechanics:
    def __init__(self, ctx):
        self.ctx = ctx
        self.excluded = {}
        self.npcs = {value(row['ID']): row for row in ctx.rows('NpcData')}
        self.npc_names = {row['Name']: identity for identity, row in self.npcs.items()}
        self.abnormals = {value(row['ID']): row for row in ctx.rows('SkillAbnormal')}
        self.strings = {row['Name']: row for row in ctx.rows('SkillAbnormalString')}
        self.skills = {value(row['ID']): row for row in ctx.rows('Skill')}
        self.filters = {value(row['ID']): row for row in ctx.rows('SkillEffectFilter')}
        self.stat_definitions = {row['StatName'].split('::')[-1]: row for row in ctx.rows('StatCorrectionNumber')}
        self.effects, self.skill_effects = defaultdict(list), defaultdict(list)
        for row in ctx.rows('SkillAbnormalEffect'):
            self.effects[value(row['AbnormalId'])].append(row)
        for row in ctx.rows('SkillEffect'):
            self.skill_effects[value(row['SkillEffectGroupId'])].append(row)

    def describe(self, abnormal_id):
        abnormal = self.abnormals.get(abnormal_id)
        if not abnormal:
            return None
        name = self.ctx.text(self.strings.get(abnormal['SkillAbnormalString_Key'], {}).get('DescName'))
        if not name:
            return None
        stats = []
        effects = self.effects[abnormal_id]
        for effect in effects:
            args = effect['Values']
            if args and args[0] == 'CriticalResistRatio':
                # The stat label says critical-hit resistance, while the effect prose
                # says critical-damage defense. Do not publish an ambiguous mechanic.
                self.excluded[abnormal_id] = 'Critical-hit resistance and critical-damage defense labels disagree.'
                continue
            if (effect['AbnormalEffectType'] != 'EAbnormalEffectType::StatChange' or len(args) != 5
                    or args[0] not in DEFENSIVE_STATS or args[2:] != ['0', '0', '1']
                    or effect['AbnormalEffectLvGroupId'] != 'None'):
                continue
            amount = float(args[1])
            definition = self.stat_definitions.get(args[0], {})
            if (definition.get('IndicationStatWindow') != 'EStatIndication::PlusMinusPercent'
                    or definition.get('FullDivideNumber') != 2 or definition.get('StatUnit') != 1):
                continue
            # A source description can disagree with the effect value or its cap.
            # Use the numeric modifier, and omit cases requiring cap interpretation.
            if any(other['AbnormalEffectType'] == 'EAbnormalEffectType::AdjustSecondaryStatMaxValue'
                   and len(other['Values']) >= 2 and other['Values'][0] == args[0]
                   and float(other['Values'][1]) < amount for other in effects):
                self.excluded[abnormal_id] = 'The modifier exceeds a separate stat cap; final behavior is not established.'
                continue
            label = self.ctx.text('StatName_' + args[0])
            if label and amount:
                stats.append({'name': label, 'percent': amount / 100})
        if not stats:
            return None
        return {'name': name, 'stats': stats, 'maxStacks': abnormal['AbnormalOverlapCount']}

    def build(self, boss_ids, source, encounter):
        result, audit = [], []
        grouped = {}

        def add(npc_id, abnormal_id, origin, evidence, trigger=None):
            description = self.describe(abnormal_id)
            if not description:
                return
            key = (npc_id, abnormal_id, origin)
            if key not in grouped:
                grouped[key] = {'creatureId': 'NpcData:' + str(npc_id), **description,
                                'origin': origin, 'triggers': []}
                result.append(grouped[key])
            if trigger and trigger not in grouped[key]['triggers']:
                grouped[key]['triggers'].append(trigger)
            audit.append({'npcId': npc_id, 'abnormalId': abnormal_id, 'origin': origin, **evidence})

        for effect in encounter['effects'] if encounter else []:
            target = effect['target']
            targets = set(source['actors'].get(target, set())) if source else set()
            if target in self.npc_names:
                targets.add(self.npc_names[target])
            trigger = None
            defeated = effect.get('defeatedSpawners', [])
            if defeated and source and all(source['actors'].get(actor) for actor in defeated):
                names = {self.ctx.text(self.npcs[npc_id]['Desc']) for actor in defeated
                         for npc_id in source['actors'][actor] if npc_id in self.npcs}
                if names and '' not in names:
                    trigger = {'kind': 'defeatGroup', 'names': sorted(names)}
            for npc_id in sorted(targets & boss_ids):
                add(npc_id, effect['abnormalId'], 'encounter', effect, trigger)
        for npc_id in sorted(boss_ids):
            for skill_id in self.npcs[npc_id]['ActiveSkillList']:
                skill = self.skills.get(value(skill_id))
                if not skill:
                    continue
                for timing in skill['SkillEffectTimeDataList']:
                    effect_filter = self.filters.get(value(timing['SkillEffectFilterId']), {})
                    # A self-centered attack can still debuff players. Both the skill
                    # and effect filter must identify Self before calling this a boss buff.
                    if (skill['TargetProcessType'] != 'ESkillTargetProcessType::Self'
                            or effect_filter.get('EffectRangeType') != 'ESkillEffectRangeType::Self'):
                        continue
                    for effect in self.skill_effects[value(timing['SkillEffectGroupId'])]:
                        position = ABNORMAL_POSITIONS.get(effect['EffectType'])
                        args = effect['EffectValueList']
                        if position is not None and len(args) > position and args[position].isdigit():
                            add(npc_id, int(args[position]), 'skill', {'skillId': value(skill_id),
                                'effectId': value(effect['ID']), 'filterId': value(timing['SkillEffectFilterId'])})
        return result, audit
