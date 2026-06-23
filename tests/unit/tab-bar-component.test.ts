import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('route tab bar component', () => {
  it('renders route tabs instead of shipping an empty placeholder', () => {
    const tabBar = readFile('src/components/tab-bar/index.vue')

    expect(tabBar).not.toContain('TODO')
    expect(tabBar).not.toContain('Planned for the next minor version')
    ;[
      'data-testid="route-tab-bar"',
      'matchedTabs',
      'router-link',
      '页面标签',
    ].forEach((requiredText) => {
      expect(tabBar).toContain(requiredText)
    })
  })
})
