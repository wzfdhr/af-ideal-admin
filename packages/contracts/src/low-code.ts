import { record, onlyKeys, text, positiveInteger, invalid } from './schemas'
import type { JsonObject } from './schemas'

export const LOW_CODE_PERMISSIONS = {
  list: 'low-code:page:list',
  create: 'low-code:page:create',
  update: 'low-code:page:update',
  publish: 'low-code:page:publish',
  rollback: 'low-code:page:rollback',
  archive: 'low-code:page:archive',
  run: 'low-code:page:run',
  sourceList: 'low-code:source:list',
  sourceCreate: 'low-code:source:create',
  sourceUpdate: 'low-code:source:update',
} as const
export interface LowCodeSourceInput {
  code: string
  name: string
  kind: 'application-records' | 'registered-dictionary'
  resourceId: string
  status: 'enabled' | 'disabled'
  expectedRevision?: number
}
export interface LowCodeSource extends LowCodeSourceInput {
  id: string
  revision: number
  updatedAt: string
}
export type LowCodeMaterialKind =
  | 'ProTable'
  | 'ProForm'
  | 'StatCard'
  | 'ChartCard'
export interface LowCodeMaterialV2 {
  id: string
  type: LowCodeMaterialKind
  name: string
  sourceId: string
  span: 6 | 12 | 24
  display: 'inline' | 'modal'
  permissionCode?: string
  columns?: string[]
  metric?: 'status-distribution' | 'created-day'
}
export interface LowCodeActionV2 {
  id: string
  label: string
  type: 'query' | 'submit' | 'navigate' | 'openModal' | 'refreshBlock'
  targetId: string
  originId?: string
  placement: 'toolbar' | 'row' | 'form'
  permissionCode?: string
  operation?: 'create' | 'save' | 'start'
  mode?: 'create' | 'edit'
  route?: 'business-record-detail'
}
export interface LowCodePageV2 {
  version: 2
  title: string
  permissionCode?: string
  sources: string[]
  materials: LowCodeMaterialV2[]
  actions: LowCodeActionV2[]
}
const code = (value: unknown, field: string) => {
  const valueText = text(value, field, 100)
  if (!/^[a-zA-Z][a-zA-Z0-9:_-]*$/.test(valueText))
    invalid(field, '标识必须使用受控字符')
  return valueText
}
const optionalPermission = (value: unknown) =>
  value === undefined ? {} : { permissionCode: code(value, 'permissionCode') }
export const parseLowCodeSource = (
  input: unknown,
  update = false
): LowCodeSourceInput => {
  const body = record(input)
  onlyKeys(body, [
    'code',
    'name',
    'kind',
    'resourceId',
    'status',
    ...(update ? ['expectedRevision'] : []),
  ])
  if (
    !['application-records', 'registered-dictionary'].includes(
      String(body.kind)
    )
  )
    invalid('kind', '来源类型未登记')
  if (!['enabled', 'disabled'].includes(String(body.status)))
    invalid('status', '来源状态无效')
  return {
    code: code(body.code, 'code'),
    name: text(body.name, 'name', 100),
    kind: body.kind as LowCodeSourceInput['kind'],
    resourceId: text(body.resourceId, 'resourceId', 100),
    status: body.status as LowCodeSourceInput['status'],
    ...(update
      ? { expectedRevision: positiveInteger(body.expectedRevision) }
      : {}),
  }
}
export const parseLowCodePage = (input: unknown): LowCodePageV2 => {
  const body = record(input)
  onlyKeys(body, [
    'version',
    'title',
    'permissionCode',
    'sources',
    'materials',
    'actions',
  ])
  if (body.version !== 2) invalid('version', '真实低代码页面仅支持明确v2格式')
  if (JSON.stringify(body).length > 262144)
    invalid('schema', '页面配置不能超过256KiB')
  if (
    !Array.isArray(body.sources) ||
    !body.sources.length ||
    body.sources.length > 10
  )
    invalid('sources', '来源必须为1至10个明确引用')
  const sources = (body.sources as unknown[]).map((value) =>
    text(value, 'sourceId', 100)
  )
  if (new Set(sources).size !== sources.length)
    invalid('sources', '来源标识重复')
  if (
    !Array.isArray(body.materials) ||
    !body.materials.length ||
    body.materials.length > 30
  )
    invalid('materials', '物料必须为1至30个明确配置')
  const materials = (body.materials as unknown[]).map(
    (raw): LowCodeMaterialV2 => {
      const material = record(raw)
      onlyKeys(material, [
        'id',
        'type',
        'name',
        'sourceId',
        'span',
        'display',
        'permissionCode',
        'columns',
        'metric',
      ])
      if (
        !['ProTable', 'ProForm', 'StatCard', 'ChartCard'].includes(
          String(material.type)
        )
      )
        invalid('type', '物料类型未登记')
      if (
        ![6, 12, 24].includes(Number(material.span)) ||
        typeof material.span !== 'number'
      )
        invalid('span', '布局宽度只能为6、12或24')
      if (
        !['inline', 'modal'].includes(String(material.display)) ||
        (material.display === 'modal' && material.type !== 'ProForm')
      )
        invalid('display', '只有表单可以作为弹窗物料')
      const sourceId = text(material.sourceId, 'sourceId', 100)
      if (!sources.includes(sourceId))
        invalid('sourceId', '物料引用了页面外来源')
      const value: LowCodeMaterialV2 = {
        id: code(material.id, 'material.id'),
        type: material.type as LowCodeMaterialKind,
        name: text(material.name, 'name', 100),
        sourceId,
        span: material.span as LowCodeMaterialV2['span'],
        display: material.display as LowCodeMaterialV2['display'],
        ...optionalPermission(material.permissionCode),
      }
      if (material.columns !== undefined) {
        if (
          material.type !== 'ProTable' ||
          !Array.isArray(material.columns) ||
          !material.columns.length ||
          material.columns.length > 30
        )
          invalid('columns', '只有表格可以配置有限列')
        value.columns = (material.columns as unknown[]).map((column) =>
          text(column, 'column', 100)
        )
        if (new Set(value.columns).size !== value.columns.length)
          invalid('columns', '列标识重复')
      }
      if (material.metric !== undefined) {
        if (
          material.type !== 'ChartCard' ||
          !['status-distribution', 'created-day'].includes(
            String(material.metric)
          )
        )
          invalid('metric', '图表指标未登记')
        value.metric = material.metric as LowCodeMaterialV2['metric']
      }
      if (material.type === 'ChartCard' && !value.metric)
        invalid('metric', '图表必须绑定明确统计口径')
      return value
    }
  )
  if (
    new Set(materials.map((material) => material.id)).size !== materials.length
  )
    invalid('materials', '物料标识重复')
  if (!Array.isArray(body.actions) || body.actions.length > 80)
    invalid('actions', '动作必须是有限数组')
  const actions = (body.actions as unknown[]).map((raw): LowCodeActionV2 => {
    const action = record(raw)
    onlyKeys(action, [
      'id',
      'label',
      'type',
      'targetId',
      'originId',
      'placement',
      'permissionCode',
      'operation',
      'mode',
      'route',
    ])
    if (
      !['query', 'submit', 'navigate', 'openModal', 'refreshBlock'].includes(
        String(action.type)
      )
    )
      invalid('type', '动作类型未登记')
    if (!['toolbar', 'row', 'form'].includes(String(action.placement)))
      invalid('placement', '动作位置无效')
    const targetId = code(action.targetId, 'targetId')
    const target = materials.find((material) => material.id === targetId)
    if (!target) return invalid('targetId', '动作目标不在当前页面')
    const originId =
      action.originId === undefined
        ? undefined
        : code(action.originId, 'originId')
    const origin = materials.find((material) => material.id === originId)
    if (originId && !origin) invalid('originId', '动作来源物料不存在')
    if (
      action.placement === 'row' &&
      (!origin ||
        origin.type !== 'ProTable' ||
        origin.sourceId !== target.sourceId)
    )
      invalid('originId', '行操作必须来自同一来源表格')
    if (
      ['query', 'refreshBlock'].includes(String(action.type)) &&
      !['ProTable', 'StatCard', 'ChartCard'].includes(target.type)
    )
      invalid('targetId', '查询与刷新必须指向数据物料')
    if (
      ['submit', 'openModal'].includes(String(action.type)) &&
      target.type !== 'ProForm'
    )
      invalid('targetId', '提交和弹窗必须指向表单物料')
    if (
      action.type === 'openModal' &&
      (target.display !== 'modal' ||
        !['create', 'edit'].includes(String(action.mode)))
    )
      invalid('mode', '弹窗必须明确创建或编辑模式')
    if (
      action.type === 'submit' &&
      (!['create', 'save', 'start'].includes(String(action.operation)) ||
        action.placement !== 'form')
    )
      invalid('operation', '提交只允许登记的业务命令')
    if (
      action.type === 'navigate' &&
      (action.route !== 'business-record-detail' || action.placement !== 'row')
    )
      invalid('route', '跳转只允许受控业务详情')
    if (action.operation !== undefined && action.type !== 'submit')
      invalid('operation', '当前动作不接受业务命令')
    if (action.mode !== undefined && action.type !== 'openModal')
      invalid('mode', '当前动作不接受弹窗模式')
    if (action.route !== undefined && action.type !== 'navigate')
      invalid('route', '当前动作不接受路由')
    return {
      id: code(action.id, 'action.id'),
      label: text(action.label, 'label', 100),
      type: action.type as LowCodeActionV2['type'],
      targetId,
      ...(originId ? { originId } : {}),
      placement: action.placement as LowCodeActionV2['placement'],
      ...optionalPermission(action.permissionCode),
      ...(action.type === 'submit'
        ? { operation: action.operation as LowCodeActionV2['operation'] }
        : {}),
      ...(action.type === 'openModal'
        ? { mode: action.mode as LowCodeActionV2['mode'] }
        : {}),
      ...(action.type === 'navigate'
        ? { route: 'business-record-detail' as const }
        : {}),
    }
  })
  if (new Set(actions.map((action) => action.id)).size !== actions.length)
    invalid('actions', '动作标识重复')
  return {
    version: 2,
    title: text(body.title, 'title', 100),
    ...optionalPermission(body.permissionCode),
    sources,
    materials,
    actions,
  }
}
export const createBusinessLowCodePage = (
  sourceId: string,
  title = '业务管理页'
): LowCodePageV2 =>
  parseLowCodePage({
    version: 2,
    title,
    sources: [sourceId],
    materials: [
      {
        id: 'records',
        type: 'ProTable',
        name: '业务记录',
        sourceId,
        span: 24,
        display: 'inline',
      },
      {
        id: 'editor',
        type: 'ProForm',
        name: '业务表单',
        sourceId,
        span: 24,
        display: 'modal',
      },
      {
        id: 'total',
        type: 'StatCard',
        name: '授权记录总数',
        sourceId,
        span: 6,
        display: 'inline',
      },
      {
        id: 'distribution',
        type: 'ChartCard',
        name: '业务状态分布',
        sourceId,
        span: 12,
        display: 'inline',
        metric: 'status-distribution',
      },
    ],
    actions: [
      {
        id: 'query',
        label: '查询记录',
        type: 'query',
        targetId: 'records',
        placement: 'toolbar',
      },
      {
        id: 'refresh',
        label: '刷新记录',
        type: 'refreshBlock',
        targetId: 'records',
        placement: 'toolbar',
      },
      {
        id: 'refresh-total',
        label: '刷新统计',
        type: 'refreshBlock',
        targetId: 'total',
        placement: 'toolbar',
      },
      {
        id: 'refresh-chart',
        label: '刷新图表',
        type: 'refreshBlock',
        targetId: 'distribution',
        placement: 'toolbar',
      },
      {
        id: 'new',
        label: '新建业务申请',
        type: 'openModal',
        targetId: 'editor',
        placement: 'toolbar',
        mode: 'create',
      },
      {
        id: 'edit',
        label: '编辑草稿',
        type: 'openModal',
        targetId: 'editor',
        originId: 'records',
        placement: 'row',
        mode: 'edit',
      },
      {
        id: 'detail',
        label: '查看详情',
        type: 'navigate',
        targetId: 'records',
        originId: 'records',
        placement: 'row',
        route: 'business-record-detail',
      },
      {
        id: 'create',
        label: '保存草稿',
        type: 'submit',
        targetId: 'editor',
        placement: 'form',
        operation: 'create',
      },
      {
        id: 'save',
        label: '保存修改',
        type: 'submit',
        targetId: 'editor',
        placement: 'form',
        operation: 'save',
      },
      {
        id: 'start',
        label: '提交审批',
        type: 'submit',
        targetId: 'editor',
        placement: 'form',
        operation: 'start',
      },
    ],
  })
export const parseLowCodeRuntimeInput = (input: unknown) => {
  const body = record(input)
  onlyKeys(body, [
    'releaseId',
    'params',
    'fields',
    'recordId',
    'expectedRevision',
  ])
  const params = record(body.params || {})
  onlyKeys(params, ['current', 'pageSize', 'keyword', 'status'])
  const current =
    params.current === undefined ? 1 : positiveInteger(params.current)
  const pageSize =
    params.pageSize === undefined ? 20 : positiveInteger(params.pageSize)
  if (current > 1000000 || pageSize > 100) invalid('pagination', '分页超出范围')
  const keyword =
    params.keyword === undefined || params.keyword === ''
      ? ''
      : text(params.keyword, 'keyword', 100)
  const status =
    params.status === undefined || params.status === ''
      ? ''
      : text(params.status, 'status', 20)
  if (
    status &&
    !['draft', 'running', 'approved', 'rejected', 'withdrawn'].includes(status)
  )
    invalid('status', '业务状态无效')
  return {
    releaseId: text(body.releaseId, 'releaseId', 100),
    params: { current, pageSize, keyword, status },
    ...(body.fields === undefined
      ? {}
      : { fields: record(body.fields, 'fields') as JsonObject }),
    ...(body.recordId === undefined
      ? {}
      : { recordId: text(body.recordId, 'recordId', 100) }),
    ...(body.expectedRevision === undefined
      ? {}
      : { expectedRevision: positiveInteger(body.expectedRevision) }),
  }
}
export const parseLowCodeRollout = (input: unknown) => {
  const body = record(input)
  onlyKeys(body, [
    'expectedRevision',
    'releaseId',
    'rolloutReleaseId',
    'percent',
  ])
  if (
    typeof body.percent !== 'number' ||
    !Number.isInteger(body.percent) ||
    body.percent < 0 ||
    body.percent > 100
  )
    invalid('percent', '灰度比例必须为0至100的整数')
  const releaseId = text(body.releaseId, 'releaseId', 100)
  const rolloutReleaseId =
    body.rolloutReleaseId === null
      ? null
      : text(body.rolloutReleaseId, 'rolloutReleaseId', 100)
  if (!rolloutReleaseId && body.percent !== 0)
    invalid('rolloutReleaseId', '没有灰度版时比例必须为0')
  if (releaseId === rolloutReleaseId)
    invalid('rolloutReleaseId', '活动版与灰度版必须不同')
  return {
    expectedRevision: positiveInteger(body.expectedRevision),
    releaseId,
    rolloutReleaseId,
    percent: body.percent as number,
  }
}
