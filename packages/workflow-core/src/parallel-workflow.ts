import {
  invalid,
  parseWorkflow,
  validateWorkflowConditionBindings,
  evaluateWorkflowCondition,
} from '@af-admin/contracts'
import type { WorkflowNode, WorkflowSchema } from '@af-admin/contracts'

export const votingThreshold = (node: WorkflowNode) => {
  const count = node.config.approvers?.length || 0
  const { voting } = node.config
  if (node.type !== 'sign' || !voting || count < 2 || count > 20)
    return invalid(node.id, '会签必须有2至20名不同签署人和明确规则')
  if (voting.mode !== 'quorum' && voting.quorum !== undefined)
    invalid(node.id, '只有定额会签可设置阈值')
  let threshold = voting.quorum || 0
  if (voting.mode === 'all') threshold = count
  if (voting.mode === 'any') threshold = 1
  if (threshold < 1 || threshold > count)
    invalid(node.id, '会签阈值超出签署人数')
  return threshold
}
export const votingOutcome = (
  threshold: number,
  approved: number,
  pending: number
): 'waiting' | 'approved' | 'rejected' => {
  if (approved >= threshold) return 'approved'
  if (approved + pending < threshold) return 'rejected'
  return 'waiting'
}
export const validateParallelWorkflow = (
  input: unknown,
  form?: unknown
): WorkflowSchema => {
  const schema = parseWorkflow(input)
  if (![3, 4].includes(schema.version))
    invalid('version', '耐久活动需使用v3或v4格式')
  const nodes = new Map<string, WorkflowNode>()
  const outgoing = new Map<string, WorkflowSchema['edges']>()
  const incoming = new Map<string, number>()
  const edgeIds = new Set<string>()
  schema.nodes.forEach((node) => {
    if (nodes.has(node.id)) invalid(node.id, '节点标识重复')
    nodes.set(node.id, node)
    if (node.type === 'wait' && !node.config.delaySeconds)
      invalid(node.id, '等待节点必须设置有界的等待秒数')
    if (node.type === 'approval' && node.config.approvers?.length !== 1)
      invalid(node.id, '审批节点必须指定一名处理人')
    if (node.type === 'sign') votingThreshold(node)
    if (
      !['approval', 'sign'].includes(node.type) &&
      node.config.approvers?.length
    )
      invalid(node.id, '处理人只能配置于审批或会签')
    if (node.type === 'copy' && !node.config.ccUsers?.length)
      invalid(node.id, '抄送必须配置接收人')
    if (node.type !== 'copy' && node.config.ccUsers?.length)
      invalid(node.id, '接收人只能配置于抄送')
    if (node.type === 'condition' && !node.config.condition)
      invalid(node.id, '条件规则缺失')
    if (node.type !== 'parallel' && node.config.joinId)
      invalid(node.id, '仅分叉可指定汇合')
    if (node.type !== 'join' && node.config.forkId)
      invalid(node.id, '仅汇合可指定分叉')
    if (node.type !== 'sign' && node.config.voting)
      invalid(node.id, '仅会签可指定投票规则')
  })
  const starts = schema.nodes.filter((n) => n.type === 'start')
  const ends = schema.nodes.filter((n) => n.type === 'end')
  if (starts.length !== 1 || ends.length !== 1)
    invalid('nodes', '必须恰有一个开始和结束')
  schema.edges.forEach((edge) => {
    if (
      edgeIds.has(edge.id) ||
      !nodes.has(edge.source) ||
      !nodes.has(edge.target)
    )
      invalid(edge.id, '重复或悬空连线')
    edgeIds.add(edge.id)
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge])
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1)
  })
  schema.nodes.forEach((node) => {
    const edges = outgoing.get(node.id) || []
    if (node.type === 'parallel') {
      const join = nodes.get(node.config.joinId || '')
      if (!join || join.type !== 'join' || join.config.forkId !== node.id)
        invalid(node.id, '分叉和汇合必须准确配对')
      if (
        edges.length < 2 ||
        edges.length > 10 ||
        new Set(edges.map((e) => e.channel)).size !== edges.length ||
        new Set(edges.map((e) => e.target)).size !== edges.length ||
        edges.some(
          (e) => !/^branch-(?:[1-9]|10)$/.test(e.channel || '') || e.branch
        )
      )
        invalid(node.id, '并行需2至10条不同目标的明确分支')
    } else if (node.type === 'condition') {
      if (
        edges.length !== 2 ||
        new Set(edges.map((e) => e.branch)).size !== 2 ||
        edges.some((e) => !e.branch || e.channel) ||
        edges[0].target === edges[1].target
      )
        invalid(node.id, '条件需两条不同目标的匹配/默认分支')
    } else if (
      edges.length !== (node.type === 'end' ? 0 : 1) ||
      edges.some((e) => e.branch || e.channel)
    )
      invalid(node.id, '节点出边不合法')
    if (
      node.type === 'join' &&
      nodes.get(node.config.forkId || '')?.config.joinId !== node.id
    )
      invalid(node.id, '汇合引用错误分叉')
    if (
      node.type === 'start'
        ? (incoming.get(node.id) || 0) !== 0
        : !incoming.get(node.id)
    )
      invalid(node.id, '节点入边不合法')
  })
  const active = new Set<string>()
  const complete = new Set<string>()
  const acyclic = (id: string) => {
    if (active.has(id)) invalid(id, '流程存在环')
    if (complete.has(id)) return
    active.add(id)
    ;(outgoing.get(id) || []).forEach((e) => acyclic(e.target))
    active.delete(id)
    complete.add(id)
  }
  acyclic(starts[0].id)
  if (complete.size !== nodes.size) invalid('nodes', '存在不可达节点')
  const owners = new Map<string, string>()
  const memo = new Map<string, number>()
  const region = (id: string, owner: string, stop?: string): number => {
    if (id === stop) return 0
    const knownOwner = owners.get(id)
    if (knownOwner !== undefined && knownOwner !== owner)
      invalid(id, '分支交叉或在配对汇合前共享活动')
    owners.set(id, owner)
    const key = `${owner}:${id}`
    if (memo.has(key)) return memo.get(key) as number
    const node = nodes.get(id) as WorkflowNode
    const edges = outgoing.get(id) || []
    let count = 0
    if (node.type === 'end') {
      if (stop) invalid(id, '分支提前结束，未进入配对汇合')
    } else if (node.type === 'join') invalid(id, '进入不匹配的汇合')
    else if (node.type === 'parallel') {
      const join = nodes.get(node.config.joinId || '') as WorkflowNode
      count = edges.reduce(
        (sum, e) =>
          sum +
          region(
            e.target,
            `${owner}/${encodeURIComponent(node.id)}/${e.channel}`,
            join.id
          ),
        0
      )
      const previous = owners.get(join.id)
      if (previous !== undefined && previous !== owner)
        invalid(join.id, '汇合归属冲突')
      owners.set(join.id, owner)
      count += region((outgoing.get(join.id) || [])[0].target, owner, stop)
    } else
      count =
        (['approval', 'sign'].includes(node.type) ? 1 : 0) +
        Math.min(...edges.map((e) => region(e.target, owner, stop)))
    memo.set(key, count)
    return count
  }
  if (region(starts[0].id, 'root') < 1)
    invalid('nodes', '每次完整执行必须经过审批或会签')
  if (owners.size !== nodes.size) invalid('nodes', '活动结构不完整')
  if (form !== undefined) validateWorkflowConditionBindings(schema, form)
  return schema
}
export const selectedParallelNodeIds = (
  input: WorkflowSchema,
  values: Record<string, unknown>
): Set<string> => {
  const schema = validateParallelWorkflow(input)
  const nodes = new Map(schema.nodes.map((n) => [n.id, n]))
  const selected = new Set<string>()
  const visit = (id: string) => {
    if (selected.has(id)) return
    selected.add(id)
    const node = nodes.get(id) as WorkflowNode
    const edges = schema.edges.filter((e) => e.source === id)
    if (node.type === 'condition') {
      const branch = evaluateWorkflowCondition(
        node.config.condition || invalid(id, '条件缺失'),
        values
      )
        ? 'matched'
        : 'fallback'
      visit(
        (edges.find((e) => e.branch === branch) || invalid(id, '分支缺失'))
          .target
      )
    } else edges.forEach((e) => visit(e.target))
  }
  visit(
    (
      schema.nodes.find((n) => n.type === 'start') ||
      invalid('nodes', '开始缺失')
    ).id
  )
  return selected
}
