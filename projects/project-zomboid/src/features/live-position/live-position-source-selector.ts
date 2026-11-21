import { isFreshLivePositionBridgePayload, type ParsedLivePositionPayload } from "./live-position-payload";

type PositionSource = "native" | "bridge";

/** Keep both feeds available; the native feed wins whenever it is fresh. */
export const createLivePositionSourceSelector = (
  publish: (payload: ParsedLivePositionPayload | null) => void,
  now = Date.now,
) => {
  const samples: Record<PositionSource, ParsedLivePositionPayload | null> = { native: null, bridge: null };
  let selected: ParsedLivePositionPayload | null = null;
  const refresh = () => {
    const time = now();
    const next = ([samples.native, samples.bridge]).find(
      (sample) => sample !== null && isFreshLivePositionBridgePayload(sample, time),
    ) ?? null;
    if (next === selected) return;
    selected = next;
    publish(next);
  };
  return {
    refresh,
    accept: (source: PositionSource, payload: ParsedLivePositionPayload) => {
      const previous = samples[source];
      if (!isFreshLivePositionBridgePayload(payload, now())) return;
      if (previous && payload.updatedAt < previous.updatedAt) return;
      samples[source] = payload;
      refresh();
    },
  };
};
