let pending: Promise<string | undefined> | undefined;

/** Windows region settings supplied by Overwolf, not live IP geolocation. */
export function getDeviceRegionName(): Promise<string | undefined> {
  if (typeof overwolf === "undefined" || !overwolf.os?.getRegionInfo) return Promise.resolve(undefined);
  pending ??= new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn("Overwolf region lookup timed out; using device time zone");
      resolve(undefined);
    }, 2000);
    try {
      overwolf.os.getRegionInfo((result) => {
        clearTimeout(timeout);
        if (!result.success) {
          console.warn("Overwolf region lookup failed; using device time zone", result.error);
          resolve(undefined);
          return;
        }
        resolve(result.info?.name);
      });
    } catch (error) {
      clearTimeout(timeout);
      console.error("Failed to request Overwolf region", error);
      resolve(undefined);
    }
  });
  return pending;
}
