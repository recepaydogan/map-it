import type { ReactNode } from "react";

interface SettingRowProps {
  title: string;
  description: string;
  children: ReactNode;
}

const SettingRow = ({ title, description, children }: SettingRowProps) => (
  <div className="flex min-w-0 items-center justify-between gap-4 px-4 py-4">
    <div className="min-w-0 flex-1">
      <h3 className="text-[13px] font-medium text-primary">{title}</h3>
      <p className="mt-0.5 max-w-xl text-[12px] leading-relaxed text-muted">{description}</p>
    </div>
    <div className="flex shrink-0 items-center">{children}</div>
  </div>
);

export default SettingRow;
