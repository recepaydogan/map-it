export const readOverwolfBinaryFile = (path: string, maxBytes: number, message: string): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    if (typeof overwolf === "undefined" || !overwolf.io?.readBinaryFile) {
      reject(new Error("Overwolf file API is unavailable.")); return;
    }
    overwolf.io.readBinaryFile(path, {
      encoding: "UTF8" as overwolf.io.enums.eEncoding,
      maxBytesToRead: maxBytes,
      offset: 0,
    }, result => {
      if (!result.success || !result.content) {
        reject(new Error(result.error ?? message)); return;
      }
      resolve(new Uint8Array(result.content));
    });
  });

export const listOverwolfDirectories = (path: string): Promise<string[]> => new Promise((resolve) => {
  if (typeof overwolf === "undefined" || !overwolf.io?.dir) { resolve([]); return; }
  overwolf.io.dir(path, result => resolve(result.success
    ? (result.data ?? []).filter(entry => entry.type === "dir").map(entry => entry.name)
    : []));
});
