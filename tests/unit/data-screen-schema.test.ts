import { describe, expect, it } from 'vitest'
import {
  createEnterpriseDataScreenSchema,
  migrateDataScreenSchema,
  validateDataScreenSchema,
  type DataScreenSchema,
} from '@/components/data-screen/schema'

describe('data screen schema', () => {
  it('creates a 1920x1080 enterprise data screen with all MVP widgets', () => {
    const schema = createEnterpriseDataScreenSchema()

    expect(validateDataScreenSchema(schema)).toEqual(schema)
    expect(schema.width).toBe(1920)
    expect(schema.height).toBe(1080)
    expect(schema.theme).toEqual({
      mode: 'dark',
      brandColor: '#00D5FF',
    })
    expect(schema.permissionCode).toBe('data-screen:ops:view')
    expect(schema.widgets.map((widget) => widget.type)).toEqual([
      'MetricCard',
      'LineChart',
      'BarChart',
      'PieChart',
      'RankingList',
      'ScrollTable',
    ])
    expect(schema.widgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dataSourceKey: 'realtime',
          permissionCode: 'data-screen:ops:metrics',
        }),
      ])
    )
  })

  it('migrates legacy schema with default dark theme and current version', () => {
    const migrated = migrateDataScreenSchema({
      title: '运营大屏',
      widgets: [],
      dataSources: [],
    })

    expect(migrated.version).toBe(1)
    expect(migrated.width).toBe(1920)
    expect(migrated.height).toBe(1080)
    expect(migrated.theme.mode).toBe('dark')
  })

  it('rejects invalid size, unknown widgets and missing data source bindings', () => {
    const schema: DataScreenSchema = createEnterpriseDataScreenSchema()

    expect(() =>
      validateDataScreenSchema({
        ...schema,
        width: 1366,
      })
    ).toThrow('非法大屏 schema')

    expect(() =>
      validateDataScreenSchema({
        ...schema,
        widgets: [
          {
            id: 'bad',
            type: 'Unknown',
            name: '未知物料',
            x: 0,
            y: 0,
            w: 100,
            h: 100,
            props: {},
          },
        ],
      })
    ).toThrow('非法大屏 schema')

    expect(() =>
      validateDataScreenSchema({
        ...schema,
        widgets: schema.widgets.map((widget) =>
          widget.id === 'trend-line'
            ? {
                ...widget,
                dataSourceKey: 'missing',
              }
            : widget
        ),
      })
    ).toThrow('非法大屏 schema')
  })

  it('rejects invalid realtime refresh intervals', () => {
    const schema = createEnterpriseDataScreenSchema()

    expect(() =>
      validateDataScreenSchema({
        ...schema,
        dataSources: [
          {
            key: 'realtime',
            name: '实时数据',
            url: '/api/data-screens/realtime',
            refreshInterval: 0,
          },
        ],
      })
    ).toThrow('非法大屏 schema')
  })
})
