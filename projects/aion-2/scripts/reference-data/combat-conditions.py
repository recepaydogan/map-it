"""Resolve explicit boolean skill predicates without guessing numeric comparisons."""
import json


def condition_key(conditions):
    return json.dumps(conditions, sort_keys=True, ensure_ascii=False)


class Conditions:
    def __init__(self, ctx, abnormals):
        self.ctx = ctx
        self.abnormals = abnormals
        self.strings = {row['Name'].casefold(): row for row in ctx.rows('SkillAbnormalString')}
        self.groups = {}
        for row in abnormals.values():
            self.groups.setdefault(row['GroupId'], []).append(row)

    def name(self, abnormal):
        row = self.strings.get(abnormal['SkillAbnormalString_Key'].casefold(), {})
        return self.ctx.text(row.get('DescName'))

    def resolve(self, rows):
        # The table does not expose a logical operator for multiple predicates.
        # Do not assume AND/OR until that relationship is established.
        if len(rows) > 1:
            return None, 'compound-condition-operator-unresolved'
        result = []
        for row in rows:
            kind = row['ConditionType'].split('::')[-1]
            args = row.get('ConditionValues', [])
            positive = row.get('ConditionalExpression')
            if not isinstance(positive, bool):
                return None, 'condition-polarity-unresolved'
            if kind == 'IsMainTarget' and all(arg in ('0', '') for arg in args):
                result.append({'key': 'mainTarget' if positive else 'otherTarget'})
            elif kind == 'ObjectType' and len(args) == 2 and args[1] in ('0', '') and args[0] in ('PC', 'NPC'):
                result.append({'key': ('players' if args[0] == 'PC' else 'npcs') if positive
                               else ('notPlayers' if args[0] == 'PC' else 'notNpcs')})
            elif kind in ('Target_HasAbnormalId', 'Caster_HasAbnormalId',
                          'Target_HasAbnormalGroupId', 'Caster_HasAbnormalGroupId'):
                if len(args) != 2 or not args[0].isdigit() or args[1] not in ('0', '1', ''):
                    return None, 'status-condition-parameters-unresolved'
                identity = int(args[0])
                records = self.groups.get(identity, []) if kind.endswith('GroupId') else [self.abnormals.get(identity)]
                if not records or any(record is None for record in records):
                    return None, 'condition-status-missing'
                # Nonzero extra arguments can constrain stacks. Only one-stack
                # effects make presence sufficient without interpreting a threshold.
                if args[1] == '1' and any(record['AbnormalOverlapCount'] != 1 for record in records):
                    return None, 'status-stack-condition-unresolved'
                names = {self.name(record) for record in records}
                if len(names) != 1 or not next(iter(names)):
                    return None, 'condition-status-name-unresolved'
                owner = 'target' if kind.startswith('Target_') else 'caster'
                result.append({'key': owner + ('HasStatus' if positive else 'LacksStatus'), 'name': next(iter(names))})
            else:
                return None, 'unsupported-condition:' + kind
        return result, None
