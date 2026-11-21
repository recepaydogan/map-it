import { useLayoutEffect, useRef } from "react";
import NotificationStack, { type StackNotification } from "./notification-stack";

/** Keep the stack and map controls inside the content frame, before the ad rail. */
export default function NotificationDock({ notifications, label }: {
  notifications: StackNotification[];
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const count = notifications.length;
  useLayoutEffect(() => {
    const dock = ref.current;
    const container = dock?.parentElement;
    if (!dock || !container) return;
    const properties = ["--map-right-panel-bottom", "--map-controls-right", "--map-controls-bottom", "--map-live-controls-bottom", "--map-notification-reserved-width"];
    const previous = properties.map(property => container.style.getPropertyValue(property));
    const update = () => {
      const style = getComputedStyle(dock);
      const bottom = dock.getBoundingClientRect().height + Number.parseFloat(style.bottom) + 12;
      const controlsHeight = 84;
      container.style.setProperty(properties[0], `${bottom + controlsHeight + 12}px`);
      container.style.setProperty(properties[1], style.right);
      container.style.setProperty(properties[2], `${bottom}px`);
      container.style.setProperty(properties[3], `${bottom + controlsHeight + 8}px`);
      container.style.setProperty(properties[4], `${Math.ceil(dock.getBoundingClientRect().width) + 16}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(dock);
    return () => {
      observer.disconnect();
      properties.forEach((property, index) => {
        if (previous[index]) container.style.setProperty(property, previous[index]);
        else container.style.removeProperty(property);
      });
    };
  }, [count]);
  if (!count) return null;
  return <div ref={ref} data-notification-dock data-map-ui
    className="pointer-events-none absolute bottom-4 right-4 z-[80] w-[320px] max-w-[calc(100%-2rem)]">
    <NotificationStack notifications={notifications} label={label} />
  </div>;
}
