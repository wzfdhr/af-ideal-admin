import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

type MenuNode = typeof mockMenus.admin[number]

const flattenMenus = (menus: MenuNode[]): MenuNode[] =>
  menus.flatMap((menu) => [
    menu,
    ...flattenMenus((menu.children || []) as MenuNode[]),
  ])

const findMenu = (menus: MenuNode[], name: string) =>
  flattenMenus(menus).find((menu) => menu.name === name)

const permissionPageCases = [
  {
    file: 'src/views/permissions/page/index.vue',
    testId: 'front-page-permission',
    blockedTexts: ['页面测试'],
    requiredTexts: ['页面权限', '角色要求', '可访问页面', '受限页面'],
  },
  {
    file: 'src/views/permissions/button/index.vue',
    testId: 'front-button-permission',
    blockedTexts: ['按钮测试'],
    requiredTexts: ['按钮权限', 'v-allow', 'PermissionButton', '禁用态'],
  },
  {
    file: 'src/views/permissions/testing/index.vue',
    testId: 'permission-testing-page',
    blockedTexts: ['权限测试页A'],
    requiredTexts: ['权限测试矩阵', 'admin', 'auditor', 'guest'],
  },
  {
    file: 'src/views/backendPermissions/page/index.vue',
    testId: 'backend-page-permission',
    blockedTexts: ['页面测试'],
    requiredTexts: ['后端页面权限', '服务端菜单', 'componentKey', '路由白名单'],
  },
  {
    file: 'src/views/backendPermissions/button/index.vue',
    testId: 'backend-button-permission',
    blockedTexts: ['按钮测试'],
    requiredTexts: ['后端按钮权限', 'permissionCode', '资源码', '审计记录'],
  },
]

describe('platform experience pages', () => {
  it('replaces permission placeholders with enterprise permission demos', () => {
    permissionPageCases.forEach(
      ({ blockedTexts, file, requiredTexts, testId }) => {
        const source = readFile(file)

        expect(source).toContain(`data-testid="${testId}"`)
        blockedTexts.forEach((text) => {
          expect(source).not.toContain(text)
        })
        requiredTexts.forEach((text) => {
          expect(source).toContain(text)
        })
      }
    )
  })

  it('renders system information as a product delivery dashboard', () => {
    const source = readFile('src/views/audit/temp/temp.vue')

    ;[
      'data-testid="system-info-page"',
      'AF-Ideal-Admin',
      'M5：产品化与可销售交付阶段',
      'Mock-first',
      'packageVersion',
      'docs/product/index.md',
      'docs/development/index.md',
      'docs/deployment.md',
      '生产环境依赖',
      '开发环境依赖',
    ].forEach((text) => {
      expect(source).toContain(text)
    })
    expect(source).not.toContain("value: '0.0.0.1'")
  })

  it('keeps route locale keys fully aligned between Chinese and English', () => {
    const zh = zhCN as Record<string, string>
    const en = enUS as Record<string, string>

    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    expect(en['menu.permissions.front.page']).toBe('Page permissions')
    expect(en['menu.permissions.backend.button']).toBe(
      'Backend button permissions'
    )
    expect(en['menu.permissions.front.testing']).toBe('Permission testing')
    expect(en['menu.Scalability']).toBe('Scalability')
    expect(en['menu.about']).toBe('System information')
    ;[
      'menu.permissions.page',
      'menu.permissions.button',
      'menu.permissions.testing',
      'menu.formDesign',
    ].forEach((legacyKey) => {
      expect(en[legacyKey]).toBeUndefined()
    })
  })

  it('seeds complete Mock server menus for permission demos', () => {
    ;[
      {
        role: 'user',
        menu: mockMenus.user,
        expected: [
          {
            name: 'page',
            locale: 'menu.permissions.front.page',
            permission: 'permission:page:view',
          },
          {
            name: 'button',
            locale: 'menu.permissions.front.button',
            permission: 'permission:button:view',
          },
          {
            name: 'testing',
            locale: 'menu.permissions.front.testing',
            permission: 'permission:testing:view',
          },
        ],
      },
      {
        role: 'admin',
        menu: mockMenus.admin,
        expected: [
          {
            name: 'backendPage',
            locale: 'menu.permissions.backend.page',
            permission: 'permission:backend-page:view',
          },
          {
            name: 'backendButton',
            locale: 'menu.permissions.backend.button',
            permission: 'permission:backend-button:view',
          },
        ],
      },
    ].forEach(({ expected, menu, role }) => {
      expected.forEach(({ locale, name, permission }) => {
        const node = findMenu(menu, name)

        expect(node, `${role}:${name}`).toBeTruthy()
        expect(node?.meta?.locale).toBe(locale)
        expect(node?.meta?.access?.permissions).toContain(permission)
      })
    })
  })
})
