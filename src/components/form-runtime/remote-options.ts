import axios from 'axios'
import type { DataSourceConfig } from '@/components/form-designer/schema'

export type RemoteOption = {
  label: string
  value: string | number
}

export type RemoteOptionRequestConfig = {
  url: string
  params: Record<string, unknown>
  timeout: number
}

export type RemoteOptionRequest = (
  config: RemoteOptionRequestConfig
) => Promise<unknown>

export type LoadRemoteOptionsParams = {
  dataSources: DataSourceConfig[]
  sourceUrl?: string
  sourceKey?: string
  formValues?: Record<string, unknown>
  request?: RemoteOptionRequest
}

const DEFAULT_TIMEOUT = 5000
const SAFE_DATA_SOURCE_PREFIXES = ['/api/', '/mock/']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isSafeDataSourceUrl = (url: string) =>
  SAFE_DATA_SOURCE_PREFIXES.some((prefix) => url.startsWith(prefix)) &&
  !url.startsWith('//') &&
  !/^[a-z][a-z\d+.-]*:/i.test(url)

const getValueByPath = (source: unknown, path: string) =>
  path.split('.').reduce<unknown>((value, key) => {
    if (!isRecord(value)) {
      return undefined
    }

    return value[key]
  }, source)

const findDataSource = ({
  dataSources,
  sourceKey,
  sourceUrl,
}: Pick<LoadRemoteOptionsParams, 'dataSources' | 'sourceKey' | 'sourceUrl'>) =>
  dataSources.find((source) =>
    sourceKey ? source.key === sourceKey : source.url === sourceUrl
  )

const mapParams = (
  params: DataSourceConfig['params'],
  formValues: Record<string, unknown>
) =>
  Object.entries(params || {}).reduce<Record<string, unknown>>(
    (mappedParams, [targetKey, sourceField]) => {
      if (Object.prototype.hasOwnProperty.call(formValues, sourceField)) {
        mappedParams[targetKey] = formValues[sourceField]
      }

      return mappedParams
    },
    {}
  )

const normalizeOptions = (
  response: unknown,
  adapter: DataSourceConfig['responseAdapter'] = {}
) => {
  const listPath = adapter.listPath || 'data'
  const labelField = adapter.labelField || 'label'
  const valueField = adapter.valueField || 'value'
  const list = Array.isArray(response)
    ? response
    : getValueByPath(response, listPath)

  if (!Array.isArray(list)) {
    throw new Error('远程选项响应格式错误')
  }

  return list.map((item) => {
    if (!isRecord(item)) {
      throw new Error('远程选项响应格式错误')
    }

    const label = item[labelField]
    const value = item[valueField]

    if (
      (typeof label !== 'string' && typeof label !== 'number') ||
      (typeof value !== 'string' && typeof value !== 'number')
    ) {
      throw new Error('远程选项响应格式错误')
    }

    return {
      label: String(label),
      value,
    }
  })
}

const isTimeoutError = (error: unknown) => {
  if (!isRecord(error)) {
    return false
  }

  return (
    error.code === 'ECONNABORTED' ||
    (typeof error.message === 'string' && error.message.includes('timeout'))
  )
}

const defaultRemoteOptionRequest: RemoteOptionRequest = ({
  url,
  params,
  timeout,
}) =>
  axios.get(url, {
    params,
    timeout,
  })

export const loadRemoteOptions = async ({
  dataSources,
  sourceKey,
  sourceUrl,
  formValues = {},
  request = defaultRemoteOptionRequest,
}: LoadRemoteOptionsParams): Promise<RemoteOption[]> => {
  const dataSource = findDataSource({ dataSources, sourceKey, sourceUrl })

  if (!dataSource || !isSafeDataSourceUrl(dataSource.url)) {
    throw new Error('未授权的远程数据源')
  }

  try {
    const response = await request({
      url: dataSource.url,
      params: mapParams(dataSource.params, formValues),
      timeout: dataSource.timeout || DEFAULT_TIMEOUT,
    })

    return normalizeOptions(response, dataSource.responseAdapter)
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error('远程选项加载超时')
    }

    throw error
  }
}

export default loadRemoteOptions
