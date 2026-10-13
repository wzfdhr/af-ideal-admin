import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUserStore } from '@/store'
import { commitTenantContext } from '@/services/tenant-context'
import { setToken } from '@/services/auth'
import {
  useFormDesigner,
  useFormDesignerActions,
} from '@/components/form-designer/use-form-designer'

const api = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  save: vi.fn(),
  create: vi.fn(),
  application: vi.fn(),
  submit: vi.fn(),
  navigate: vi.fn(),
}))
vi.mock('../../config/data-mode', () => ({ dataMode: 'reference' }))
vi.mock('@/api/form-schema', () => ({
  fetchFormSchemas: api.list,
  getFormSchemaDetail: api.detail,
  saveFormSchema: api.save,
  createFormSchema: api.create,
  getFormApplication: api.application,
  publishFormSchema: vi.fn(),
  submitFormRuntime: api.submit,
}))
const record = (id: string, revision = 1) => ({
  id,
  name: `草稿-${id}`,
  revision,
  schema: {
    version: 1,
    widgetsConfig: [],
    dataSources: [],
    formConfig: { size: 'medium', layout: 'vertical', labelAlign: 'right' },
  },
  status: 'draft',
  version: 1,
  createdAt: '',
  updatedAt: '',
})
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const active: { unmount: () => void }[] = []
const harness = () => {
  const pinia = createPinia()
  const user = useUserStore(pinia)
  user.$patch({
    id: 'a-admin',
    tenantId: 'tenant-a',
    permissions: ['form:read', 'form:configure'],
  })
  let actions!: ReturnType<typeof useFormDesignerActions>
  let designer!: ReturnType<typeof useFormDesigner>
  const wrapper = mount(
    defineComponent({
      setup() {
        designer = useFormDesigner()
        actions = useFormDesignerActions(designer.ast, designer.formId)
        return {}
      },
      template: '<div />',
    }),
    { global: { plugins: [pinia] } }
  )
  active.push(wrapper)
  return { actions, designer, user, wrapper }
}
beforeEach(() => {
  vi.clearAllMocks()
  commitTenantContext('tenant-a')
  setToken('test-current-token')
})
afterEach(() => {
  vi.unstubAllGlobals()
  active.splice(0).forEach((wrapper) => wrapper.unmount())
})

describe('real form catalogue', () => {
  it('queries bounded pages and keywords while preserving the loaded ID, revision and unsaved schema', async () => {
    const { actions, designer } = harness()
    api.detail.mockResolvedValue(record('selected', 7))
    await actions.loadDraft('selected')
    designer.ast.value.widgetsConfig = [
      { uid: 'local', type: 'input', name: '未保存字段', config: {} },
    ]
    const unsaved = JSON.stringify(designer.ast.value)
    api.list.mockResolvedValueOnce({ list: [record('elsewhere')], total: 245 })
    actions.draftKeyword.value = ' 查找目标 '
    await actions.searchDrafts(2)
    expect(api.list).toHaveBeenLastCalledWith({
      current: 2,
      pageSize: 20,
      keyword: '查找目标',
    })
    expect(actions.draftCurrent.value).toBe(2)
    expect(actions.draftTotal.value).toBe(245)
    expect(actions.draftChoices.value.map((item) => item.id)).toEqual([
      'selected',
      'elsewhere',
    ])
    expect(designer.formId.value).toBe('selected')
    expect(JSON.stringify(designer.ast.value)).toBe(unsaved)
    api.save.mockResolvedValue({ id: 'selected', revision: 8 })
    await actions.saveDraft()
    expect(api.save.mock.calls[0][0]).toBe('selected')
    expect(api.save.mock.calls[0][2]).toBe(7)
    expect(
      actions.draftChoices.value.find((item) => item.id === 'selected')
        ?.revision
    ).toBe(8)
    api.list.mockResolvedValueOnce({ list: [], total: 0 })
    await actions.changeDraftPageSize(100)
    expect(api.list).toHaveBeenLastCalledWith({
      current: 1,
      pageSize: 100,
      keyword: '查找目标',
    })
    const calls = api.list.mock.calls.length
    await actions.changeDraftPageSize(1000)
    expect(api.list.mock.calls.length).toBe(calls)
    expect(designer.formId.value).toBe('selected')
    expect(JSON.stringify(designer.ast.value)).toBe(unsaved)
  })

  it('does not let old keyword pages or old selected detail replies replace the latest state', async () => {
    const { actions, designer } = harness()
    const oldPage = deferred<{
      list: ReturnType<typeof record>[]
      total: number
    }>()
    api.list
      .mockReturnValueOnce(oldPage.promise)
      .mockResolvedValueOnce({ list: [record('new-query')], total: 1 })
    actions.draftKeyword.value = 'old'
    const pendingPage = actions.searchDrafts()
    actions.draftKeyword.value = 'new'
    await actions.searchDrafts()
    oldPage.resolve({ list: [record('old-query')], total: 99 })
    await pendingPage
    expect(actions.draftChoices.value.map((item) => item.id)).toEqual([
      'new-query',
    ])
    const oldDetail = deferred<ReturnType<typeof record>>()
    api.detail
      .mockReturnValueOnce(oldDetail.promise)
      .mockResolvedValueOnce(record('selected-new'))
    const pendingDetail = actions.loadDraft('selected-old')
    await actions.loadDraft('selected-new')
    oldDetail.resolve(record('selected-old'))
    await pendingDetail
    expect(designer.formId.value).toBe('selected-new')
    expect(actions.draftChoices.value.map((item) => item.id)).toContain(
      'selected-new'
    )
  })

  it('clears old identity choices and rejects pending list, load and save callbacks on tenant/token changes', async () => {
    const { actions, designer, user } = harness()
    api.detail.mockResolvedValueOnce(record('source-a'))
    await actions.loadDraft('source-a')
    const oldSave = deferred<{ id: string; revision: number }>()
    api.save.mockReturnValueOnce(oldSave.promise)
    const pendingSave = actions.saveDraft()
    const oldPage = deferred<{
      list: ReturnType<typeof record>[]
      total: number
    }>()
    api.list.mockReturnValueOnce(oldPage.promise)
    const pendingPage = actions.searchDrafts()
    commitTenantContext('tenant-b')
    user.$patch({ tenantId: 'tenant-b' })
    oldSave.resolve({ id: 'source-a', revision: 9 })
    oldPage.resolve({ list: [record('private-a')], total: 1 })
    await Promise.all([pendingSave, pendingPage])
    expect(designer.formId.value).toBe('')
    expect(actions.draftChoices.value).toEqual([])
    expect(actions.actionMessage.value).toBe('')
    const oldDetail = deferred<ReturnType<typeof record>>()
    api.detail.mockReturnValueOnce(oldDetail.promise)
    const pendingDetail = actions.loadDraft('old-token-data')
    setToken('replacement-token')
    oldDetail.resolve(record('old-token-data'))
    await pendingDetail
    expect(designer.formId.value).toBe('')
    expect(actions.draftChoices.value).toEqual([])
    expect(actions.loading.value).toBe(false)
  })

  it.each(['create', 'save'] as const)(
    'releases its own pending %s after a token-only change without applying its response or retrying automatically',
    async (operation) => {
      const { actions, designer } = harness()
      api.detail.mockResolvedValueOnce(record('selected', 7))
      await actions.loadDraft('selected')
      designer.ast.value.widgetsConfig = [
        { uid: 'local', type: 'input', name: '未保存字段', config: {} },
      ]
      const unsaved = JSON.stringify(designer.ast.value)
      const old = deferred<ReturnType<typeof record>>()
      const next = deferred<ReturnType<typeof record>>()
      const transport = operation === 'create' ? api.create : api.save
      transport
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(next.promise)
      const invoke = () =>
        operation === 'create'
          ? actions.createDraft('明确创建')
          : actions.saveDraft()
      const busy = operation === 'create' ? actions.creating : actions.saving
      const pending = invoke()
      expect(busy.value).toBe(true)
      setToken('replacement-token-same-user-and-tenant')
      old.resolve(record('stale-result', 99))
      await pending
      expect(busy.value).toBe(false)
      expect(designer.formId.value).toBe('selected')
      expect(JSON.stringify(designer.ast.value)).toBe(unsaved)
      expect(
        actions.draftChoices.value.find((item) => item.id === 'selected')
          ?.revision
      ).toBe(7)
      expect(actions.actionMessage.value).toBe('')
      expect(actions.actionError.value).toBe('')
      expect(transport).toHaveBeenCalledTimes(1)
      const fresh = invoke()
      expect(transport).toHaveBeenCalledTimes(2)
      expect(busy.value).toBe(true)
      if (operation === 'save') expect(api.save.mock.calls[1][2]).toBe(7)
      next.resolve(
        record(operation === 'create' ? 'explicit-new' : 'selected', 8)
      )
      await fresh
      expect(busy.value).toBe(false)
      expect(designer.formId.value).toBe(
        operation === 'create' ? 'explicit-new' : 'selected'
      )
      expect(actions.actionMessage.value).toBe(
        operation === 'create' ? '创建成功' : '保存成功'
      )
    }
  )

  it.each(['create', 'save'] as const)(
    'does not let an old %s finally clear the busy state of a newer identity operation',
    async (operation) => {
      const { actions, designer, user } = harness()
      api.detail.mockResolvedValueOnce(record('previous', 3))
      await actions.loadDraft('previous')
      const old = deferred<ReturnType<typeof record>>()
      const next = deferred<ReturnType<typeof record>>()
      const transport = operation === 'create' ? api.create : api.save
      transport
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(next.promise)
      const invoke = () =>
        operation === 'create'
          ? actions.createDraft('明确创建')
          : actions.saveDraft()
      const busy = operation === 'create' ? actions.creating : actions.saving
      const oldPending = invoke()
      setToken('replacement-token')
      user.$patch({
        permissions: ['form:read', 'form:configure', 'form:publish'],
      })
      api.detail.mockResolvedValueOnce(record('current', 5))
      await actions.loadDraft('current')
      designer.ast.value.widgetsConfig = [
        {
          uid: 'current-local',
          type: 'input',
          name: '当前未保存字段',
          config: {},
        },
      ]
      const unsaved = JSON.stringify(designer.ast.value)
      const newPending = invoke()
      expect(busy.value).toBe(true)
      old.resolve(record('stale-result', 99))
      await oldPending
      expect(busy.value).toBe(true)
      expect(designer.formId.value).toBe('current')
      expect(JSON.stringify(designer.ast.value)).toBe(unsaved)
      expect(actions.actionMessage.value).toBe('')
      expect(
        actions.draftChoices.value.find((item) => item.id === 'current')
          ?.revision
      ).toBe(5)
      next.resolve(
        record(operation === 'create' ? 'current-created' : 'current', 6)
      )
      await newPending
      expect(busy.value).toBe(false)
      expect(designer.formId.value).toBe(
        operation === 'create' ? 'current-created' : 'current'
      )
    }
  )

  it('releases token-only pending publish and permits a new explicit attempt without redirecting from the old response', async () => {
    const { actions, designer } = harness()
    api.detail.mockResolvedValueOnce(record('selected', 7))
    await actions.loadDraft('selected')
    designer.ast.value.widgetsConfig = [
      { uid: 'local', type: 'input', name: '未保存字段', config: {} },
    ]
    const unsaved = JSON.stringify(designer.ast.value)
    vi.stubGlobal('window', { location: { assign: api.navigate } })
    const old = deferred<{ id: string }>()
    const next = deferred<{ id: string }>()
    api.application
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise)
    const oldPending = actions.publishCurrent()
    expect(actions.publishing.value).toBe(true)
    setToken('replacement-token-same-user-and-tenant')
    old.resolve({ id: 'stale-app' })
    await oldPending
    expect(actions.publishing.value).toBe(false)
    expect(api.navigate).not.toHaveBeenCalled()
    expect(api.application).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(designer.ast.value)).toBe(unsaved)
    const newPending = actions.publishCurrent()
    expect(actions.publishing.value).toBe(true)
    expect(api.application).toHaveBeenCalledTimes(2)
    next.resolve({ id: 'current-app' })
    await newPending
    expect(actions.publishing.value).toBe(false)
    expect(api.navigate).toHaveBeenCalledExactlyOnceWith(
      '/applications/current-app/configuration'
    )
  })

  it('does not let a stale publish finally clear a newer publishing operation', async () => {
    const { actions, designer, user } = harness()
    api.detail.mockResolvedValueOnce(record('previous'))
    await actions.loadDraft('previous')
    vi.stubGlobal('window', { location: { assign: api.navigate } })
    const old = deferred<{ id: string }>()
    const next = deferred<{ id: string }>()
    api.application
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise)
    const oldPending = actions.publishCurrent()
    setToken('replacement-token')
    user.$patch({
      permissions: ['form:read', 'form:configure', 'form:publish'],
    })
    api.detail.mockResolvedValueOnce(record('current'))
    await actions.loadDraft('current')
    const newPending = actions.publishCurrent()
    old.resolve({ id: 'stale-app' })
    await oldPending
    expect(actions.publishing.value).toBe(true)
    expect(designer.formId.value).toBe('current')
    expect(api.navigate).not.toHaveBeenCalled()
    next.resolve({ id: 'current-app' })
    await newPending
    expect(actions.publishing.value).toBe(false)
    expect(api.navigate).toHaveBeenCalledExactlyOnceWith(
      '/applications/current-app/configuration'
    )
  })

  it('does not continue an old-token preview validation into an API submission and allows a new explicit preview', async () => {
    const { actions } = harness()
    const validation = deferred<boolean>()
    const validate = vi
      .fn()
      .mockReturnValueOnce(validation.promise)
      .mockResolvedValueOnce(true)
    actions.previewRendererRef.value = {
      validate,
      getValues: () => ({ example: 'current input' }),
    }
    const oldPending = actions.submitPreview()
    setToken('replacement-token-same-user-and-tenant')
    validation.resolve(true)
    await oldPending
    expect(api.submit).not.toHaveBeenCalled()
    expect(actions.submittingPreview.value).toBe(false)
    expect(actions.actionMessage.value).toBe('')
    api.submit.mockResolvedValueOnce({ mode: 'preview' })
    await actions.submitPreview()
    expect(api.submit).toHaveBeenCalledTimes(1)
    expect(actions.actionMessage.value).toBe('试提交校验通过（未创建申请）')
    expect(actions.submittingPreview.value).toBe(false)
  })

  it('discards an old preview result without clearing a newer preview submission busy state', async () => {
    const { actions, user } = harness()
    actions.previewRendererRef.value = {
      validate: async () => true,
      getValues: () => ({ example: 'current input' }),
    }
    const old = deferred<{ mode: string }>()
    const next = deferred<{ mode: string }>()
    api.submit
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise)
    const oldPending = actions.submitPreview()
    await Promise.resolve()
    expect(api.submit).toHaveBeenCalledTimes(1)
    setToken('replacement-token')
    user.$patch({
      permissions: ['form:read', 'form:configure', 'form:publish'],
    })
    actions.previewRendererRef.value = {
      validate: async () => true,
      getValues: () => ({ example: 'fresh current identity input' }),
    }
    const newPending = actions.submitPreview()
    await Promise.resolve()
    expect(api.submit).toHaveBeenCalledTimes(2)
    old.resolve({ mode: 'stale-submitted' })
    await oldPending
    expect(actions.submittingPreview.value).toBe(true)
    expect(actions.actionMessage.value).toBe('')
    next.resolve({ mode: 'preview' })
    await newPending
    expect(actions.submittingPreview.value).toBe(false)
    expect(actions.actionMessage.value).toBe('试提交校验通过（未创建申请）')
  })
})
