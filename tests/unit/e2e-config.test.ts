import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('e2e smoke configuration', () => {
  it('uses a local Vite preview command that does not depend on npm being in PATH', () => {
    const config = readFile('playwright.config.ts')

    expect(config).not.toContain('npm run preview')
    expect(config).toContain('node ./node_modules/vite/bin/vite.js preview')
    expect(config).toContain('--host 127.0.0.1')
    expect(config).toContain('--port 4173')
  })

  it('keeps auth smoke tests independent from backend audit endpoints', () => {
    const authSmoke = readFile('tests/e2e/auth-permission.spec.ts')

    expect(authSmoke).toContain('**/api/audit/events')
  })
})
