import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MessageTemplates from '@/views/message/templates/index.vue'
import type {
  MessageSendTaskResult,
  MessageTemplatePageResult,
  MessageTemplatePreviewResult,
  MessageTemplateRecord,
} from '@/api/message-template'

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const apiMocks = vi.hoisted(() => ({
  createMessageSendTask: vi.fn(),
  fetchMessageTemplates: vi.fn(),
  previewMessageTemplate: vi.fn(),
}))

vi.mock('@/api/message-template', () => ({
  createMessageSendTask: apiMocks.createMessageSendTask,
  fetchMessageTemplates: apiMocks.fetchMessageTemplates,
  previewMessageTemplate: apiMocks.previewMessageTemplate,
}))

const templates: MessageTemplateRecord[] = [
  {
    id: 'tpl-workflow-todo',
    name: '流程待办提醒',
    channel: 'todo',
    title: '{{businessName}}待处理',
    content: '{{applicant}}提交{{businessName}}，请进入流程工作台处理。',
    variables: [
      { key: 'applicant', label: '申请人', required: true },
      { key: 'businessName', label: '业务名称', required: true },
    ],
    status: 'enabled',
    recipientScope: 'role',
    recipientTarget: '审批人',
    updatedAt: '2026-06-23 09:00:00',
  },
]

const pageResult: MessageTemplatePageResult = {
  list: templates,
  total: templates.length,
}

const previewResult: MessageTemplatePreviewResult = {
  title: '合同审批待处理',
  content: '张三提交合同审批，请进入流程工作台处理。',
  recipientSummary: '角色：审批人',
  missingVariables: [],
}

const sendResult: MessageSendTaskResult = {
  success: true,
  taskId: 'message-task-1',
  status: 'queued',
  recipientCount: 6,
  auditLogId: 'audit-message-task-1',
}

describe('MessageTemplates page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.fetchMessageTemplates.mockResolvedValue(pageResult)
    apiMocks.previewMessageTemplate.mockResolvedValue(previewResult)
    apiMocks.createMessageSendTask.mockResolvedValue(sendResult)
  })

  it('loads templates and supports channel status keyword query', async () => {
    const wrapper = mount(MessageTemplates)
    await flushPromises()

    expect(apiMocks.fetchMessageTemplates).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
      channel: '',
      status: '',
      keyword: '',
    })
    expect(wrapper.find('[data-testid="message-templates"]').exists()).toBe(
      true
    )
    expect(wrapper.text()).toContain('流程待办提醒')

    await wrapper
      .find<HTMLSelectElement>('[data-testid="message-template-channel"]')
      .setValue('todo')
    await wrapper
      .find<HTMLSelectElement>('[data-testid="message-template-status"]')
      .setValue('enabled')
    await wrapper
      .find<HTMLInputElement>('[data-testid="message-template-keyword"]')
      .setValue('流程')
    await wrapper
      .find('[data-testid="message-template-query"]')
      .trigger('click')
    await flushPromises()

    expect(apiMocks.fetchMessageTemplates).toHaveBeenLastCalledWith({
      current: 1,
      pageSize: 20,
      channel: 'todo',
      status: 'enabled',
      keyword: '流程',
    })
  })

  it('previews template variables and creates a send task', async () => {
    const wrapper = mount(MessageTemplates)
    await flushPromises()

    await wrapper
      .find<HTMLInputElement>(
        '[data-testid="message-template-variable-applicant"]'
      )
      .setValue('张三')
    await wrapper
      .find<HTMLInputElement>(
        '[data-testid="message-template-variable-businessName"]'
      )
      .setValue('合同审批')
    await wrapper
      .find('[data-testid="message-template-preview"]')
      .trigger('click')
    await flushPromises()

    expect(apiMocks.previewMessageTemplate).toHaveBeenCalledWith(
      'tpl-workflow-todo',
      {
        variables: {
          applicant: '张三',
          businessName: '合同审批',
        },
        recipientScope: 'role',
        recipientTarget: '审批人',
      }
    )
    expect(wrapper.text()).toContain('合同审批待处理')

    await wrapper
      .find('[data-testid="message-template-create-task"]')
      .trigger('click')
    await flushPromises()

    expect(apiMocks.createMessageSendTask).toHaveBeenCalledWith({
      templateId: 'tpl-workflow-todo',
      title: previewResult.title,
      content: previewResult.content,
      recipientScope: 'role',
      recipientTarget: '审批人',
      deliveryModes: ['in-app', 'websocket'],
    })
    expect(wrapper.text()).toContain('已创建发送任务')
  })
})
