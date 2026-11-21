const normalizeWindowsPath = (path: string): string =>
  path.replaceAll("/", "\\").replace(/\\+$/, "");

/**
 * Preserve the useful install location while keeping a Windows account name
 * out of analytics when PEAK is installed below a user profile.
 */
export const installPathAnalyticsProperties = (directory: string): {
  install_directory: string;
  executable_path: string;
} => {
  const normalized = normalizeWindowsPath(directory);
  const safeDirectory = normalized.replace(
    /^([a-z]:\\(?:Users|Documents and Settings)\\)[^\\]+(?=\\|$)/i,
    "$1<user>",
  );
  return {
    install_directory: safeDirectory,
    executable_path: `${safeDirectory}\\PEAK.exe`,
  };
};
