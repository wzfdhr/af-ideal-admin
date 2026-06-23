import { describe, expect, it } from 'vitest'
import {
  CURRENT_FORM_SCHEMA_VERSION,
  migrateFormSchema,
} from '@/components/form-designer/schema'

describe('form schema migration', () => {
  it('migrates legacy schemas to the current version', () => {
    const migrated = migrateFormSchema({
      config: {
        layout: 'horizontal',
      },
      widgetsConfig: [
        {
          type: 'input',
          uid: 'customerName',
          name: '客户名称',
        },
      ],
    })

    expect(migrated.version).toBe(CURRENT_FORM_SCHEMA_VERSION)
    expect(migrated.formConfig).toEqual({
      size: 'medium',
      layout: 'horizontal',
      labelAlign: 'right',
    })
    expect(migrated.dataSources).toEqual([])
    expect(migrated.widgetsConfig[0]).toMatchObject({
      type: 'input',
      uid: 'customerName',
      name: '客户名称',
      config: {
        label: '客户名称',
      },
    })
  })

  it('keeps current schemas stable', () => {
    const schema = {
      version: CURRENT_FORM_SCHEMA_VERSION,
      formConfig: {
        size: 'small',
        layout: 'vertical',
        labelAlign: 'left',
      },
      dataSources: [
        {
          key: 'users',
          name: '用户列表',
          url: '/mock/system/users',
        },
      ],
      widgetsConfig: [],
    } as const

    expect(migrateFormSchema(schema)).toEqual(schema)
  })

  it('rejects schemas from unsupported future versions', () => {
    expect(() =>
      migrateFormSchema({
        version: CURRENT_FORM_SCHEMA_VERSION + 1,
        widgetsConfig: [],
      })
    ).toThrow('不支持的表单 schema 版本')
  })

  it('rejects invalid schemas', () => {
    expect(() => migrateFormSchema(null)).toThrow('非法表单 schema')
    expect(() =>
      migrateFormSchema({
        widgetsConfig: 'bad',
      })
    ).toThrow('非法表单 schema')
    expect(() =>
      migrateFormSchema({
        dataSources: 'bad',
      })
    ).toThrow('非法表单 schema')
  })
})
