import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

const readJson = <T>(filePath: string) => JSON.parse(readFile(filePath)) as T

const developmentDocs = [
  'docs/development/index.md',
  'docs/development/crud-page-guide.md',
  'docs/development/backend-integration.md',
  'docs/development/permission-integration.md',
  'docs/development/release-checklist.md',
]

const extractNpmRunScripts = (content: string) =>
  Array.from(content.matchAll(/\bnpm run ([a-z0-9:.-]+)/gi)).map(
    (match) => match[1]
  )

describe('development documentation center', () => {
  it('ships the T-501 documentation entry points', () => {
    developmentDocs.forEach((docPath) => {
      expect(fs.existsSync(path.join(rootDir, docPath))).toBe(true)
    })

    const index = readFile('docs/development/index.md')
    const readme = readFile('README.md')

    expect(index).toContain('crud-page-guide.md')
    expect(index).toContain('backend-integration.md')
    expect(index).toContain('permission-integration.md')
    expect(index).toContain('release-checklist.md')
    expect(index).toContain('../architecture/auth-permission.md')
    expect(index).toContain('../deployment.md')
    expect(readme).toContain('docs/development/index.md')
  })

  it('keeps documented npm scripts backed by package.json', () => {
    const packageJson = readJson<{ scripts: Record<string, string> }>(
      'package.json'
    )
    const documentedScripts = developmentDocs.flatMap((docPath) =>
      extractNpmRunScripts(readFile(docPath))
    )

    expect(documentedScripts).toEqual(
      expect.arrayContaining(['lint:check', 'typecheck', 'test', 'build:prd'])
    )
    documentedScripts.forEach((scriptName) => {
      expect(packageJson.scripts[scriptName]).toBeTruthy()
    })
  })

  it('documents CRUD, backend and permission contracts for new modules', () => {
    const crudGuide = readFile('docs/development/crud-page-guide.md')
    const backendGuide = readFile('docs/development/backend-integration.md')
    const permissionGuide = readFile(
      'docs/development/permission-integration.md'
    )

    expect(crudGuide).toContain('ProTable')
    expect(crudGuide).toContain('ProForm')
    expect(crudGuide).toContain('PermissionButton')
    expect(crudGuide).toContain('Mock')

    expect(backendGuide).toContain('VITE_API_BASE_URL')
    expect(backendGuide).toContain('X-Access-Token')
    expect(backendGuide).toContain('code: 20000')
    expect(backendGuide).toContain('runtime-config.js')

    expect(permissionGuide).toContain('meta.access')
    expect(permissionGuide).toContain('componentKey')
    expect(permissionGuide).toContain('v-allow')
    expect(permissionGuide).toContain('PermissionButton')
  })
})
