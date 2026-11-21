export const isOverwolf = (): boolean => typeof overwolf !== 'undefined'

export const getCurrentWindowName = (): Promise<string> =>
  new Promise((resolve) => {
    if (!isOverwolf()) {
      const previewWindow = new URLSearchParams(window.location.search).get('window')
      resolve(previewWindow ?? 'main')
      return
    }

    overwolf.windows.getCurrentWindow((result) => {
      resolve(result.success ? result.window.name : 'main')
    })
  })

