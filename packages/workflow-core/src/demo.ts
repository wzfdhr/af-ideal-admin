import {
  DomainError,
  createR1Menu,
  demoIdentities,
  LEAVE_FORM,
  serialWorkflow,
  parseCreateLeave,
  parseUpdateLeave,
  parseCommand,
  parsePublish,
  parseForm,
  parseWorkflow,
  validateLeaveForm,
  calculateHalfDayUnits,
  parseLeaveFields,
  record,
  onlyKeys,
  positiveInteger,
  text,
} from '@af-admin/contracts'
import {
  advanceWorkflow,
  validateSerialWorkflow,
  assertRevision,
  assertTaskAction,
  assertWithdraw,
  hasPermission,
  requirePermission,
} from './workflow'
import type {
  Application,
  Release,
  LeaveRequest,
  WorkflowTask,
  HistoryRecord,
  FormSchema,
  WorkflowSchema,
  Draft,
  DemoIdentity,
} from '@af-admin/contracts'

type Definition = Draft<FormSchema | WorkflowSchema> & {
  tenantId: string
  kind: 'form' | 'workflow'
}
interface Instance {
  id: string
  tenantId: string
  requestId: string
  releaseId: string
  status: 'running' | 'completed' | 'rejected' | 'withdrawn'
  currentNodeId: string | null
}
interface Notification {
  id: string
  tenantId: string
  recipientId: string
  requestId: string
  title: string
  content: string
  category: string
  status: 'read' | 'unread'
  source: string
  priority: string
  createdAt: string
  link: string
  access: string
}
interface DemoAudit {
  id: string
  tenantId: string
  module: string
  action: string
  result: string
  operator: { id: string; name: string }
  target: { type: string; id: string }
  occurredAt: string
  detail: Record<string, unknown>
  source: string
}
interface State {
  applications: Application[]
  releases: Release[]
  definitions: Definition[]
  requests: LeaveRequest[]
  instances: Instance[]
  tasks: WorkflowTask[]
  history: (HistoryRecord & { tenantId: string })[]
  messages: Notification[]
  audits: DemoAudit[]
  replays: Record<string, { signature: string; data: unknown }>
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const missing = (): never => {
  throw new DomainError(404, 'NOT_FOUND', '资源不存在')
}
const conflict = (message: string): never => {
  throw new DomainError(409, 'STATE_CONFLICT', message)
}
const canonical = (input: unknown): unknown => {
  if (Array.isArray(input)) return input.map(canonical)
  if (input && typeof input === 'object')
    return Object.fromEntries(
      Object.entries(input)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, canonical(value)])
    )
  return input
}
const signature = (input: unknown) => JSON.stringify(canonical(input))

/** Development-only data source. It does not claim PostgreSQL concurrency or persistence. */
export class R1DemoStore {
  private state: State

  private identities = clone(demoIdentities)

  constructor(
    private clock: () => string = () => '2026-10-01T00:00:00.000Z',
    private newId: () => string = () => crypto.randomUUID()
  ) {
    this.state = this.initial()
  }

  private initial(): State {
    const state: State = {
      applications: [],
      releases: [],
      definitions: [],
      requests: [],
      instances: [],
      tasks: [],
      history: [],
      messages: [],
      audits: [],
      replays: {},
    }
    ;['a', 'b'].forEach((suffix) => {
      const tenantId = `tenant-${suffix}`
      const releaseId = this.newId()
      const workflow = serialWorkflow(
        `${suffix}-manager-1`,
        `${suffix}-manager-2`,
        `${suffix}-auditor`
      )
      state.applications.push({
        tenantId,
        id: 'leave',
        code: 'leave',
        name: '请假审批',
        activeReleaseId: releaseId,
        revision: 1,
      })
      state.releases.push({
        id: releaseId,
        tenantId,
        applicationId: 'leave',
        releaseVersion: 1,
        formSnapshot: clone(LEAVE_FORM),
        workflowSnapshot: workflow,
        contentHash: 'demo-seed',
        publishedAt: this.clock(),
        publishedBy: `${suffix}-admin`,
      })
      state.definitions.push(
        {
          tenantId,
          kind: 'form',
          id: 'form-leave',
          name: '请假表单',
          schema: clone(LEAVE_FORM),
          revision: 1,
          version: 1,
          status: 'draft',
          createdAt: this.clock(),
          updatedAt: this.clock(),
        },
        {
          tenantId,
          kind: 'workflow',
          id: 'workflow-leave',
          name: '请假审批',
          schema: clone(workflow),
          revision: 1,
          version: 1,
          status: 'draft',
          createdAt: this.clock(),
          updatedAt: this.clock(),
        }
      )
    })
    return state
  }

  reset() {
    this.state = this.initial()
  }

  isIdentity(id: string | null) {
    return this.identities.some((user) => user.id === id)
  }

  private actor(id: string, tenantId: string): DemoIdentity {
    const user = this.identities.find((candidate) => candidate.id === id)
    if (!user)
      throw new DomainError(401, 'UNAUTHORIZED', '登录已过期，请重新登录')
    if (!user.tenantIds.includes(tenantId)) return missing()
    return user
  }

  private page<T>(items: T[], url: URL) {
    const current = Number(url.searchParams.get('current') || 1)
    const pageSize = Number(url.searchParams.get('pageSize') || 10)
    if (
      !Number.isSafeInteger(current) ||
      current < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    )
      throw new DomainError(422, 'VALIDATION_ERROR', '分页参数无效')
    return {
      list: items.slice((current - 1) * pageSize, current * pageSize),
      total: items.length,
    }
  }

  private audit(
    user: DemoIdentity,
    tenantId: string,
    module: string,
    action: string,
    type: string,
    id: string,
    detail: Record<string, unknown> = {}
  ) {
    this.state.audits.push({
      id: this.newId(),
      tenantId,
      module,
      action,
      result: 'success',
      operator: { id: user.id, name: user.name },
      target: { type, id },
      occurredAt: this.clock(),
      detail,
      source: 'server',
    })
  }

  private mutate<T>(
    user: DemoIdentity,
    tenantId: string,
    permission: string,
    operation: string,
    payload: unknown,
    key: string | undefined,
    run: () => T
  ): T {
    requirePermission(user.permissions, permission)
    const replayId = JSON.stringify([tenantId, user.id, operation, key])
    if (key) {
      if (key.length < 8 || key.length > 200)
        throw new DomainError(
          422,
          'VALIDATION_ERROR',
          '写命令必须提供有效的 Idempotency-Key'
        )
      const previous = this.state.replays[replayId]
      if (previous) {
        if (previous.signature !== signature(payload))
          throw new DomainError(
            409,
            'IDEMPOTENCY_CONFLICT',
            '同一个重试标识不能用于不同内容'
          )
        return clone(previous.data) as T
      }
    }
    const original = clone(this.state)
    try {
      const result = run()
      if (key)
        this.state.replays[replayId] = {
          signature: signature(payload),
          data: clone(result),
        }
      return clone(result)
    } catch (error) {
      this.state = original
      throw error
    }
  }

  private release(tenantId: string, id: string) {
    return (
      this.state.releases.find(
        (value) => value.tenantId === tenantId && value.id === id
      ) || missing()
    )
  }

  private application(tenantId: string) {
    return (
      this.state.applications.find(
        (value) => value.tenantId === tenantId && value.id === 'leave'
      ) || missing()
    )
  }

  private activeRelease(tenantId: string, id: string) {
    const release = this.release(tenantId, id)
    if (this.application(tenantId).activeReleaseId !== id)
      throw new DomainError(
        409,
        'RELEASE_CHANGED',
        '应用已发布新版本，请预览并确认迁移后再提交'
      )
    return release
  }

  private people(
    tenantId: string,
    workflow: WorkflowSchema,
    applicantId?: string
  ) {
    workflow.nodes.forEach((node) => {
      const ids =
        node.type === 'approval'
          ? node.config.approvers || []
          : node.config.ccUsers || []
      ids.forEach((id) => {
        const person = this.identities.find(
          (item) => item.id === id && item.tenantIds.includes(tenantId)
        )
        if (!person)
          throw new DomainError(
            422,
            'INACTIVE_APPROVER',
            '流程引用了无效的租户成员'
          )
        if (node.type === 'approval') {
          if (id === applicantId)
            throw new DomainError(
              422,
              'SELF_APPROVAL',
              '申请人不能审批自己的申请'
            )
          if (
            !['workflow:approve', 'workflow:reject'].every((code) =>
              hasPermission(person.permissions, code)
            )
          )
            throw new DomainError(
              422,
              'INVALID_APPROVER',
              '流程处理人缺少审批权限'
            )
        }
      })
    })
  }

  private requestRow(tenantId: string, id: string) {
    return (
      this.state.requests.find(
        (value) => value.tenantId === tenantId && value.id === id
      ) || missing()
    )
  }

  private requestDto(
    user: DemoIdentity,
    value: LeaveRequest,
    detailed = false
  ): LeaveRequest {
    const item = clone(value)
    item.allowedActions = []
    if (item.applicantId === user.id) {
      if (item.status === 'draft') {
        if (hasPermission(user.permissions, 'leave:update:self'))
          item.allowedActions.push('edit')
        if (hasPermission(user.permissions, 'leave:submit'))
          item.allowedActions.push('submit')
      }
      if (
        item.status === 'running' &&
        hasPermission(user.permissions, 'leave:withdraw:self')
      )
        item.allowedActions.push('withdraw')
      if (
        ['rejected', 'withdrawn'].includes(item.status) &&
        hasPermission(user.permissions, 'leave:create')
      )
        item.allowedActions.push('copy')
    }
    if (detailed) {
      const canRead =
        hasPermission(user.permissions, 'leave:read:self') ||
        hasPermission(user.permissions, 'workflow:todo')
      const participated = this.state.tasks.some(
        (task) =>
          task.tenantId === item.tenantId &&
          task.requestId === item.id &&
          task.assigneeId === user.id
      )
      const copied = this.state.messages.some(
        (message) =>
          message.tenantId === item.tenantId &&
          message.requestId === item.id &&
          message.recipientId === user.id &&
          message.access === 'copy'
      )
      if (
        !canRead ||
        (item.applicantId !== user.id && !participated && !copied)
      )
        return missing()
      item.release = clone(
        this.release(item.tenantId, item.applicationReleaseId)
      )
      item.history = clone(
        this.state.history.filter(
          (event) =>
            event.tenantId === item.tenantId &&
            event.instanceId === item.instanceId
        )
      )
      item.tasks = clone(
        this.state.tasks.filter(
          (task) =>
            task.tenantId === item.tenantId && task.requestId === item.id
        )
      )
    }
    return item
  }

  private history(
    user: DemoIdentity,
    request: LeaveRequest,
    action: string,
    taskId: string | null,
    comment = ''
  ) {
    const sequence =
      this.state.history.filter(
        (value) =>
          value.tenantId === request.tenantId &&
          value.instanceId === request.instanceId
      ).length + 1
    this.state.history.push({
      id: this.newId(),
      tenantId: request.tenantId,
      instanceId: request.instanceId as string,
      taskId,
      action,
      operatorId: user.id,
      operatorName: user.name,
      comment,
      sequence,
      createdAt: this.clock(),
    })
  }

  private notify(
    request: LeaveRequest,
    recipientId: string,
    title: string,
    category = 'message',
    copied = false
  ) {
    const person =
      this.identities.find((value) => value.id === recipientId) || missing()
    const canRead =
      hasPermission(person.permissions, 'leave:read:self') ||
      hasPermission(person.permissions, 'workflow:todo')
    let link = `/leave/requests/${request.id}`
    if (copied && !canRead)
      link = hasPermission(person.permissions, 'audit:read')
        ? `/audit/logs?targetId=${request.id}`
        : '/leave/application'
    this.state.messages.push({
      id: this.newId(),
      tenantId: request.tenantId,
      recipientId,
      requestId: request.id,
      title,
      content: '请查看授权范围内的流程记录',
      category,
      status: 'unread',
      source: 'workflow',
      priority: 'normal',
      createdAt: this.clock(),
      link,
      access: copied && canRead ? 'copy' : 'none',
    })
  }

  private advance(
    user: DemoIdentity,
    request: LeaveRequest,
    instance: Instance,
    afterNode?: string
  ) {
    const next = advanceWorkflow(
      this.release(request.tenantId, request.applicationReleaseId)
        .workflowSnapshot,
      afterNode
    )
    instance.currentNodeId = next.approval?.id || null
    if (next.approval) {
      this.state.tasks.push({
        id: this.newId(),
        tenantId: request.tenantId,
        instanceId: instance.id,
        requestId: request.id,
        nodeId: next.approval.id,
        nodeName: next.approval.name,
        assigneeId: next.approval.config.approvers?.[0] as string,
        status: 'pending',
        revision: 1,
        createdAt: this.clock(),
        completedAt: null,
        applicantName: request.applicantName,
        halfDayUnits: request.halfDayUnits,
      })
      this.notify(
        request,
        next.approval.config.approvers?.[0] as string,
        '有新的请假审批待办',
        'todo'
      )
    }
    next.copiedUserIds.forEach((recipient) =>
      this.notify(request, recipient, '请假申请抄送', 'message', true)
    )
    if (next.copiedUserIds.length)
      this.history(user, request, 'copy', null, '已按流程抄送')
    if (next.completed) {
      instance.status = 'completed'
      request.status = 'approved'
      this.notify(request, request.applicantId, '请假申请已通过')
    }
  }

  request(
    method: string,
    target: string,
    userId: string,
    tenantId: string,
    input?: unknown,
    key?: string
  ): unknown {
    const user = this.actor(userId, tenantId)
    const url = new URL(target, 'http://demo.local')
    const path = url.pathname.replace(/^\/api/, '')
    const parts = path.split('/').filter(Boolean)
    const id = parts[1]
    if (path === '/user/info')
      return {
        id: user.id,
        name: user.name,
        role: user.role,
        permissions: user.permissions,
        dept: '业务部',
        avatar: '',
        tenantId,
        tenants: user.tenantIds.map((value) => ({
          tenantId: value,
          name: value === 'tenant-a' ? '演示集团 A' : '演示集团 B',
          permissions: user.permissions,
          permissionVersion: 1,
        })),
      }
    if (path === '/user/menu') return createR1Menu(user.permissions)
    if (path === '/tenants')
      return {
        list: user.tenantIds.map((value) => ({
          id: value,
          name: value === 'tenant-a' ? '演示集团 A' : '演示集团 B',
          code: value,
          status: 'enabled',
          current: value === tenantId,
        })),
        total: user.tenantIds.length,
      }
    if (parts[0] === 'tenants' && parts[2] === 'context') {
      this.actor(userId, id)
      return {
        tenantId: id,
        name: id === 'tenant-a' ? '演示集团 A' : '演示集团 B',
        permissions: user.permissions,
        permissionVersion: 1,
        currentTenant: {
          id,
          name: id === 'tenant-a' ? '演示集团 A' : '演示集团 B',
          code: id,
          status: 'enabled',
          current: true,
          brandName: id === 'tenant-a' ? '演示集团 A' : '演示集团 B',
          themeColor: '#165dff',
        },
        orgTree: [],
        dataScopes: [],
      }
    }
    if (path === '/user/logout') return null
    if (path === '/workflow-instances' && method === 'post')
      throw new DomainError(
        409,
        'BUSINESS_SUBMIT_REQUIRED',
        '请通过请假申请提交入口发起流程'
      )
    if (
      parts[0] === 'form-runtime' &&
      parts[2] === 'submit' &&
      method === 'post'
    ) {
      requirePermission(user.permissions, 'application:configure')
      if (
        !this.state.definitions.some(
          (value) =>
            value.tenantId === tenantId &&
            value.kind === 'form' &&
            value.id === id
        )
      )
        return missing()
      const body = record(input)
      onlyKeys(body, ['values'])
      parseLeaveFields(body.values)
      return {
        id: `preview-${this.newId()}`,
        formId: id,
        status: 'submitted',
        mode: 'preview',
      }
    }
    if (path === '/tenants/switch') {
      const body = record(input)
      onlyKeys(body, ['tenantId'])
      const selected = text(body.tenantId, 'tenantId', 100)
      this.actor(userId, selected)
      return {
        tenantId: selected,
        name: selected === 'tenant-a' ? '演示集团 A' : '演示集团 B',
        permissions: user.permissions,
        permissionVersion: 1,
      }
    }
    if (parts[0] === 'tenants' && parts[2] === 'members') {
      if (id !== tenantId) return missing()
      requirePermission(user.permissions, 'application:configure')
      return this.identities
        .filter((person) => person.tenantIds.includes(tenantId))
        .map((person) => ({
          id: person.id,
          name: person.name,
          canApprove: ['workflow:approve', 'workflow:reject'].every((code) =>
            hasPermission(person.permissions, code)
          ),
        }))
    }
    if (parts[0] === 'applications') {
      if (id !== 'leave') return missing()
      const app = this.application(tenantId)
      if (method === 'get')
        return clone({
          ...app,
          releases: this.state.releases
            .filter((value) => value.tenantId === tenantId)
            .slice()
            .reverse(),
        })
      if (parts[2] === 'releases') {
        const body = parsePublish(input)
        return this.mutate(
          user,
          tenantId,
          'application:publish',
          'publish:leave',
          body,
          key,
          () => {
            if (!key)
              throw new DomainError(
                422,
                'VALIDATION_ERROR',
                '写命令必须提供有效的 Idempotency-Key'
              )
            assertRevision(app.revision, body.expectedRevision)
            const form =
              this.state.definitions.find(
                (value) =>
                  value.tenantId === tenantId &&
                  value.kind === 'form' &&
                  value.id === body.formDraftId
              ) || missing()
            const workflow =
              this.state.definitions.find(
                (value) =>
                  value.tenantId === tenantId &&
                  value.kind === 'workflow' &&
                  value.id === body.workflowDraftId
              ) || missing()
            assertRevision(form.revision, body.formRevision)
            assertRevision(workflow.revision, body.workflowRevision)
            const formSnapshot = parseForm(form.schema)
            const workflowSnapshot = validateSerialWorkflow(workflow.schema)
            validateLeaveForm(formSnapshot)
            this.people(tenantId, workflowSnapshot)
            workflowSnapshot.nodes.forEach((node) => {
              if (node.config.formId && node.config.formId !== body.formDraftId)
                throw new DomainError(
                  422,
                  'FORM_BINDING_INVALID',
                  '流程节点引用了其他表单'
                )
            })
            const version =
              this.state.releases.filter((value) => value.tenantId === tenantId)
                .length + 1
            const release: Release = {
              id: this.newId(),
              tenantId,
              applicationId: 'leave',
              releaseVersion: version,
              formSnapshot,
              workflowSnapshot,
              contentHash: `demo-${version}`,
              publishedAt: this.clock(),
              publishedBy: user.id,
            }
            this.state.releases.push(clone(release))
            app.activeReleaseId = release.id
            app.revision += 1
            this.audit(
              user,
              tenantId,
              'application',
              'publish',
              'application',
              'leave'
            )
            return release
          }
        )
      }
      if (parts[2] === 'activate-release') {
        const body = record(input)
        onlyKeys(body, ['releaseId', 'expectedRevision'])
        const releaseId = text(body.releaseId, 'releaseId')
        const revision = positiveInteger(body.expectedRevision)
        return this.mutate(
          user,
          tenantId,
          'application:rollback',
          'activate:leave',
          body,
          key,
          () => {
            if (!key)
              throw new DomainError(
                422,
                'VALIDATION_ERROR',
                '写命令必须提供有效的 Idempotency-Key'
              )
            assertRevision(app.revision, revision)
            this.release(tenantId, releaseId)
            app.activeReleaseId = releaseId
            app.revision += 1
            this.audit(
              user,
              tenantId,
              'application',
              'activate-release',
              'application',
              'leave'
            )
            return {
              ...app,
              releases: this.state.releases
                .filter((value) => value.tenantId === tenantId)
                .slice()
                .reverse(),
            }
          }
        )
      }
    }
    if (parts[0] === 'form-schemas' || parts[0] === 'workflows') {
      const kind = parts[0] === 'form-schemas' ? 'form' : 'workflow'
      requirePermission(user.permissions, 'application:configure')
      if (method === 'get') {
        const items = this.state.definitions.filter(
          (value) => value.tenantId === tenantId && value.kind === kind
        )
        return clone(
          id
            ? items.find((value) => value.id === id) || missing()
            : this.page(items, url)
        )
      }
      const body = record(input)
      onlyKeys(
        body,
        id ? ['schema', 'expectedRevision', 'name'] : ['name', 'schema']
      )
      const schema =
        kind === 'form' ? parseForm(body.schema) : parseWorkflow(body.schema)
      return this.mutate(
        user,
        tenantId,
        'application:configure',
        'save-draft',
        body,
        undefined,
        () => {
          let draft = this.state.definitions.find(
            (value) =>
              value.tenantId === tenantId &&
              value.kind === kind &&
              value.id === id
          )
          if (id) {
            if (!draft) return missing()
            assertRevision(
              draft.revision,
              positiveInteger(body.expectedRevision)
            )
            if (body.name !== undefined)
              draft.name = text(body.name, 'name', 100)
            draft.schema = schema
            draft.revision += 1
            draft.updatedAt = this.clock()
          } else {
            draft = {
              id: this.newId(),
              tenantId,
              kind,
              name: text(body.name, 'name', 100),
              schema,
              revision: 1,
              version: 1,
              status: 'draft',
              createdAt: this.clock(),
              updatedAt: this.clock(),
            }
            this.state.definitions.push(draft)
          }
          this.audit(
            user,
            tenantId,
            'application',
            'save-draft',
            kind,
            draft.id
          )
          return draft
        }
      )
    }
    if (parts[0] === 'leave-requests') {
      if (method === 'get') {
        if (id)
          return this.requestDto(user, this.requestRow(tenantId, id), true)
        requirePermission(user.permissions, 'leave:read:self')
        const status = url.searchParams.get('status')
        const items = this.state.requests
          .filter(
            (value) =>
              value.tenantId === tenantId &&
              value.applicantId === user.id &&
              (!status || value.status === status)
          )
          .slice()
          .reverse()
          .map((value) => this.requestDto(user, value))
        return this.page(items, url)
      }
      if (!id) {
        const body = parseCreateLeave(input)
        return this.mutate(
          user,
          tenantId,
          'leave:create',
          'create-draft',
          body,
          key,
          () => {
            this.activeRelease(tenantId, body.applicationReleaseId)
            if (body.previousRequestId) {
              const previous = this.requestRow(tenantId, body.previousRequestId)
              if (previous.applicantId !== user.id) return missing()
              if (!['rejected', 'withdrawn'].includes(previous.status))
                return conflict('只能复制已驳回或已撤回的申请')
            }
            const request: LeaveRequest = {
              ...body.fields,
              id: this.newId(),
              tenantId,
              applicationReleaseId: body.applicationReleaseId,
              applicantId: user.id,
              applicantName: user.name,
              departmentSnapshot: '业务部',
              halfDayUnits: calculateHalfDayUnits(body.fields),
              status: 'draft',
              revision: 1,
              previousRequestId: body.previousRequestId || null,
              instanceId: null,
              createdAt: this.clock(),
              updatedAt: this.clock(),
              allowedActions: [],
            }
            this.state.requests.push(request)
            this.audit(
              user,
              tenantId,
              'leave',
              'create-draft',
              'leave-request',
              request.id
            )
            return this.requestDto(user, request)
          }
        )
      }
      if (method === 'patch') {
        const body = parseUpdateLeave(input)
        return this.mutate(
          user,
          tenantId,
          'leave:update:self',
          `save:${id}`,
          body,
          undefined,
          () => {
            const request = this.requestRow(tenantId, id)
            if (request.applicantId !== user.id) return missing()
            assertRevision(request.revision, body.expectedRevision)
            if (request.status !== 'draft')
              return conflict('已提交的申请不能直接编辑')
            if (body.applicationReleaseId)
              this.activeRelease(tenantId, body.applicationReleaseId)
            Object.assign(request, body.fields, {
              applicationReleaseId:
                body.applicationReleaseId || request.applicationReleaseId,
              halfDayUnits: calculateHalfDayUnits(body.fields),
              revision: request.revision + 1,
              updatedAt: this.clock(),
            })
            this.audit(
              user,
              tenantId,
              'leave',
              'save-draft',
              'leave-request',
              id
            )
            return this.requestDto(user, request)
          }
        )
      }
      if (parts[2] === 'submit') {
        const body = parseCommand(input)
        return this.mutate(
          user,
          tenantId,
          'leave:submit',
          `submit:${id}`,
          body,
          key,
          () => {
            if (!key)
              throw new DomainError(
                422,
                'VALIDATION_ERROR',
                '写命令必须提供有效的 Idempotency-Key'
              )
            const request = this.requestRow(tenantId, id)
            if (request.applicantId !== user.id) return missing()
            assertRevision(request.revision, body.expectedRevision)
            if (request.status !== 'draft') return conflict('申请已经提交')
            const release = this.activeRelease(
              tenantId,
              request.applicationReleaseId
            )
            parseLeaveFields({
              leaveType: request.leaveType,
              startDate: request.startDate,
              startSlot: request.startSlot,
              endDate: request.endDate,
              endSlot: request.endSlot,
              reason: request.reason,
            })
            this.people(tenantId, release.workflowSnapshot, user.id)
            const instance: Instance = {
              id: this.newId(),
              tenantId,
              requestId: id,
              releaseId: release.id,
              status: 'running',
              currentNodeId: null,
            }
            request.instanceId = instance.id
            request.status = 'running'
            request.revision += 1
            request.updatedAt = this.clock()
            this.state.instances.push(instance)
            this.history(user, request, 'start', null)
            this.advance(user, request, instance)
            this.audit(user, tenantId, 'leave', 'submit', 'leave-request', id)
            return this.requestDto(user, request)
          }
        )
      }
    }
    if (path === '/workflow-todos' || path === '/workflow-done') {
      requirePermission(user.permissions, 'workflow:todo')
      const items = this.state.tasks.filter(
        (task) =>
          task.tenantId === tenantId &&
          task.assigneeId === user.id &&
          (path === '/workflow-todos'
            ? task.status === 'pending'
            : ['approved', 'rejected'].includes(task.status))
      )
      return this.page(clone(items.slice().reverse()), url)
    }
    if (
      parts[0] === 'workflow-tasks' &&
      ['approve', 'reject'].includes(parts[2])
    ) {
      const action = parts[2] as 'approve' | 'reject'
      const body = parseCommand(input, action === 'reject')
      return this.mutate(
        user,
        tenantId,
        `workflow:${action}`,
        `${action}:${id}`,
        body,
        key,
        () => {
          if (!key)
            throw new DomainError(
              422,
              'VALIDATION_ERROR',
              '写命令必须提供有效的 Idempotency-Key'
            )
          const task =
            this.state.tasks.find(
              (value) =>
                value.tenantId === tenantId &&
                value.id === id &&
                value.assigneeId === user.id
            ) || missing()
          const request = this.requestRow(tenantId, task.requestId)
          const instance =
            this.state.instances.find(
              (value) =>
                value.tenantId === tenantId && value.id === task.instanceId
            ) || missing()
          assertTaskAction(
            task,
            instance.status,
            user.id,
            user.permissions,
            action,
            body.expectedRevision
          )
          if (
            instance.currentNodeId !== task.nodeId ||
            request.status !== 'running'
          )
            return conflict('申请已结束或当前节点已经变化')
          task.status = action === 'approve' ? 'approved' : 'rejected'
          task.revision += 1
          task.completedAt = this.clock()
          this.history(user, request, action, task.id, body.comment)
          if (action === 'approve')
            this.advance(user, request, instance, task.nodeId)
          else {
            request.status = 'rejected'
            instance.status = 'rejected'
            instance.currentNodeId = null
            this.notify(request, request.applicantId, '请假申请已驳回')
          }
          request.revision += 1
          request.updatedAt = this.clock()
          this.audit(user, tenantId, 'workflow', action, 'workflow-task', id, {
            requestId: request.id,
            instanceId: instance.id,
          })
          return {
            ...task,
            requestStatus: request.status,
            instanceStatus: instance.status,
            requestRevision: request.revision,
          }
        }
      )
    }
    if (parts[0] === 'workflow-instances') {
      const instance =
        this.state.instances.find(
          (value) => value.tenantId === tenantId && value.id === id
        ) || missing()
      const request = this.requestRow(tenantId, instance.requestId)
      if (parts[2] === 'history') {
        this.requestDto(user, request, true)
        return clone(
          this.state.history.filter(
            (value) => value.tenantId === tenantId && value.instanceId === id
          )
        )
      }
      if (parts[2] === 'withdraw') {
        const body = parseCommand(input)
        return this.mutate(
          user,
          tenantId,
          'leave:withdraw:self',
          `withdraw:${id}`,
          body,
          key,
          () => {
            if (!key)
              throw new DomainError(
                422,
                'VALIDATION_ERROR',
                '写命令必须提供有效的 Idempotency-Key'
              )
            assertWithdraw(request.status, request.applicantId, user.id)
            assertRevision(request.revision, body.expectedRevision)
            request.status = 'withdrawn'
            request.revision += 1
            request.updatedAt = this.clock()
            instance.status = 'withdrawn'
            instance.currentNodeId = null
            this.state.tasks
              .filter(
                (task) =>
                  task.tenantId === tenantId &&
                  task.instanceId === id &&
                  task.status === 'pending'
              )
              .forEach((task) => {
                task.status = 'cancelled'
                task.revision += 1
                task.completedAt = this.clock()
              })
            this.history(user, request, 'withdraw', null, body.comment)
            this.notify(request, user.id, '请假申请已撤回')
            this.audit(
              user,
              tenantId,
              'leave',
              'withdraw',
              'leave-request',
              request.id
            )
            return this.requestDto(user, request)
          }
        )
      }
    }
    if (path.startsWith('/messages/notifications')) {
      const own = this.state.messages.filter(
        (message) =>
          message.tenantId === tenantId && message.recipientId === user.id
      )
      if (method === 'get') {
        const category = url.searchParams.get('category')
        const status = url.searchParams.get('status')
        const filtered = own.filter(
          (value) =>
            (!category || value.category === category) &&
            (!status || value.status === status)
        )
        const categoryUnread: Record<string, number> = {
          notice: 0,
          message: 0,
          todo: 0,
          alert: 0,
        }
        own
          .filter((value) => value.status === 'unread')
          .forEach((value) => {
            categoryUnread[value.category] += 1
          })
        return {
          ...this.page(clone(filtered.slice().reverse()), url),
          unreadTotal: own.filter((value) => value.status === 'unread').length,
          categoryUnread,
        }
      }
      if (parts[2] === 'read-all') {
        const { category } = record(input || {})
        let updated = 0
        own
          .filter(
            (value) =>
              value.status === 'unread' &&
              (!category || value.category === category)
          )
          .forEach((value) => {
            value.status = 'read'
            updated += 1
          })
        return { updated }
      }
      const notification =
        own.find((value) => value.id === parts[2]) || missing()
      notification.status = 'read'
      return clone(notification)
    }
    if (path === '/audit/events') {
      if (method === 'post') return { id: this.newId(), source: 'browser' }
      requirePermission(user.permissions, 'audit:read')
      const targetId = url.searchParams.get('targetId')
      const module = url.searchParams.get('module')
      const result = url.searchParams.get('result')
      const operator = url.searchParams.get('operatorName') || ''
      const eventType = url.searchParams.get('eventType')
      const dates = [
        ...url.searchParams.getAll('dateRange'),
        ...url.searchParams.getAll('dateRange[]'),
      ]
      const boundary = (value: string | undefined, end = false) => {
        if (!value) return null
        const stamp = Date.parse(`${value}T00:00:00+08:00`)
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(stamp) ||
          new Date(Date.parse(`${value}T00:00:00Z`))
            .toISOString()
            .slice(0, 10) !== value
        )
          throw new DomainError(422, 'VALIDATION_ERROR', '审计日期筛选无效')
        return stamp + (end ? 86400000 : 0)
      }
      if (dates.length > 2)
        throw new DomainError(422, 'VALIDATION_ERROR', '审计日期筛选无效')
      const from = boundary(dates[0])
      const until = boundary(dates[1], true)
      return this.page(
        clone(
          this.state.audits
            .filter(
              (value) =>
                value.tenantId === tenantId &&
                (!targetId ||
                  value.target.id === targetId ||
                  value.detail.requestId === targetId ||
                  value.detail.instanceId === targetId) &&
                (!module || value.module === module) &&
                (!result || value.result === result) &&
                value.operator.name
                  .toLowerCase()
                  .includes(operator.toLowerCase()) &&
                (!eventType ||
                  eventType ===
                    (value.module === 'auth' ? 'security' : 'operation')) &&
                (from === null || Date.parse(value.occurredAt) >= from) &&
                (until === null || Date.parse(value.occurredAt) < until)
            )
            .slice()
            .reverse()
            .map((value) => ({
              ...value,
              eventType: value.module === 'auth' ? 'security' : 'operation',
            }))
        ),
        url
      )
    }
    if (path === '/outbox/failures') {
      requirePermission(user.permissions, 'application:configure')
      return []
    }
    return missing()
  }
}

export default R1DemoStore
