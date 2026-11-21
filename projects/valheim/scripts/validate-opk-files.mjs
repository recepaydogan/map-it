import path from 'node:path'
import { collectRequiredOpkFiles } from './opk-content.mjs'

const root = path.resolve(import.meta.dirname, '..')
const result = collectRequiredOpkFiles(path.join(root, 'dist'))
console.log(`Verified ${result.requiredFiles.length} required OPK files.`)
