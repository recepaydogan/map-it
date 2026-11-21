import { createContext, useContext, useEffect, useId } from "react";

export type RouteFeedbackStatus = "calculating" | "error" | null;
export const RouteFeedbackContext = createContext<(id: string, status: RouteFeedbackStatus) => void>(() => {});

export const useRouteFeedback = (status: string) => {
  const report = useContext(RouteFeedbackContext);
  const id = useId();
  useEffect(() => {
    report(id, status === "calculating" || status === "error" ? status : null);
    return () => report(id, null);
  }, [id, report, status]);
};

