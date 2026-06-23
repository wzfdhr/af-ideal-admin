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

  it('keeps vite proxy serve-only and uses the deployed base path', () => {
    const viteConfig = readFile('vite.config.ts')

    expect(viteConfig).toContain("base: env.VITE_BASE_URL || '/'")
    expect(viteConfig).toContain("command === 'serve'")
    expect(viteConfig).toContain('server: isServe')
    expect(viteConfig).toContain('[apiBaseUrl]')
  })

  it('ships a runtime-configurable nginx template for container api upstreams', () => {
    const nginxTemplate = readFile('deploy/nginx/default.conf.template')
    const dockerfile = readFile('Dockerfile')

    expect(nginxTemplate).toMatch(/\$\{API_PROXY_PASS\}/)
    expect(nginxTemplate).toContain('try_files $uri $uri/ /index.html')
    expect(nginxTemplate).toContain('location = /runtime-config.js')
    expect(dockerfile).toContain('API_PROXY_PASS=http://backend:8080')
    expect(dockerfile).toContain('/etc/nginx/templates/default.conf.template')
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

  it('documents an executable deployment runbook for new contributors', () => {
    const deploymentDoc = readFile('docs/deployment.md')

    ;[
      'VITE_BASE_URL',
      'VITE_API_BASE_URL',
      'API_PROXY_PASS',
      'docker run --rm -p 8080:80 -e API_PROXY_PASS=',
      'nginx -t',
      'curl -I http://127.0.0.1:8080/visualization/reportCenter',
      'curl -I http://127.0.0.1:8080/runtime-config.js',
      'Vite proxy is only enabled for local `vite serve`',
    ].forEach((keyword) => {
      expect(deploymentDoc).toContain(keyword)
    })
  })
})
