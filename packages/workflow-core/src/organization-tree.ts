import { DomainError } from '@af-admin/contracts'
import type { Department, DepartmentNode } from '@af-admin/contracts'

export const departmentTree = (items: Department[]): DepartmentNode[] => {
  const nodes = new Map<string, DepartmentNode>()
  items.forEach((item) => {
    if (nodes.has(item.id))
      throw new DomainError(409, 'ORGANIZATION_CORRUPT', '部门标识重复')
    nodes.set(item.id, { ...item, children: [] })
  })
  items.forEach((item) => {
    const seen = new Set<string>([item.id])
    let { parentId } = item
    while (parentId) {
      const parent = nodes.get(parentId)
      if (!parent || seen.has(parentId))
        throw new DomainError(
          409,
          'ORGANIZATION_CORRUPT',
          '部门树有缺失父级或循环'
        )
      seen.add(parentId)
      parentId = parent.parentId
    }
  })
  const roots: DepartmentNode[] = []
  nodes.forEach((node) => {
    if (node.parentId) nodes.get(node.parentId)?.children.push(node)
    else roots.push(node)
  })
  const sort = (siblings: DepartmentNode[]) => {
    siblings.sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
    siblings.forEach((node) => sort(node.children))
  }
  sort(roots)
  return roots
}
export const departmentChoices = (
  nodes: DepartmentNode[],
  excludedId?: string
): { label: string; value: string; disabled: boolean }[] => {
  const choices: { label: string; value: string; disabled: boolean }[] = []
  const visit = (
    siblings: DepartmentNode[],
    prefix: string,
    unavailable: boolean
  ) => {
    siblings.forEach((node) => {
      if (node.id === excludedId) return
      const label = prefix
        ? `${prefix} / ${node.departmentName}`
        : node.departmentName
      const disabled = unavailable || node.status !== 'enabled'
      choices.push({ label, value: node.id, disabled })
      visit(node.children, label, disabled)
    })
  }
  visit(nodes, '', false)
  return choices
}
