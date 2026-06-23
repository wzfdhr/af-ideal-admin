import { describe, expect, it } from 'vitest'
import { createMessageTemplateMockStore } from '@/mock/modules/message-template'

describe('message template mock store', () => {
  it('filters templates by channel, status and keyword', () => {
    const store = createMessageTemplateMockStore()
    const result = store.queryTemplates({
      current: 1,
      pageSize: 10,
      channel: 'todo',
      status: 'enabled',
      keyword: '流程',
    })

    expect(result.total).toBe(1)
    expect(result.list[0].id).toBe('tpl-workflow-todo')
    expect(result.list[0].channel).toBe('todo')
    expect(result.list[0].status).toBe('enabled')
  })

  it('previews required variables and queues a send task with audit id', () => {
    const store = createMessageTemplateMockStore({
      now: () => '2026-06-23 12:00:00',
      id: () => 'message-task-1',
    })
    const missingPreview = store.previewTemplate('tpl-workflow-todo', {
      variables: {
        applicant: '张三',
      },
      recipientScope: 'role',
      recipientTarget: '审批人',
    })

    expect(missingPreview.missingVariables).toEqual(['businessName'])

    const preview = store.previewTemplate('tpl-workflow-todo', {
      variables: {
        applicant: '张三',
        businessName: '合同审批',
      },
      recipientScope: 'role',
      recipientTarget: '审批人',
    })
    const task = store.createSendTask({
      templateId: 'tpl-workflow-todo',
      title: preview.title,
      content: preview.content,
      recipientScope: 'role',
      recipientTarget: '审批人',
      deliveryModes: ['in-app', 'websocket'],
    })

    expect(preview.title).toBe('合同审批待处理')
    expect(preview.content).toContain('张三提交合同审批')
    expect(preview.recipientSummary).toBe('角色：审批人')
    expect(task.success).toBe(true)
    expect(task.taskId).toBe('message-task-1')
    expect(task.recipientCount).toBeGreaterThan(0)
    expect(task.auditLogId).toBe('audit-message-task-1')
  })

  it('blocks send tasks for disabled templates', () => {
    const store = createMessageTemplateMockStore()
    const task = store.createSendTask({
      templateId: 'tpl-security-alert',
      title: '权限异常告警',
      content: '检测到异常权限变更。',
      recipientScope: 'tenant',
      recipientTarget: 'tenant-a',
      deliveryModes: ['in-app'],
    })

    expect(task.success).toBe(false)
    expect(task.reason).toContain('未启用')
  })
})
