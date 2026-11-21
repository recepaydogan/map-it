import type { LivePosition } from "./live-position-types";

const LIVE_POSITION_CHANNEL = "pzim:live-position-feed";

interface LivePositionChannelMessage {
  type: "live-position";
  position: LivePosition | null;
}

const isChannelMessage = (value: unknown): value is LivePositionChannelMessage => {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<LivePositionChannelMessage>;
  return message.type === "live-position"
    && (message.position === null
      || (typeof message.position === "object" && message.position?.version === 1));
};

export const isLivePositionChannelAvailable = () =>
  typeof BroadcastChannel !== "undefined";

export const createLivePositionBroadcaster = () => {
  if (!isLivePositionChannelAvailable()) {
    return {
      publish: () => undefined,
      close: () => undefined,
    };
  }

  const channel = new BroadcastChannel(LIVE_POSITION_CHANNEL);
  return {
    publish: (position: LivePosition | null) => {
      const message: LivePositionChannelMessage = { type: "live-position", position };
      channel.postMessage(message);
    },
    close: () => channel.close(),
  };
};

export const subscribeLivePositionChannel = (
  listener: (position: LivePosition | null) => void,
): (() => void) => {
  if (!isLivePositionChannelAvailable()) return () => undefined;

  const channel = new BroadcastChannel(LIVE_POSITION_CHANNEL);
  const receive = (event: MessageEvent<unknown>) => {
    if (!isChannelMessage(event.data)) {
      console.error("Received an invalid live-position channel message.", event.data);
      return;
    }
    listener(event.data.position);
  };
  channel.addEventListener("message", receive);
  return () => {
    channel.removeEventListener("message", receive);
    channel.close();
  };
};
