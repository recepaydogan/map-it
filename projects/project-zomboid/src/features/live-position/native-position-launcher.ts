import { getRuntimeZomboidRootCandidates, joinPath } from "../live-bridge/live-bridge-paths";

interface PluginEvent<T> {
  addListener: (listener: (event: T) => void) => void;
  removeListener: (listener: (event: T) => void) => void;
}
interface ProcessPlugin {
  launchProcess: (path: string, args: string, environment: string, hidden: boolean,
    killOnClose: boolean, callback: (result: { error?: string; data?: number }) => void) => void;
  sendTextToProcess: (pid: number, text: string) => void;
  terminateProcess: (pid: number) => void;
  onProcessExited: PluginEvent<{ processId: number; exitCode: number }>;
  onDataReceivedEvent: PluginEvent<{ error?: string; data?: string }>;
}

// Arguments are passed directly to CreateProcess, never through a shell.
const quote = (value: string) => {
  if (/["\r\n]/.test(value)) throw new Error("Invalid native position argument");
  return `"${value.replace(/\\+$/, (slashes) => slashes + slashes)}"`;
};

export const startNativePositionLauncher = () => {
  let stopped = false;
  let pending = false;
  let childPid: number | null = null;
  let plugin: ProcessPlugin | null = null;
  let appPath: string | null = null;
  let retryAt = 0;
  const onExit = (event: { processId: number; exitCode: number }) => {
    if (event.processId !== childPid) return;
    childPid = null;
    retryAt = Date.now() + 10_000;
    if (event.exitCode !== 0) console.error("[NativePosition] Launcher exited", event);
  };
  const onData = (event: { error?: string; data?: string }) => {
    if (event.error) console.error("[NativePosition]", event.error);
    else if (event.data) console.log("[NativePosition]", event.data);
  };
  const tick = async () => {
    if (stopped || pending) return;
    if (childPid !== null) { plugin?.sendTextToProcess(childPid, "ping"); return; }
    if (Date.now() < retryAt) return;
    pending = true;
    try {
      if (!plugin) {
        plugin = await new Promise<ProcessPlugin>((resolve, reject) => {
          overwolf.extensions.current.getExtraObject("process-manager-plugin", (result) => {
            if (!result.success || !result.object) reject(new Error(result.error || "Process plugin unavailable"));
            else resolve(result.object as ProcessPlugin);
          });
        });
        if (stopped) return;
        plugin.onProcessExited.addListener(onExit);
        plugin.onDataReceivedEvent.addListener(onData);
      }
      if (!appPath) {
        const current = overwolf.extensions.current as typeof overwolf.extensions.current & {
          getExtensionData: (callback: (result: { success: boolean; data?: { path_on_disk?: string } }) => void) => void;
        };
        appPath = await new Promise<string>((resolve, reject) => {
          current.getExtensionData((result) => result.success && result.data?.path_on_disk
            ? resolve(result.data.path_on_disk) : reject(new Error("App installation path unavailable")));
        });
      }
      const info = await new Promise<overwolf.games.GetRunningGameInfoResult>((resolve) => overwolf.games.getRunningGameInfo(resolve));
      if (stopped || !info?.isRunning || Number(info.classId) !== 10598 || !info.processId) return;
      const root = getRuntimeZomboidRootCandidates(overwolf.io.paths)[0];
      if (!root) throw new Error("Zomboid user path unavailable");
      const bundle = joinPath(appPath, "native-position");
      const args = ["--add-modules", "jdk.attach", "-jar", quote(joinPath(bundle, "launcher.jar")),
        String(info.processId), quote(joinPath(root, "Lua\\PZInteractiveMapNative"))].join(" ");
      await new Promise<void>((resolve, reject) => {
        plugin!.launchProcess(joinPath(bundle, "runtime\\bin\\java.exe"), args, "{}", true, true, (result) => {
          if (result.error || !result.data) { reject(new Error(result.error || "Native launcher did not start")); return; }
          if (stopped) plugin!.terminateProcess(result.data);
          else { childPid = result.data; plugin!.sendTextToProcess(childPid, "ping"); }
          resolve();
        });
      });
    } catch (error) {
      retryAt = Date.now() + 30_000;
      console.error("[NativePosition] Automatic start failed", error);
    } finally { pending = false; }
  };
  void tick();
  const timer = window.setInterval(() => void tick(), 5_000);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    if (childPid !== null) plugin?.terminateProcess(childPid);
    plugin?.onProcessExited.removeListener(onExit);
    plugin?.onDataReceivedEvent.removeListener(onData);
  };
};
