import { parseDataScreenTemplate } from '@af-admin/contracts'
import type {
  DataScreenTemplateKey,
  DataScreenThemePreset,
} from '@af-admin/contracts'

const template = (
  key: DataScreenTemplateKey,
  name: string,
  noun: string,
  preset: DataScreenThemePreset,
  brandColor: string
) =>
  parseDataScreenTemplate({
    version: 1,
    key,
    name,
    theme: { preset, brandColor },
    layout: [
      {
        widgetKey: 'count',
        kind: 'metric',
        title: `${noun}数量`,
        layout: { x: 24, y: 24, width: 456, height: 200, z: 0 },
      },
      {
        widgetKey: 'trend',
        kind: 'line',
        title: `${noun}每日趋势`,
        layout: { x: 504, y: 24, width: 1392, height: 456, z: 1 },
      },
      {
        widgetKey: 'status',
        kind: 'pie',
        title: '业务状态分布',
        layout: { x: 24, y: 248, width: 456, height: 400, z: 2 },
      },
      {
        widgetKey: 'ranking',
        kind: 'ranking',
        title: '业务状态数量排行',
        layout: { x: 24, y: 672, width: 456, height: 384, z: 3 },
      },
      {
        widgetKey: 'detail',
        kind: 'table',
        title: `${noun}授权明细`,
        layout: { x: 504, y: 504, width: 1392, height: 552, z: 4 },
      },
    ],
    bindingRecipe: [
      { widgetKey: 'count', sourceSlot: 'trend', view: 'count' },
      { widgetKey: 'trend', sourceSlot: 'trend', view: 'trend' },
      { widgetKey: 'status', sourceSlot: 'distribution', view: 'distribution' },
      {
        widgetKey: 'ranking',
        sourceSlot: 'distribution',
        view: 'distribution',
      },
      {
        widgetKey: 'detail',
        sourceSlot: 'detail',
        view: 'detail',
        columnSlots: ['recordId', 'status', 'createdAt'],
      },
    ],
  })

// eslint-disable-next-line import/prefer-default-export
export const dataScreenTemplates = [
  template('operations', '运营业务流转', '业务记录', 'dark', '#165DFF'),
  template('sales', '销售订单', '销售订单', 'enterprise', '#722ED1'),
  template('equipment', '设备领用', '设备领用单', 'ocean', '#00B5AD'),
]
