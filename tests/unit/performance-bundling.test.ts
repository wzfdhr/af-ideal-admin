import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('production bundling strategy', () => {
  it('keeps chart libraries out of the application entry', () => {
    const mainEntry = readFile('src/main.ts')
    const chartComponent = readFile('src/components/s-chart.vue')

    expect(mainEntry).not.toContain("import 'echarts'")
    expect(chartComponent).toContain("import 'echarts'")
  })

  it('defines stable vendor chunks for heavy enterprise dependencies', () => {
    const viteConfig = readFile('vite.config.ts')

    ;[
      'manualChunks',
      'vue-vendor',
      'arco-vendor',
      'chart-vendor',
      'x6-vendor',
      'utility-vendor',
    ].forEach((keyword) => {
      expect(viteConfig).toContain(keyword)
    })
  })
})
