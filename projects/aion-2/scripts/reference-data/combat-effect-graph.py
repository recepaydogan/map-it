"""Traverse typed combat references, preserving conditions and source paths."""
from collections import defaultdict
import importlib
from context import value

conditions_module = importlib.import_module('combat-conditions')
ABNORMAL_SLOT = {'Abnormal': 2, 'Abnormal_True': 2, 'Abnormal_Cc': 2, 'Abnormal_Passive': 0}
HARMFUL = {
    'Stun': 'stun', 'Hold': 'root', 'Snare': 'root', 'Slow': 'slow',
    'KnockdownInstant': 'knockdown', 'BlockSkill': 'silence', 'Silence': 'silence',
    'Sleep': 'sleep', 'Fear': 'fear', 'Aerial': 'airborne',
    'Dot_NormalCalc': 'damageOverTime', 'Dot_TargetMaxHP': 'damageOverTime',
}
SELF = {'HpBarrier': 'shieldSelf', 'Hot': 'healSelf', 'Hot_Ratio': 'healSelf', 'DamageReflect': 'reflectSelf'}


def enum(raw):
    return str(raw).split('::')[-1]


def identity(args, slot):
    return int(args[slot]) if len(args) > slot and str(args[slot]).isdigit() else None


class CombatGraph:
    def __init__(self, ctx):
        self.skills = {value(row['ID']): row for row in ctx.rows('Skill')}
        self.filters = {value(row['ID']): row for row in ctx.rows('SkillEffectFilter')}
        self.abnormals = {value(row['ID']): row for row in ctx.rows('SkillAbnormal')}
        self.projectiles = {value(row['ID']): row for row in ctx.rows('SkillProjectile')}
        self.effects, self.abnormal_effects = defaultdict(list), defaultdict(list)
        for row in ctx.rows('SkillEffect'):
            self.effects[value(row['SkillEffectGroupId'])].append(row)
        for row in ctx.rows('SkillAbnormalEffect'):
            self.abnormal_effects[value(row['AbnormalId'])].append(row)
        self.conditions = conditions_module.Conditions(ctx, self.abnormals)
        self.defenses = importlib.import_module('dungeon-combat-mechanics').Mechanics(ctx)
        self.cache = {}

    def resolve(self, skill_id):
        if skill_id in self.cache:
            return self.cache[skill_id]
        resolved, skipped = [], []

        def reject(path, reason, **detail):
            skipped.append({'path': path, 'reason': reason, **detail})

        def enter(node, path):
            if node in path:
                reject([*path, node], 'reference-cycle')
                return None
            if len(path) >= 24:
                reject([*path, node], 'reference-depth-limit')
                return None
            return [*path, node]

        def emit(outcomes, conditions, path):
            if outcomes:
                resolved.append({'outcomes': sorted(outcomes), 'conditions': conditions, 'path': path})

        def skill_branch(current_id, inherited, path):
            path = enter('Skill:' + str(current_id), path)
            if path is None:
                return
            skill = self.skills.get(current_id)
            if not skill:
                reject(path, 'linked-skill-missing')
                return
            seen_events = set()
            for event in skill.get('SkillEffectTimeDataList', []):
                event_key = tuple(value(event.get(key, 0)) for key in ('SkillEffectGroupId', 'SkillEffectFilterId', 'ProjectileId'))
                if event_key in seen_events:
                    continue
                seen_events.add(event_key)
                group_id, filter_id, projectile_id = event_key
                if group_id:
                    group_branch(skill, group_id, filter_id, inherited, path)
                if projectile_id:
                    projectile_branch(skill, projectile_id, inherited, path)

        def projectile_branch(skill, projectile_id, inherited, path):
            path = enter('SkillProjectile:' + str(projectile_id), path)
            if path is None:
                return
            projectile = self.projectiles.get(projectile_id)
            if not projectile:
                reject(path, 'projectile-missing')
                return
            group_id = value(projectile.get('ChainSkillEffectGroupId', 0))
            if group_id:
                group_branch(skill, group_id, value(projectile.get('ChainSkillEffectFilterId', 0)), inherited, path)
            next_id = value(projectile.get('ChainProjectileId', 0))
            if next_id:
                projectile_branch(skill, next_id, inherited, path)

        def abnormal_branch(skill, abnormal_id, hostile, own, inherited, path):
            path = enter('SkillAbnormal:' + str(abnormal_id), path)
            if path is None:
                return
            abnormal = self.abnormals.get(abnormal_id)
            if not abnormal:
                reject(path, 'linked-status-missing')
                return
            changes = self.abnormal_effects.get(abnormal_id, [])
            defense = None
            if own and not inherited:
                defense = self.defenses.describe(abnormal_id)
                if defense:
                    resolved.append({'outcomes': [], 'conditions': [], 'path': path, 'defense': defense})
            if not changes:
                reject(path, 'status-has-no-effect-records')
            for change in changes:
                current_path = [*path, 'SkillAbnormalEffect:' + str(value(change['ID']))]
                kind = enum(change['AbnormalEffectType'])
                outcome = HARMFUL.get(kind) if hostile and enum(abnormal['AbnormalType']) == 'DeBuff' else SELF.get(kind) if own else None
                if outcome:
                    emit({outcome}, inherited, current_path)
                    continue
                args = change.get('Values', [])
                if kind == 'StatChange' and defense and len(args) == 5 and args[2:] == ['0', '0', '1'] and change.get('AbnormalEffectLvGroupId') == 'None':
                    label = self.defenses.ctx.text('StatName_' + args[0])
                    if any(stat['name'] == label and stat['percent'] == float(args[1]) / 100 for stat in defense['stats']):
                        continue
                # A self-applied status retains the original actor. Never attribute
                # a skill cast by a hostile recipient to the creature casting it.
                if kind in ('CastSkill', 'CastSkillByCaster', 'EndCastSkill', 'EndCastSkillByCaster') and own:
                    args = change.get('Values', [])
                    slot = 0 if kind.startswith('End') else 1
                    next_id = identity(args, slot)
                    name = self.conditions.name(abnormal)
                    if not next_id or not name or change.get('AbnormalEffectLvGroupId') != 'None':
                        reject(current_path, 'status-skill-link-unresolved')
                        continue
                    # A target predicate belongs to the parent target, not the
                    # target chosen by a triggered skill. Keep that edge in audit.
                    if inherited:
                        reject(current_path, 'trigger-condition-scope-unresolved')
                        continue
                    trigger = {'key': 'statusEnds' if kind.startswith('End') else 'duringStatus', 'name': name}
                    skill_branch(next_id, [trigger], current_path)
                elif kind != 'NoEffect':
                    reject(current_path, 'unsupported-status-effect:' + kind)

        def group_branch(skill, group_id, filter_id, inherited, path):
            rows = self.effects.get(group_id, [])
            if not rows:
                reject([*path, 'SkillEffectGroup:' + str(group_id)], 'effect-group-missing')
            filter_row = self.filters.get(filter_id)
            for effect in rows:
                current_path = [*path, 'SkillEffect:' + str(value(effect['ID']))]
                conditions, error = self.conditions.resolve(effect.get('SkillEffectConditionList', []))
                if error:
                    reject(current_path, error, sourceConditions=effect.get('SkillEffectConditionList'))
                    continue
                # Combining inherited and local predicates would invent AND/OR.
                if inherited and conditions:
                    reject(current_path, 'compound-trigger-condition-unresolved')
                    continue
                conditions = inherited or conditions
                kind = enum(effect['EffectType'])
                args = effect.get('EffectValueList', [])
                if kind == 'CasterSkill':
                    next_id = identity(args, 0)
                    if conditions:
                        reject(current_path, 'trigger-condition-scope-unresolved')
                    elif len(args) != 1 or not next_id:
                        reject(current_path, 'caster-skill-link-unresolved')
                    else:
                        skill_branch(next_id, [], current_path)
                    continue
                if not filter_row:
                    reject(current_path, 'effect-filter-missing', filterId=filter_id)
                    continue
                current_path = [*current_path, 'SkillEffectFilter:' + str(filter_id)]
                range_type = enum(filter_row['EffectRangeType'])
                hostile = filter_row.get('bRelationshipEnemy') and not filter_row.get('bRelationshipFriendly') and range_type != 'Self'
                own = range_type == 'Self' and enum(skill['TargetProcessType']) == 'Self'
                found = set()
                if kind == 'Damage' and hostile:
                    found.add({'Physic': 'physicalDamage', 'Magic': 'magicDamage'}.get(enum(skill['SkillDamageType']), 'damage'))
                    maximum = filter_row.get('TargetCountMax', 0)
                    if maximum == 1:
                        found.add('singleTarget')
                    elif maximum > 1:
                        found.add('multipleTargets')
                elif kind in ('HpHeal', 'HpHealRatio') and own:
                    found.add('healSelf')
                elif kind in ('MPBurn', 'MPBurnRatio') and hostile:
                    found.add('drainMana')
                elif kind in ABNORMAL_SLOT:
                    next_id = identity(args, ABNORMAL_SLOT[kind])
                    if next_id:
                        abnormal_branch(skill, next_id, hostile, own, conditions, current_path)
                    else:
                        reject(current_path, 'status-link-invalid')
                    continue
                if found:
                    emit(found, conditions, current_path)
                elif kind not in ('NoEffect', 'GroggyGuardDecreaseEnergy'):
                    reject(current_path, ('unsupported-effect:' if hostile or own else 'target-relationship-unresolved:') + kind)

        skill_branch(skill_id, [], [])
        # Repeated timings and converging paths do not inflate the audit counts.
        self.cache[skill_id] = (list({conditions_module.condition_key(row): row for row in resolved}.values()),
                                list({conditions_module.condition_key(row): row for row in skipped}.values()))
        return self.cache[skill_id]
