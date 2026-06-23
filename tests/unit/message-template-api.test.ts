import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMessageSendTask,
  fetchMessageTemplates,
  previewMessageTemplate,
  type MessageSendTaskPayload,
  type MessageTemplateQuery,
  type MessageTemplatePreviewPayload,
} from '@/api/message-template'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('message template api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches message templates with channel, status and keyword filters', async () => {
    const query: MessageTemplateQuery = {
      current: 1,
      pageSize: 10,
      channel: 'todo',
      status: 'enabled',
      keyword: '流程',
    }
    requestMock.get.mockResolvedValueOnce({
      data: {
        list: [],
        total: 0,
      },
    })

    await fetchMessageTemplates(query)

    expect(requestMock.get).toHaveBeenCalledWith('/messages/templates', {
      params: query,
    })
  })

  it('previews template variables and creates a send task', async () => {
    const previewPayload: MessageTemplatePreviewPayload = {
      variables: {
        applicant: '张三',
        businessName: '合同审批',
      },
      recipientScope: 'role',
      recipientTarget: '审批人',
    }
    const sendPayload: MessageSendTaskPayload = {
      templateId: 'tpl-workflow-todo',
      title: '合同审批待处理',
      content: '张三提交合同审批，请进入流程工作台处理。',
      recipientScope: 'role',
      recipientTarget: '审批人',
      deliveryModes: ['in-app', 'websocket'],
    }
    requestMock.post
      .mockResolvedValueOnce({
        data: {
          title: '合同审批待处理',
          content: '张三提交合同审批，请进入流程工作台处理。',
          recipientSummary: '角色：审批人',
          missingVariables: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          taskId: 'message-task-1',
          status: 'queued',
          recipientCount: 6,
          auditLogId: 'audit-message-task-1',
        },
      })

    await previewMessageTemplate('tpl-workflow-todo', previewPayload)
    await createMessageSendTask(sendPayload)

    expect(requestMock.post).toHaveBeenNthCalledWith(
      1,
      '/messages/templates/tpl-workflow-todo/preview',
      previewPayload
    )
    expect(requestMock.post).toHaveBeenNthCalledWith(
      2,
      '/messages/send-tasks',
      sendPayload
    )
  })
})
