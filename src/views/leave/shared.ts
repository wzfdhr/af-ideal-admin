import { ApiRequestError } from '@/api/request-client'
import { DomainError } from '@af-admin/contracts'

export const statusLabels: Record<string, string> = {
  draft: '草稿',
  running: '审批中',
  approved: '已通过',
  rejected: '已驳回',
  withdrawn: '已撤回',
}
export const actionLabels: Record<string, string> = {
  start: '提交申请',
  approve: '通过',
  reject: '驳回',
  withdraw: '撤回',
  copy: '抄送',
  route: '条件分支',
  fork: '并行分叉',
  join: '分支汇合',
  sign: '会签结果',
  cancel: '取消剩余任务',
  transfer: '转交待办',
  recover: '异常恢复',
}
export const errorMessage = (error: unknown) => {
  if (error instanceof ApiRequestError) return error.context.displayMessage
  if (error instanceof Error) return error.message
  return '操作失败，请重试'
}
export const fieldErrors = (error: unknown): Record<string, string[]> => {
  if (error instanceof ApiRequestError) return error.context.errors || {}
  if (error instanceof DomainError) return error.errors || {}
  return {}
}
export const isConflict = (error: unknown) =>
  error instanceof ApiRequestError && error.context.httpStatus === 409
export const businessCode = (error: unknown) => {
  if (error instanceof ApiRequestError) return error.context.businessCode
  if (error instanceof DomainError) return error.businessCode
  return undefined
}
export const stableSignature = (value: unknown): string => {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize)
    if (input && typeof input === 'object')
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, normalize(item)])
      )
    return input
  }
  return JSON.stringify(normalize(value))
}
