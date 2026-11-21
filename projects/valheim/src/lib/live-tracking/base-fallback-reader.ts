import { parseBaseSnapshot } from './base-fallback.ts'

const root = (directory: string) => `${directory}\\BepInEx\\plugins\\ValheimCompanion`
export const writeBaseRequest = (directory: string, uid: string, expiresAt: number): Promise<void> => new Promise((resolve, reject) => {
  overwolf.io.writeFileContents(`${root(directory)}\\base-fallback-request.txt`, `${uid}\n${expiresAt}`,
    'UTF8' as overwolf.io.enums.eEncoding, false, result => result.success ? resolve() : reject(new Error(result.error ?? 'base-request-failed')))
})
export const readBaseSnapshot = (directory: string) => new Promise<ReturnType<typeof parseBaseSnapshot>>((resolve, reject) => {
  overwolf.io.readFileContents(`${root(directory)}\\base-fallback.json`, 'UTF8' as overwolf.io.enums.eEncoding, result => {
    if (!result.success) return reject(new Error(result.error ?? 'base-snapshot-missing'))
    resolve(parseBaseSnapshot(typeof result.content === 'string' ? result.content : null))
  })
})
