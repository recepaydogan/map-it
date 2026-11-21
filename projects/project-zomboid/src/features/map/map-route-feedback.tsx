import { useCallback, useState, type ReactNode } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RouteFeedbackContext, type RouteFeedbackStatus } from "./route-feedback-context";
import { cn } from "../../lib/cn";

interface MapRouteFeedbackProps {
  children: ReactNode;
  externalStatus: RouteFeedbackStatus;
  raised: boolean;
  visible: boolean;
}

const MapRouteFeedback = ({ children, externalStatus, raised, visible }: MapRouteFeedbackProps) => {
  const { t } = useTranslation();
  const [statuses, setStatuses] = useState<Record<string, RouteFeedbackStatus>>({});
  const report = useCallback((id: string, status: RouteFeedbackStatus) => {
    setStatuses((current) => {
      if ((current[id] ?? null) === status) return current;
      const next = { ...current };
      if (status) next[id] = status;
      else delete next[id];
      return next;
    });
  }, []);
  const pending = [externalStatus, ...Object.values(statuses)];
  const status = pending.includes("calculating") ? "calculating" : pending.includes("error") ? "error" : null;

  return (
    <RouteFeedbackContext value={report}>
      {children}
      {visible && status && (
        <div role={status === "error" ? "alert" : "status"} data-map-ui
          className={cn("pointer-events-none absolute left-1/2 z-[60] flex max-w-[calc(100%-48px)] -translate-x-1/2 items-center gap-2 rounded-[var(--radius-md)] border bg-surface/95 px-4 py-3 text-center text-xs font-medium text-white shadow-lg",
            raised ? "bottom-28" : "bottom-5", status === "error" ? "border-warning/50" : "border-border")}>
          {status === "calculating"
            ? <LoaderCircle size={16} className="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            : <AlertTriangle size={16} className="shrink-0 text-warning" aria-hidden="true" />}
          {t(status === "calculating" ? "map.route.creating" : "map.route.unavailable")}
        </div>
      )}
    </RouteFeedbackContext>
  );
};

export default MapRouteFeedback;
