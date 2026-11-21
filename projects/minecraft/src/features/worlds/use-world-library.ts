import { useSyncExternalStore } from "react";
import { WORLD_LIBRARY_CONFIG } from "../../game-config";
import { createWorldLibraryController } from "./world-library-controller";
import { createWorldRepository } from "./world-repository";
import { createRuntimeId } from "../../lib/runtime-id";
import { randomSeed } from "./seed-value";
import i18n from "../../i18n";

export const WORLD_LIBRARY_CHANGE_EVENT = "gm:world-library-changed";

const repository = createWorldRepository({
  name: WORLD_LIBRARY_CONFIG.databaseName,
  factory: indexedDB,
  onCommit: () => {
    void controller.refresh();
    channel?.postMessage({ type: "changed" });
    window.dispatchEvent(new Event(WORLD_LIBRARY_CHANGE_EVENT));
    // BroadcastChannel is not guaranteed in every Overwolf CEF build. A tiny
    // storage pulse gives other windows a durable fallback notification while
    // IndexedDB remains the single source of truth.
    try {
      localStorage.setItem(WORLD_LIBRARY_CONFIG.changePulseKey, createRuntimeId());
    } catch (error) {
      console.error("[World library] Unable to publish cross-window change", error);
    }
  },
});
const controller = createWorldLibraryController(() => repository.snapshot());
let channel: BroadcastChannel | null = null;
let started = false;

const start = () => {
  if (started) return;
  started = true;
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(WORLD_LIBRARY_CONFIG.channelName);
    channel.onmessage = event => {
      if (event.data?.type === "changed") void controller.refresh();
    };
  }
  window.addEventListener("storage", event => {
    if (event.key === WORLD_LIBRARY_CONFIG.changePulseKey || event.key === null) {
      void controller.refresh();
    }
  });
  // Reconcile on focus even if another window closed before broadcasting.
  window.addEventListener("focus", () => { void controller.refresh(); });
  const example = WORLD_LIBRARY_CONFIG.exampleWorld;
  void repository.initializeExampleWorld({
    name: i18n.t(example.nameKey),
    edition: example.edition,
    generation: { version: example.version, seed: randomSeed(), preset: example.preset, settings: {} },
  }, example.id, example.initializedMetaId).catch(error => {
    console.error("[World library] Unable to initialize the example world", error);
  }).finally(() => { void controller.refresh(); });
};

const subscribe = (listener: () => void) => {
  const unsubscribe = controller.subscribe(listener);
  start();
  return unsubscribe;
};

/** Commit first, then refresh the visible selection before closing a control. */
export const runWorldCommand = async <T>(command: () => Promise<T>): Promise<T> => {
  const value = await command();
  await controller.refresh();
  return value;
};

export const worldRepository = repository;
export const refreshWorldLibrary = () => controller.refresh();
export const useWorldLibrary = () => useSyncExternalStore(subscribe, controller.getSnapshot, controller.getSnapshot);
