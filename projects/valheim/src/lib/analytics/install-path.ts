const normalizeWindowsPath = (path: string) => path.replaceAll('/', '\\').replace(/\\+$/, '')

/**
 * Preserve the useful install location while keeping a Windows account name
 * out of analytics when a player installs the game below their user profile.
 */
export function installPathAnalyticsProperties(directory: string): {
  install_directory: string
  executable_path: string
} {
  const normalized = normalizeWindowsPath(directory)
  const safeDirectory = normalized.replace(
    /^([a-z]:\\(?:Users|Documents and Settings)\\)[^\\]+(?=\\|$)/i,
    '$1<user>',
  )
  return {
    install_directory: safeDirectory,
    executable_path: `${safeDirectory}\\valheim.exe`,
  }
}
