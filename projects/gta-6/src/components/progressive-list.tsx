import { Children, isValidElement, useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

const PAGE_SIZE = 6;

const List = ({ items, className, initialCount, pageSize }: { items: ReactNode[]; className?: string; initialCount: number; pageSize: number }) => {
  const { t } = useTranslation();
  const id = useId();
  const [limit, setLimit] = useState(initialCount);
  return <>
    <div id={id} className={className}>{items.slice(0, limit)}</div>
    {items.length > limit && <button type="button" aria-controls={id}
      onClick={() => setLimit((current) => current + pageSize)}
      className="mx-auto mt-2 block cursor-pointer text-center text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
      {t("reference.showMore", { count: Math.min(pageSize, items.length - limit) })}
    </button>}
  </>;
};

/** Each list expands independently and resets when its entries change. */
const ProgressiveList = ({ children, className, initialCount = PAGE_SIZE, pageSize = PAGE_SIZE }: { children: ReactNode; className?: string; initialCount?: number; pageSize?: number }) => {
  const items = Children.toArray(children);
  if (!items.length) return null;
  const identity = JSON.stringify(items.map((item) => isValidElement(item) ? item.key : item));
  return <List key={`${initialCount}:${pageSize}:${identity}`} items={items} className={className} initialCount={initialCount} pageSize={pageSize} />;
};

export default ProgressiveList;
