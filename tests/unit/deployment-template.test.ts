import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('deployment templates', () => {
  it('ships a runtime config script loaded before the app bundle', () => {
    const indexHtml = readFile('index.html')
    const runtimeConfig = readFile('public/runtime-config.js')

    expect(indexHtml).toContain('/runtime-config.js')
    expect(indexHtml.indexOf('/runtime-config.js')).toBeLessThan(
      indexHtml.indexOf('/src/main.ts')
    )
    expect(runtimeConfig).toContain('window.AF_IDEAL_ADMIN_CONFIG')
    expect(runtimeConfig).toContain('API_BASE_URL')
    expect(runtimeConfig).toContain('APP_TITLE')
  })

  it('ships an nginx template for history fallback and api gateway proxy', () => {
    const nginxConfig = readFile('deploy/nginx/default.conf')

    expect(nginxConfig).toContain('try_files $uri $uri/ /index.html')
    expect(nginxConfig).toContain('location /api/')
    expect(nginxConfig).toContain('proxy_pass')
    expect(nginxConfig).toContain('location = /runtime-config.js')
    expect(nginxConfig).toContain('no-store')
  })

  it('ships a container template for static hosting', () => {
    const dockerfile = readFile('Dockerfile')
    const dockerIgnore = readFile('.dockerignore')

    expect(dockerfile).toContain('npm run build:prd')
    expect(dockerfile).toContain('/usr/share/nginx/html')
    expect(dockerfile).toContain('deploy/nginx/default.conf')
    expect(dockerIgnore).toContain('node_modules')
    expect(dockerIgnore).toContain('dist')
  })
})
