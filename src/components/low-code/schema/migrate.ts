import { isLowCodeMaterialType } from '../materials'
import {
  CURRENT_LOW_CODE_PAGE_SCHEMA_VERSION,
  type LegacyLowCodeDataSource,
  type LegacyLowCodeMaterial,
  type LegacyLowCodePageSchema,
  type LowCodeDataSource,
  type LowCodeMaterial,
  type LowCodePageSchema,
} from './types'

const LOW_CODE_SCHEMA_ERROR = '非法低代码页面 schema'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeVersion = (version: unknown) =>
  typeof version === 'number' && Number.isInteger(version) && version > 0
    ? version
    : CURRENT_LOW_CODE_PAGE_SCHEMA_VERSION

const normalizeTitle = (title: unknown) =>
  typeof title === 'string' && title.length > 0 ? title : '未命名页面'

const normalizeDataSources = (dataSources: unknown): LowCodeDataSource[] => {
  if (dataSources === undefined) {
    return []
  }

  if (!Array.isArray(dataSources)) {
    throw new Error(LOW_CODE_SCHEMA_ERROR)
  }

  return dataSources.map((source, index) => {
    if (!isRecord(source)) {
      throw new Error(LOW_CODE_SCHEMA_ERROR)
    }

    const legacySource = source as LegacyLowCodeDataSource
    const key =
      typeof legacySource.key === 'string' && legacySource.key.length > 0
        ? legacySource.key
        : `source-${index + 1}`
    const name = typeof legacySource.name === 'string' ? legacySource.name : key
    const url = typeof legacySource.url === 'string' ? legacySource.url : ''
    const method = legacySource.method === 'post' ? 'post' : 'get'
    const normalized: LowCodeDataSource = {
      key,
      name,
      url,
      method,
    }

    if (isRecord(legacySource.responseAdapter)) {
      normalized.responseAdapter = {
        listPath:
          typeof legacySource.responseAdapter.listPath === 'string'
            ? legacySource.responseAdapter.listPath
            : undefined,
        totalPath:
          typeof legacySource.responseAdapter.totalPath === 'string'
            ? legacySource.responseAdapter.totalPath
            : undefined,
      }
    }

    return normalized
  })
}

const normalizeMaterials = (materials: unknown): LowCodeMaterial[] => {
  if (!Array.isArray(materials)) {
    throw new Error(LOW_CODE_SCHEMA_ERROR)
  }

  return materials.map((material, index) => {
    if (!isRecord(material) || !isLowCodeMaterialType(material.type)) {
      throw new Error(LOW_CODE_SCHEMA_ERROR)
    }

    const legacyMaterial = material as LegacyLowCodeMaterial
    const { type } = material
    const id =
      typeof legacyMaterial.id === 'string' && legacyMaterial.id.length > 0
        ? legacyMaterial.id
        : `${type}-${index + 1}`

    return {
      id,
      type,
      name:
        typeof legacyMaterial.name === 'string' ? legacyMaterial.name : type,
      props: isRecord(legacyMaterial.props) ? legacyMaterial.props : {},
    }
  })
}

export const migrateLowCodePageSchema = (
  schema: unknown
): LowCodePageSchema => {
  if (!isRecord(schema)) {
    throw new Error(LOW_CODE_SCHEMA_ERROR)
  }

  const legacySchema = schema as LegacyLowCodePageSchema

  return {
    version: normalizeVersion(legacySchema.version),
    title: normalizeTitle(legacySchema.title),
    dataSources: normalizeDataSources(legacySchema.dataSources),
    materials: normalizeMaterials(legacySchema.materials),
  }
}

export const validateLowCodePageSchema = (
  schema: unknown
): LowCodePageSchema => {
  const migrated = migrateLowCodePageSchema(schema)
  const materialIds = new Set<string>()
  const dataSourceKeys = new Set(
    migrated.dataSources.map((source) => source.key)
  )

  migrated.materials.forEach((material) => {
    if (materialIds.has(material.id)) {
      throw new Error(LOW_CODE_SCHEMA_ERROR)
    }
    materialIds.add(material.id)

    if (
      material.type === 'ProTable' &&
      typeof material.props.dataSourceKey === 'string' &&
      !dataSourceKeys.has(material.props.dataSourceKey)
    ) {
      throw new Error(LOW_CODE_SCHEMA_ERROR)
    }
  })

  return migrated
}

export const createQueryTablePageSchema = (): LowCodePageSchema =>
  validateLowCodePageSchema({
    title: '客户查询',
    dataSources: [
      {
        key: 'customers',
        name: '客户数据',
        url: '/api/low-code/data-source/preview',
        method: 'post',
        responseAdapter: {
          listPath: 'data.list',
          totalPath: 'data.total',
        },
      },
      {
        key: 'empty',
        name: '空数据',
        url: '/api/low-code/data-source/preview',
        method: 'post',
      },
      {
        key: 'failure',
        name: '失败数据',
        url: '/api/low-code/data-source/preview',
        method: 'post',
      },
    ],
    materials: [
      {
        id: 'query-form',
        type: 'ProForm',
        name: '查询条件',
        props: {
          fields: ['keyword', 'status'],
        },
      },
      {
        id: 'customer-table',
        type: 'ProTable',
        name: '客户列表',
        props: {
          dataSourceKey: 'customers',
          columns: ['name', 'status', 'owner'],
          rowKey: 'id',
        },
      },
      {
        id: 'customer-stat',
        type: 'StatCard',
        name: '客户总数',
        props: {
          label: '客户总数',
          value: 128,
        },
      },
      {
        id: 'customer-chart',
        type: 'ChartCard',
        name: '客户状态分布',
        props: {
          chartType: 'pie',
          dataSourceKey: 'customers',
        },
      },
    ],
  })

export default migrateLowCodePageSchema
