import { useCallback, useState } from "react";

interface PointDraft<Value> {
  pointId: string;
  value: Value;
}

export const usePointDraft = <Value,>(pointId: string, initialValue: Value) => {
  const [draft, setDraft] = useState<PointDraft<Value>>({ pointId, value: initialValue });
  const value = draft.pointId === pointId ? draft.value : initialValue;
  const setValue = useCallback((nextValue: Value) => {
    setDraft({ pointId, value: nextValue });
  }, [pointId]);

  return [value, setValue] as const;
};
