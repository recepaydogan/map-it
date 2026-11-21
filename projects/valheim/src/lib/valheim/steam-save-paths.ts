/** Optional game APIs must never prevent the existing filesystem scan. */
function optionalPaths(request: (done: (paths: string[]) => void) => void): Promise<string[]> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve([]), 1000)
    const done = (paths: string[]) => { clearTimeout(timer); resolve(paths) }
    try { request(done) } catch { done([]) }
  })
}

function steamRoot(executable: string | undefined): string[] {
  if (!executable) return []
  const path = executable.replaceAll('/', '\\')
  // A secondary game library is not necessarily the Steam client directory.
  // Its userdata is only a candidate; the launcher path is checked separately.
  const match = path.match(/^([a-z]:\\.+)\\(?:steam\.exe|steamapps\\common\\Valheim\\valheim\.exe)$/i)
  return match ? [match[1]] : []
}

export async function discoverSteamRoots(): Promise<string[]> {
  const defaults = [overwolf.io.paths.programFilesX86, overwolf.io.paths.programFiles]
    .filter((path): path is string => Boolean(path))
    .map(path => `${path}\\Steam`)
  const detected = await Promise.all([
    optionalPaths(done => {
      if (!overwolf.games?.launchers?.getRunningLaunchersInfo) return done([])
      overwolf.games.launchers.getRunningLaunchersInfo(result => done(result.success
        ? (result.launchers ?? []).flatMap(launcher => /[\\/]steam\.exe$/i.test(launcher.path ?? '') ? steamRoot(launcher.path) : [])
        : []))
    }),
    optionalPaths(done => {
      if (!overwolf.games?.getGameInfo) return done([])
      overwolf.games.getGameInfo(21668, result => done(result.success
        ? [...steamRoot(result.gameInfo?.LauncherPath), ...steamRoot(result.gameInfo?.ProcessPath)]
        : []))
    }),
  ])
  const unique = new Map<string, string>()
  for (const path of [...defaults, ...detected.flat()]) {
    const normalized = path.replaceAll('/', '\\').replace(/\\+$/, '')
    if (!unique.has(normalized.toLowerCase())) unique.set(normalized.toLowerCase(), normalized)
  }
  return [...unique.values()]
}
