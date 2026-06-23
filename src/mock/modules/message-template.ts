import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import type { MessageDeliveryMode } from '@/api/message-subscription'
import type {
  MessageRecipientScope,
  MessageSendTaskPayload,
  MessageSendTaskResult,
  MessageTemplateChannel,
  MessageTemplatePageResult,
  MessageTemplatePreviewPayload,
  MessageTemplatePreviewResult,
  MessageTemplateQuery,
  MessageTemplateRecord,
  MessageTemplateStatus,
} from '@/api/message-template'
import type { MockParams } from '../types'

export interface MessageTemplateMockStoreOptions {
  now?: () => string
  id?: () => string
}

interface MessageSendTaskRecord extends MessageSendTaskResult {
  createdAt: string
  payload: MessageSendTaskPayload
}

const getNow = () => '2026-06-23 10:00:00'

const getDefaultId = () => Mock.Random.guid()

const channelLabels: Record<MessageTemplateChannel, string> = {
  notice: '公告',
  message: '站内信',
  todo: '待办',
  alert: '告警',
}

const scopeLabels: Record<MessageRecipientScope, string> = {
  all: '全部用户',
  role: '角色',
  department: '部门',
  tenant: '租户',
}

const recipientCounts: Record<MessageRecipientScope, number> = {
  all: 120,
  role: 6,
  department: 18,
  tenant: 42,
}

const allowedDeliveryModes: MessageDeliveryMode[] = [
  'in-app',
  'email',
  'websocket',
]

const seedTemplates = (): MessageTemplateRecord[] => [
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
    deliveryModes: ['in-app', 'websocket'],
    updatedAt: '2026-06-23 09:00:00',
  },
  {
    id: 'tpl-report-export',
    name: '报表导出结果',
    channel: 'message',
    title: '{{reportName}}导出{{result}}',
    content: '{{operator}}发起的{{reportName}}导出任务{{result}}。',
    variables: [
      { key: 'operator', label: '操作人', required: true },
      { key: 'reportName', label: '报表名称', required: true },
      { key: 'result', label: '导出结果', required: true },
    ],
    status: 'enabled',
    recipientScope: 'department',
    recipientTarget: '运营部',
    deliveryModes: ['in-app', 'email'],
    updatedAt: '2026-06-23 09:20:00',
  },
  {
    id: 'tpl-tenant-notice',
    name: '租户公告',
    channel: 'notice',
    title: '{{tenantName}}服务公告',
    content: '{{tenantName}}将在{{window}}进行服务维护。',
    variables: [
      { key: 'tenantName', label: '租户名称', required: true },
      { key: 'window', label: '维护窗口', required: true },
    ],
    status: 'draft',
    recipientScope: 'tenant',
    recipientTarget: 'tenant-a',
    deliveryModes: ['in-app'],
    updatedAt: '2026-06-22 18:00:00',
  },
  {
    id: 'tpl-security-alert',
    name: '权限异常告警',
    channel: 'alert',
    title: '权限异常告警',
    content: '检测到异常权限变更，请立即核查。',
    variables: [],
    status: 'disabled',
    recipientScope: 'tenant',
    recipientTarget: 'tenant-a',
    deliveryModes: ['in-app'],
    updatedAt: '2026-06-22 17:00:00',
  },
]

const cloneTemplate = (
  record: MessageTemplateRecord
): MessageTemplateRecord => ({
  ...record,
  variables: record.variables.map((variable) => ({ ...variable })),
  deliveryModes: [...(record.deliveryModes || [])],
})

const readString = (value: unknown) =>
  typeof value === 'string' ? value : undefined

const toPositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const parseQuery = (url: string): MessageTemplateQuery => {
  const { query } = qs.parseUrl(url)

  return {
    current: toPositiveNumber(query.current, 1),
    pageSize: toPositiveNumber(query.pageSize, 20),
    channel: (readString(query.channel) || '') as MessageTemplateChannel | '',
    status: (readString(query.status) || '') as MessageTemplateStatus | '',
    keyword: readString(query.keyword) || '',
  }
}

const parseJson = <T>(body: string, fallback: T): T => {
  try {
    return JSON.parse(body || '{}') as T
  } catch {
    return fallback
  }
}

const getTemplateIdFromPreviewUrl = (url: string) => {
  const match = url.match(/\/api\/messages\/templates\/([^/]+)\/preview$/)
  return decodeURIComponent(match?.[1] || '')
}

const normalizeDeliveryModes = (modes: MessageDeliveryMode[]) => {
  const uniqueModes = Array.from(new Set(modes))
  return uniqueModes.filter((mode) => allowedDeliveryModes.includes(mode))
}

const applyVariables = (template: string, variables: Record<string, string>) =>
  template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key: string) => {
    const value = variables[key]
    return value?.trim() || `{{${key}}}`
  })

const getRecipientSummary = (scope: MessageRecipientScope, target: string) => {
  if (scope === 'all') return scopeLabels.all
  return `${scopeLabels[scope]}：${target || '-'}`
}

export const createMessageTemplateMockStore = (
  options: MessageTemplateMockStoreOptions = {}
) => {
  const now = options.now || getNow
  const id = options.id || getDefaultId
  const templates = seedTemplates()
  let sendTasks: MessageSendTaskRecord[] = []

  const queryTemplates = (
    params: MessageTemplateQuery
  ): MessageTemplatePageResult => {
    const current = params.current || 1
    const pageSize = params.pageSize || 20
    const keyword = params.keyword?.trim().toLowerCase() || ''
    const filtered = templates.filter((template) => {
      const matchedChannel = params.channel
        ? template.channel === params.channel
        : true
      const matchedStatus = params.status
        ? template.status === params.status
        : true
      const matchedKeyword = keyword
        ? `${template.name}${template.title}${template.content}${
            channelLabels[template.channel]
          }`
            .toLowerCase()
            .includes(keyword)
        : true

      return matchedChannel && matchedStatus && matchedKeyword
    })
    const start = (current - 1) * pageSize

    return {
      list: filtered.slice(start, start + pageSize).map(cloneTemplate),
      total: filtered.length,
    }
  }

  const previewTemplate = (
    templateId: string,
    payload: MessageTemplatePreviewPayload
  ): MessageTemplatePreviewResult => {
    const template = templates.find((item) => item.id === templateId)

    if (!template) {
      return {
        title: '',
        content: '',
        recipientSummary: getRecipientSummary(
          payload.recipientScope,
          payload.recipientTarget
        ),
        missingVariables: ['template'],
      }
    }

    const missingVariables = template.variables
      .filter(
        (variable) =>
          variable.required && !payload.variables[variable.key]?.trim()
      )
      .map((variable) => variable.key)

    return {
      title: applyVariables(template.title, payload.variables),
      content: applyVariables(template.content, payload.variables),
      recipientSummary: getRecipientSummary(
        payload.recipientScope,
        payload.recipientTarget
      ),
      missingVariables,
    }
  }

  const createSendTask = (
    payload: MessageSendTaskPayload
  ): MessageSendTaskResult => {
    const template = templates.find((item) => item.id === payload.templateId)

    if (!template) {
      return {
        success: false,
        status: 'failed',
        recipientCount: 0,
        reason: '消息模板不存在',
      }
    }
    if (template.status !== 'enabled') {
      return {
        success: false,
        status: 'failed',
        recipientCount: 0,
        reason: '消息模板未启用',
      }
    }

    const taskId = id()
    const result: MessageSendTaskResult = {
      success: true,
      taskId,
      status: 'queued',
      recipientCount: recipientCounts[payload.recipientScope],
      auditLogId: `audit-${taskId}`,
      messageId: `message-${taskId}`,
    }

    sendTasks = [
      {
        ...result,
        createdAt: now(),
        payload: {
          ...payload,
          deliveryModes: normalizeDeliveryModes(payload.deliveryModes),
        },
      },
      ...sendTasks,
    ]

    return {
      ...result,
    }
  }

  const getSendTasks = () =>
    sendTasks.map((task) => ({
      ...task,
      payload: {
        ...task.payload,
        deliveryModes: [...task.payload.deliveryModes],
      },
    }))

  return {
    queryTemplates,
    previewTemplate,
    createSendTask,
    getSendTasks,
  }
}

const messageTemplateStore = createMessageTemplateMockStore()

const setupMessageTemplateMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/messages/templates(\\?.*)?$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            messageTemplateStore.queryTemplates(parseQuery(params.url))
          )
        }
      )

      Mock.mock(
        new RegExp('/api/messages/templates/[^/]+/preview$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            messageTemplateStore.previewTemplate(
              getTemplateIdFromPreviewUrl(params.url),
              parseJson<MessageTemplatePreviewPayload>(params.body, {
                variables: {},
                recipientScope: 'all',
                recipientTarget: '',
              })
            )
          )
        }
      )

      Mock.mock(
        new RegExp('/api/messages/send-tasks$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            messageTemplateStore.createSendTask(
              parseJson<MessageSendTaskPayload>(params.body, {
                templateId: '',
                title: '',
                content: '',
                recipientScope: 'all',
                recipientTarget: '',
                deliveryModes: ['in-app'],
              })
            )
          )
        }
      )
    },
  })
}

export default setupMessageTemplateMock
