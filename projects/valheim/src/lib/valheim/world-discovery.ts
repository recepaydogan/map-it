import type { ValheimWorldSave } from '../../types/world-save.ts'

/** Serialize scans; a world change during a scan queues one fresh pass. */
export function startWorldDiscovery(options: {
  discover: () => Promise<ValheimWorldSave[]>
  onWorlds: (worlds: ValheimWorldSave[]) => void
  onError: (error: unknown) => void
  onBusy: (busy: boolean) => void
  intervalMs?: number
}) {
  let stopped = false
  let running = false
  let queued = false
  let showBusy = false
  const request = async (visible = false): Promise<void> => {
    if (stopped) return
    if (visible) { showBusy = true; options.onBusy(true) }
    if (running) { queued = true; return }
    running = true
    do {
      queued = false
      try {
        const worlds = await options.discover()
        if (!stopped) options.onWorlds(worlds)
      } catch (error) { if (!stopped) options.onError(error) }
    } while (queued && !stopped)
    running = false
    if (!stopped && showBusy) { showBusy = false; options.onBusy(false) }
  }
  const timer = setInterval(() => { if (!running) void request() }, options.intervalMs ?? 15_000)
  void Promise.resolve().then(() => request(true))
  return {
    request,
    stop() { stopped = true; clearInterval(timer) },
  }
}
