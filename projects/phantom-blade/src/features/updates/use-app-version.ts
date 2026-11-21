import { useEffect, useState } from "react";
import { version as bundledVersion } from "../../../package.json";
import { readAppVersion } from "../../services/analytics/app-context";

/** The installed manifest wins; the bundled package version covers web previews. */
export const useAppVersion = (): string => {
  const [version, setVersion] = useState(bundledVersion);
  useEffect(() => {
    let active = true;
    void readAppVersion().then((installedVersion) => {
      if (active && installedVersion) setVersion(installedVersion);
    });
    return () => { active = false; };
  }, []);
  return version;
};
