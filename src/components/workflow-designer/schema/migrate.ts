import {
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  WORKFLOW_NODE_TYPES,
  type LegacyWorkflowEdge,
  type LegacyWorkflowNode,
  type LegacyWorkflowSchema,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowNodeConfig,
  type WorkflowNodeType,
  type WorkflowSchema,
} from './types'

const WORKFLOW_SCHEMA_ERROR = '非法流程 schema'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isWorkflowNodeType = (value: unknown): value is WorkflowNodeType =>
  typeof value === 'string' &&
  WORKFLOW_NODE_TYPES.includes(value as WorkflowNodeType)

const normalizeVersion = (version: unknown) =>
  typeof version === 'number' && Number.isInteger(version) && version > 0
    ? version
    : CURRENT_WORKFLOW_SCHEMA_VERSION

const normalizeStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return undefined
  }

  const strings = value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0
  )

  return strings.length > 0 ? strings : undefined
}

const normalizeNodeConfig = (config: unknown): WorkflowNodeConfig => {
  if (!isRecord(config)) {
    return {}
  }

  const normalized: WorkflowNodeConfig = { ...config }
  const approvers = normalizeStringArray(config.approvers)
  const ccUsers = normalizeStringArray(config.ccUsers)
  const parallelApprovers = normalizeStringArray(config.parallelApprovers)

  if (approvers) {
    normalized.approvers = approvers
  }

  if (ccUsers) {
    normalized.ccUsers = ccUsers
  }

  if (parallelApprovers) {
    normalized.parallelApprovers = parallelApprovers
  }

  if (typeof config.condition === 'string') {
    normalized.condition = config.condition
  }

  if (typeof config.formId === 'string') {
    normalized.formId = config.formId
  }

  return normalized
}

const normalizeNodes = (nodes: unknown): WorkflowNode[] => {
  if (!Array.isArray(nodes)) {
    throw new Error(WORKFLOW_SCHEMA_ERROR)
  }

  return nodes.map((node, index) => {
    if (!isRecord(node)) {
      throw new Error(WORKFLOW_SCHEMA_ERROR)
    }

    const legacyNode = node as LegacyWorkflowNode
    const type = isWorkflowNodeType(legacyNode.type)
      ? legacyNode.type
      : undefined

    if (!type) {
      throw new Error(WORKFLOW_SCHEMA_ERROR)
    }

    const id =
      typeof legacyNode.id === 'string' && legacyNode.id.length > 0
        ? legacyNode.id
        : `${type}-${index + 1}`
    let name: string = type

    if (typeof legacyNode.name === 'string') {
      name = legacyNode.name
    } else if (typeof legacyNode.label === 'string') {
      name = legacyNode.label
    }

    const normalized: WorkflowNode = {
      id,
      type,
      name,
      config: normalizeNodeConfig(legacyNode.config),
    }

    if (typeof legacyNode.x === 'number') {
      normalized.x = legacyNode.x
    }

    if (typeof legacyNode.y === 'number') {
      normalized.y = legacyNode.y
    }

    return normalized
  })
}

const normalizeEdges = (edges: unknown): WorkflowEdge[] => {
  if (!Array.isArray(edges)) {
    throw new Error(WORKFLOW_SCHEMA_ERROR)
  }

  return edges.map((edge, index) => {
    if (!isRecord(edge)) {
      throw new Error(WORKFLOW_SCHEMA_ERROR)
    }

    const legacyEdge = edge as LegacyWorkflowEdge

    if (
      typeof legacyEdge.source !== 'string' ||
      typeof legacyEdge.target !== 'string'
    ) {
      throw new Error(WORKFLOW_SCHEMA_ERROR)
    }

    const id =
      typeof legacyEdge.id === 'string' && legacyEdge.id.length > 0
        ? legacyEdge.id
        : `${legacyEdge.source}-${legacyEdge.target || index + 1}`

    return {
      id,
      source: legacyEdge.source,
      target: legacyEdge.target,
      label: typeof legacyEdge.label === 'string' ? legacyEdge.label : '',
    }
  })
}

export const migrateWorkflowSchema = (schema: unknown): WorkflowSchema => {
  if (!isRecord(schema)) {
    throw new Error(WORKFLOW_SCHEMA_ERROR)
  }

  const legacySchema = schema as LegacyWorkflowSchema

  return {
    version: normalizeVersion(legacySchema.version),
    nodes: normalizeNodes(legacySchema.nodes),
    edges: normalizeEdges(legacySchema.edges),
  }
}

export const validateWorkflowSchema = (schema: unknown): WorkflowSchema => {
  const migrated = migrateWorkflowSchema(schema)
  const nodeIds = new Set<string>()

  migrated.nodes.forEach((node) => {
    if (nodeIds.has(node.id)) {
      throw new Error(WORKFLOW_SCHEMA_ERROR)
    }
    nodeIds.add(node.id)
  })

  const hasStart = migrated.nodes.some((node) => node.type === 'start')
  const hasEnd = migrated.nodes.some((node) => node.type === 'end')

  if (!hasStart || !hasEnd) {
    throw new Error(WORKFLOW_SCHEMA_ERROR)
  }

  migrated.edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new Error(WORKFLOW_SCHEMA_ERROR)
    }
  })

  return migrated
}

export default migrateWorkflowSchema
