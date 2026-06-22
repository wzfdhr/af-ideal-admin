import { describe, expect, it } from 'vitest'
import {
  applyImportedFormSchema,
  exportFormSchema,
  importFormSchema,
  migrateFormSchema,
} from '@/components/form-designer/schema'

describe('form schema import and export', () => {
  it('exports schemas that can be imported back without changing semantics', () => {
    const schema = migrateFormSchema({
      formConfig: {
        layout: 'horizontal',
      },
      dataSources: [
        {
          key: 'users',
          name: '用户列表',
          url: '/api/form-options/users',
          timeout: 2500,
        },
      ],
      widgetsConfig: [
        {
          type: 'input',
          uid: 'customerName',
          name: '客户名称',
          config: {
            label: '客户名称',
            defaultValue: 'Alice',
          },
        },
      ],
    })

    const exported = exportFormSchema(schema)

    expect(JSON.parse(exported)).toEqual(schema)
    expect(importFormSchema(exported)).toEqual(schema)
  })

  it('does not mutate the current schema when importing invalid JSON', () => {
    const ast = {
      value: migrateFormSchema({
        widgetsConfig: [
          {
            type: 'input',
            uid: 'stable',
            name: '稳定字段',
            config: {
              label: '稳定字段',
            },
          },
        ],
      }),
    }
    const before = JSON.stringify(ast.value)

    expect(() => applyImportedFormSchema(ast, '{bad json')).toThrow(
      '表单 schema JSON 格式错误'
    )
    expect(ast.value).toEqual(JSON.parse(before))
  })
})
