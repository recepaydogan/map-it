import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export default function SharedPageHeader({ icon: Icon, title, description, children }: {
  icon: LucideIcon; title: string; description?: string; children?: ReactNode;
}) {
  return <header className="map-it-page-header">
    <div className="map-it-page-header-inner">
      <div className="map-it-page-heading">
        <span className="map-it-page-icon"><Icon size={22} aria-hidden="true" /></span>
        <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      </div>
      {children && <div className="map-it-page-actions">{children}</div>}
    </div>
  </header>;
}
