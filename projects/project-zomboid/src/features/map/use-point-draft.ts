import { useCallback, useState } from "react";

interface PointDraft<Value> {
  pointId: string;
  initialValue: Value;
  value: Value;
}

export const usePointDraft = <Value,>(pointId: string, initialValue: Value) => {
  const [draft, setDraft] = useState<PointDraft<Value>>({ pointId, initialValue, value: initialValue });
  const changed = draft.pointId !== pointId || !Object.is(draft.initialValue, initialValue);
  if (changed) setDraft({ pointId, initialValue, value: initialValue });
  const value = changed ? initialValue : draft.value;
  const setValue = useCallback((nextValue: Value) => {
    setDraft({ pointId, initialValue, value: nextValue });
  }, [pointId, initialValue]);

  return [value, setValue] as const;
};
