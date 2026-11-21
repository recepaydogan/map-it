import fs from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const root = path.resolve(import.meta.dirname, '..')
const schema = JSON.parse(fs.readFileSync(path.join(root, 'overwolf-manifest-schema.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.json'), 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: false })

addFormats(ajv)

if (!ajv.validate(schema, manifest)) {
  console.error('Overwolf manifest schema validation failed:')
  console.error(ajv.errorsText(ajv.errors, { separator: '\n' }))
  process.exit(1)
}

console.log('public/manifest.json valid')
