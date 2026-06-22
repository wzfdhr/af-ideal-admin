import type { LowCodeMaterialType } from '../schema/types'

export interface LowCodeMaterialDefinition {
  type: LowCodeMaterialType
  label: string
  description: string
}

export const LOW_CODE_MATERIALS: LowCodeMaterialDefinition[] = [
  {
    type: 'ProTable',
    label: '查询表格',
    description: '支持查询、分页和 Mock 数据源绑定',
  },
  {
    type: 'ProForm',
    label: '查询表单',
    description: '用于生成查询条件和表单区域',
  },
  {
    type: 'ChartCard',
    label: '图表卡片',
    description: '用于图表和趋势展示',
  },
  {
    type: 'StatCard',
    label: '统计卡片',
    description: '用于指标摘要展示',
  },
]

export const getLowCodeMaterialTypes = () =>
  LOW_CODE_MATERIALS.map((material) => material.type)

export const isLowCodeMaterialType = (
  type: unknown
): type is LowCodeMaterialType =>
  typeof type === 'string' &&
  getLowCodeMaterialTypes().includes(type as LowCodeMaterialType)
