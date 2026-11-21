"""Join native field-event entrance actors to their exact activity records."""
from context import value


def connect(entries, npc_rows, event_rows):
    events = {row['EventName']: 'FieldEvent:' + str(value(row['ID'])) for row in event_rows}
    connected = 0
    for row in npc_rows:
        entry = entries.get('NpcData:' + str(value(row['ID'])))
        if not entry:
            continue
        if row['FunctionType'] != 'ENpcFuncType::EnterFieldEvent':
            entry.pop('fieldEvent', None)
            continue
        token = row['FuncValues'][0] if row['FuncValues'] else ''
        activity_id = events.get(token)
        if not activity_id or activity_id not in entries:
            raise ValueError(f'Unresolved field-event entrance: {entry["id"]}/{token}')
        entry['fieldEvent'] = {'activityId': activity_id}
        connected += 1
    return connected
