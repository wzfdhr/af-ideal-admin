import { isLowCodeMaterialType } from '../materials'
import {
  CURRENT_LOW_CODE_PAGE_SCHEMA_VERSION,
  type LowCodeAction,
  type LowCodeActionType,
  type LegacyLowCodeDataSource,
  type LegacyLowCodeMaterial,
  type LegacyLowCodePageSchema,
  type LowCodeDataSource,
  type LowCodeMaterial,
  type LowCodePageSchema,
} from './types'

const LOW_CODE_SCHEMA_ERROR = '非法低代码页面 schema'
const LOW_CODE_ACTION_TYPES: LowCodeActionType[] = [
  'query',
  'submit',
  'navigate',
  'openModal',
  'refreshBlock',
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeOptionalText = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

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

const normalizeAction = (action: unknown): LowCodeAction => {
  if (!isRecord(action)) {
    throw new Error(LOW_CODE_SCHEMA_ERROR)
  }

  const id = normalizeOptionalText(action.id)
  const label = normalizeOptionalText(action.label)
  const type = normalizeOptionalText(action.type)

  if (
    !id ||
    !label ||
    !type ||
    !LOW_CODE_ACTION_TYPES.includes(type as LowCodeActionType)
  ) {
    throw new Error(LOW_CODE_SCHEMA_ERROR)
  }

  if (action.params !== undefined && !isRecord(action.params)) {
    throw new Error(LOW_CODE_SCHEMA_ERROR)
  }

  return {
    id,
    label,
    type: type as LowCodeActionType,
    target: normalizeOptionalText(action.target),
    permissionCode: normalizeOptionalText(action.permissionCode),
    params: isRecord(action.params) ? { ...action.params } : undefined,
  }
}

const normalizeProps = (props: unknown): Record<string, unknown> => {
  const normalized = isRecord(props) ? { ...props } : {}

  if (normalized.actions !== undefined) {
    if (!Array.isArray(normalized.actions)) {
      throw new Error(LOW_CODE_SCHEMA_ERROR)
    }
    normalized.actions = normalized.actions.map(normalizeAction)
  }

  return normalized
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
      permissionCode: normalizeOptionalText(legacyMaterial.permissionCode),
      props: normalizeProps(legacyMaterial.props),
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
    permissionCode: normalizeOptionalText(legacySchema.permissionCode),
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
  })

  migrated.materials.forEach((material) => {
    if (
      material.type === 'ProTable' &&
      typeof material.props.dataSourceKey === 'string' &&
      !dataSourceKeys.has(material.props.dataSourceKey)
    ) {
      throw new Error(LOW_CODE_SCHEMA_ERROR)
    }

    const { actions } = material.props
    if (Array.isArray(actions)) {
      actions.forEach((action) => {
        const lowCodeAction = action as LowCodeAction
        if (
          (lowCodeAction.type === 'query' ||
            lowCodeAction.type === 'refreshBlock') &&
          lowCodeAction.target &&
          !materialIds.has(lowCodeAction.target)
        ) {
          throw new Error(LOW_CODE_SCHEMA_ERROR)
        }
      })
    }
  })

  return migrated
}

export const createQueryTablePageSchema = (): LowCodePageSchema =>
  validateLowCodePageSchema({
    title: '客户查询',
    permissionCode: 'low-code:customer-query:view',
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
        permissionCode: 'low-code:customer-query:query',
        props: {
          fields: ['keyword', 'status'],
          actions: [
            {
              id: 'query',
              label: '查询',
              type: 'query',
              target: 'customer-table',
              permissionCode: 'low-code:customer-query:query',
            },
            {
              id: 'submit',
              label: '提交',
              type: 'submit',
              permissionCode: 'low-code:customer-query:submit',
            },
          ],
        },
      },
      {
        id: 'customer-table',
        type: 'ProTable',
        name: '客户列表',
        permissionCode: 'low-code:customer-query:list',
        props: {
          dataSourceKey: 'customers',
          columns: ['name', 'status', 'owner'],
          rowKey: 'id',
          actions: [
            {
              id: 'refresh-table',
              label: '刷新区块',
              type: 'refreshBlock',
              target: 'customer-table',
              permissionCode: 'low-code:customer-query:refresh',
            },
            {
              id: 'open-detail',
              label: '打开弹窗',
              type: 'openModal',
              target: 'customer-detail',
              permissionCode: 'low-code:customer-query:detail',
            },
            {
              id: 'jump-detail',
              label: '跳转详情',
              type: 'navigate',
              target: '/customer/detail',
              permissionCode: 'low-code:customer-query:navigate',
            },
          ],
        },
      },
      {
        id: 'customer-stat',
        type: 'StatCard',
        name: '客户总数',
        permissionCode: 'low-code:customer-query:stat',
        props: {
          label: '客户总数',
          value: 128,
        },
      },
      {
        id: 'customer-chart',
        type: 'ChartCard',
        name: '客户状态分布',
        permissionCode: 'low-code:customer-query:chart',
        props: {
          chartType: 'pie',
          dataSourceKey: 'customers',
        },
      },
    ],
  })

export default migrateLowCodePageSchema
