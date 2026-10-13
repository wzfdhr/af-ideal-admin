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
}))
vi.mock('../../config/data-mode', () => ({ dataMode: 'reference' }))
vi.mock('@/api/form-schema', () => ({
  fetchFormSchemas: api.list,
  getFormSchemaDetail: api.detail,
  saveFormSchema: api.save,
  createFormSchema: api.create,
  getFormApplication: vi.fn(),
  publishFormSchema: vi.fn(),
  submitFormRuntime: vi.fn(),
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
})
