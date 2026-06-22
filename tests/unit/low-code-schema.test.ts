import { describe, expect, it } from 'vitest'
import {
  CURRENT_LOW_CODE_PAGE_SCHEMA_VERSION,
  createQueryTablePageSchema,
  migrateLowCodePageSchema,
  validateLowCodePageSchema,
  type LowCodeAction,
  type LowCodePageSchema,
} from '@/components/low-code/schema'
import { getLowCodeMaterialTypes } from '@/components/low-code/materials'

describe('low-code page schema', () => {
  it('migrates legacy page schema to the current version', () => {
    const migrated = migrateLowCodePageSchema({
      title: '客户查询',
      dataSources: [
        {
          key: 'customers',
          name: '客户数据',
          url: '/api/low-code/data-source/preview',
        },
      ],
      materials: [
        {
          id: 'query',
          type: 'ProForm',
          name: '查询表单',
          props: {
            fields: ['keyword', 'status'],
          },
        },
        {
          id: 'table',
          type: 'ProTable',
          name: '客户列表',
          props: {
            dataSourceKey: 'customers',
            columns: ['name', 'status'],
          },
        },
      ],
    })

    expect(migrated.version).toBe(CURRENT_LOW_CODE_PAGE_SCHEMA_VERSION)
    expect(migrated.title).toBe('客户查询')
    expect(migrated.materials.map((material) => material.type)).toEqual([
      'ProForm',
      'ProTable',
    ])
  })

  it('registers enterprise low-code materials', () => {
    expect(getLowCodeMaterialTypes()).toEqual([
      'ProTable',
      'ProForm',
      'ChartCard',
      'StatCard',
    ])
  })

  it('accepts a Mock-backed query table page schema', () => {
    const schema = createQueryTablePageSchema()

    expect(validateLowCodePageSchema(schema)).toEqual(schema)
    expect(schema.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'ProTable',
          props: expect.objectContaining({
            dataSourceKey: 'customers',
          }),
        }),
      ])
    )
  })

  it('builds a permission-aware query table page with button actions', () => {
    const schema = createQueryTablePageSchema()
    const queryForm = schema.materials.find(
      (material) => material.id === 'query-form'
    )
    const customerTable = schema.materials.find(
      (material) => material.id === 'customer-table'
    )

    expect(schema.permissionCode).toBe('low-code:customer-query:view')
    expect(queryForm?.permissionCode).toBe('low-code:customer-query:query')
    expect(customerTable?.permissionCode).toBe('low-code:customer-query:list')
    expect(queryForm?.props.actions).toEqual(
      expect.arrayContaining<LowCodeAction>([
        expect.objectContaining({
          type: 'query',
          target: 'customer-table',
          permissionCode: 'low-code:customer-query:query',
        }),
        expect.objectContaining({
          type: 'submit',
          permissionCode: 'low-code:customer-query:submit',
        }),
      ])
    )
    expect(customerTable?.props.actions).toEqual(
      expect.arrayContaining<LowCodeAction>([
        expect.objectContaining({
          type: 'refreshBlock',
          target: 'customer-table',
        }),
        expect.objectContaining({
          type: 'openModal',
        }),
        expect.objectContaining({
          type: 'navigate',
        }),
      ])
    )
  })

  it('rejects unknown materials and table data sources that do not exist', () => {
    expect(() =>
      validateLowCodePageSchema({
        title: '非法页面',
        dataSources: [],
        materials: [
          {
            id: 'unknown',
            type: 'Unknown',
            name: '未知物料',
            props: {},
          },
        ],
      })
    ).toThrow('非法低代码页面 schema')

    const schema: LowCodePageSchema = createQueryTablePageSchema()
    expect(() =>
      validateLowCodePageSchema({
        ...schema,
        materials: schema.materials.map((material) =>
          material.type === 'ProTable'
            ? {
                ...material,
                props: {
                  ...material.props,
                  dataSourceKey: 'missing',
                },
              }
            : material
        ),
      })
    ).toThrow('非法低代码页面 schema')
  })

  it('rejects unsupported button action types', () => {
    const schema: LowCodePageSchema = createQueryTablePageSchema()

    expect(() =>
      validateLowCodePageSchema({
        ...schema,
        materials: schema.materials.map((material) =>
          material.id === 'query-form'
            ? {
                ...material,
                props: {
                  ...material.props,
                  actions: [
                    {
                      id: 'custom-action',
                      label: '自定义',
                      type: 'custom',
                    },
                  ],
                },
              }
            : material
        ),
      })
    ).toThrow('非法低代码页面 schema')
  })
})
