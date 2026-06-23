export const CURRENT_WORKFLOW_SCHEMA_VERSION = 1

export const WORKFLOW_NODE_TYPES = [
  'start',
  'approval',
  'copy',
  'condition',
  'parallel',
  'end',
] as const

export type WorkflowNodeType = typeof WORKFLOW_NODE_TYPES[number]

export interface WorkflowNodeConfig {
  approvers?: string[]
  ccUsers?: string[]
  condition?: string
  formId?: string
  parallelApprovers?: string[]
  [key: string]: unknown
}

export interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  name: string
  config: WorkflowNodeConfig
  x?: number
  y?: number
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  label: string
}

export interface WorkflowSchema {
  version: number
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export type LegacyWorkflowSchema = {
  version?: unknown
  nodes?: unknown
  edges?: unknown
}

export type LegacyWorkflowNode = Record<string, unknown> & {
  id?: unknown
  type?: unknown
  name?: unknown
  label?: unknown
  config?: unknown
  x?: unknown
  y?: unknown
}

export type LegacyWorkflowEdge = Record<string, unknown> & {
  id?: unknown
  source?: unknown
  target?: unknown
  label?: unknown
}

export interface WorkflowNodeTypeOption {
  type: WorkflowNodeType
  label: string
  description: string
}
