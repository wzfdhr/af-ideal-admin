/* eslint-disable vue/one-component-per-file */
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { beforeEach, expect, it, vi } from 'vitest'
import { setToken } from '@/services/auth'
import { useUserStore } from '@/store'
import Manager from '@/components/form-data-source-manager.vue'
import type { PropType } from 'vue'
import type { TableColumnData } from '@arco-design/web-vue'

const calls = vi.hoisted(() => ({
  query: vi.fn(),
  fetch: vi.fn(),
  detail: vi.fn(),
  save: vi.fn(),
  dictionaries: vi.fn(),
  reload: vi.fn().mockResolvedValue(undefined),
  notice: vi.fn(),
  reset: vi.fn().mockResolvedValue(undefined),
  record: { id: 'source-a' },
}))
vi.mock('@/api/form-data-sources', () => ({
  fetchFormDataSources: calls.fetch,
  getFormDataSource: calls.detail,
  saveFormDataSource: calls.save,
  queryFormDataSource: calls.query,
}))
vi.mock('@/api/system/dictionary', () => ({
  fetchSystemDictionaries: calls.dictionaries,
}))
vi.mock('@/components/pro-ui', async () => {
  const vue = await import('vue')
  return {
    adminUi: {
      Message: { success: calls.notice },
      Modal: vue.defineComponent({
        setup: (_, ctx) => () => vue.h('section', {}, ctx.slots.default?.()),
      }),
    },
  }
})
vi.mock('@/components/pro-table/index.vue', async () => {
  const vue = await import('vue')
  return {
    default: vue.defineComponent({
      name: 'SourceTable',
      props: {
        fetchData: { type: Function, required: true },
        columns: {
          type: Array as PropType<TableColumnData[]>,
          default: () => [],
        },
      },
      setup: (props, ctx) => {
        ctx.expose({ reset: calls.reset, reload: calls.reload })
        return () =>
          vue.h(
            'div',
            {},
            (props.columns as TableColumnData[]).at(-1)?.render?.({
              record: calls.record,
              column: {} as TableColumnData,
              rowIndex: 0,
            })
          )
      },
    }),
  }
})
const Button = defineComponent({
  inheritAttrs: false,
  setup: (_, ctx) => () => h('button', ctx.attrs, ctx.slots.default?.()),
})
it('clears source preview on tenant change and discards already pending source replies', async () => {
  const pinia = createPinia()
  const user = useUserStore(pinia)
  user.$patch({
    id: 'shared',
    tenantId: 'tenant-a',
    permissions: ['form-source:list', 'form-source:read', 'system:dict:read'],
  })
  let resolveOld: ((value: unknown) => void) | undefined
  calls.query.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve
      })
  )
  const wrapper = mount(Manager, {
    global: { plugins: [pinia], stubs: { PermissionButton: Button } },
  })
  const query = () => {
    const button = wrapper
      .findAll('button')
      .find((value) => value.text() === '查询预览')
    if (!button) throw new Error('Actual source query button must be rendered')
    return button
  }
  await query().trigger('click')
  user.$patch({ tenantId: 'tenant-b' })
  await flushPromises()
  expect(calls.reset).toHaveBeenCalledWith({})
  expect(resolveOld).toBeTypeOf('function')
  resolveOld?.({
    sourceRevision: 1,
    dictionaryRevision: 2,
    options: [{ label: 'A private label', value: 'a' }],
  })
  await flushPromises()
  expect(wrapper.find('[data-testid="form-source-preview"]').exists()).toBe(
    false
  )
  calls.record.id = 'source-b'
  calls.query.mockResolvedValueOnce({
    sourceRevision: 1,
    dictionaryRevision: 1,
    options: [{ label: 'B current label', value: 'b' }],
  })
  await query().trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="form-source-preview"]').text()).toContain(
    'B current label'
  )
  expect(wrapper.text()).not.toContain('A private label')
  wrapper.unmount()
})

it('searches a unique source code through table filters and keeps pagination bounded without accepting old identity replies', async () => {
  const pinia = createPinia()
  const user = useUserStore(pinia)
  user.$patch({
    id: 'a-admin',
    tenantId: 'tenant-a',
    permissions: ['form-source:list'],
  })
  const wrapper = mount(Manager, {
    global: { plugins: [pinia], stubs: { PermissionButton: Button } },
  })
  await wrapper.get('[aria-label="搜索数据源"]').setValue(' source-unique ')
  await wrapper.find('form').trigger('submit')
  expect(calls.reset).toHaveBeenLastCalledWith({ keyword: 'source-unique' })
  const fetchData = wrapper
    .getComponent({ name: 'SourceTable' })
    .props('fetchData')
  calls.fetch.mockResolvedValueOnce({
    list: [{ id: 'source-unique' }],
    total: 1,
  })
  expect(
    await fetchData({
      current: 3,
      pageSize: 20,
      filters: { keyword: 'source-unique' },
    })
  ).toEqual({ list: [{ id: 'source-unique' }], total: 1 })
  expect(calls.fetch).toHaveBeenLastCalledWith({
    current: 3,
    pageSize: 20,
    keyword: 'source-unique',
  })
  let resolveOld!: (value: unknown) => void
  calls.fetch.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve
    })
  )
  const pending = fetchData({ current: 1, pageSize: 1000, filters: {} })
  expect(calls.fetch).toHaveBeenLastCalledWith({
    current: 1,
    pageSize: 100,
    keyword: '',
  })
  user.$patch({ tenantId: 'tenant-b' })
  await flushPromises()
  expect(
    (wrapper.get('[aria-label="搜索数据源"]').element as HTMLInputElement).value
  ).toBe('')
  resolveOld({ list: [{ id: 'private-source-a' }], total: 1 })
  expect(await pending).toEqual({ list: [], total: 0 })
  wrapper.unmount()
})

it('does not reopen a previous identity source editor from a delayed detail reply', async () => {
  const pinia = createPinia()
  const user = useUserStore(pinia)
  user.$patch({
    id: 'a-admin',
    tenantId: 'tenant-a',
    permissions: ['form-source:list', 'form-source:update', 'system:dict:read'],
  })
  let resolveOld!: (value: unknown) => void
  calls.detail.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve
    })
  )
  const wrapper = mount(Manager, {
    global: { plugins: [pinia], stubs: { PermissionButton: Button } },
  })
  const edit = wrapper
    .findAll('button')
    .find((button) => button.text() === '维护数据源')
  if (!edit) throw new Error('Source editor action must exist')
  await edit.trigger('click')
  user.$patch({ tenantId: 'tenant-b' })
  await flushPromises()
  resolveOld({
    id: 'old',
    code: 'old-code',
    name: 'private-name',
    dictionaryId: 'private-dictionary',
    kind: 'dictionary',
    status: 'enabled',
    revision: 2,
    description: '',
  })
  await flushPromises()
  expect(
    (wrapper.get('[aria-label="数据源名称"]').element as HTMLInputElement).value
  ).toBe('')
  expect(wrapper.text()).not.toContain('private-name')
  wrapper.unmount()
})

const sourceRecord = (id: string) => ({
  id,
  code: `code-${id}`,
  name: `名称-${id}`,
  kind: 'dictionary',
  dictionaryId: `dictionary-${id}`,
  status: 'enabled',
  description: '',
  revision: 2,
})
const deferredSource = () => {
  let resolve!: (value: any) => void
  const promise = new Promise<any>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const sourceHarness = () => {
  const pinia = createPinia()
  const user = useUserStore(pinia)
  user.$patch({
    id: 'a-admin',
    tenantId: 'tenant-a',
    permissions: ['form-source:list', 'form-source:update', 'system:dict:read'],
  })
  const wrapper = mount(Manager, {
    global: { plugins: [pinia], stubs: { PermissionButton: Button } },
  })
  const action = (label: string) => {
    const button = wrapper
      .findAll('button')
      .find((item) => item.text() === label)
    if (!button) throw new Error(`Missing actual button: ${label}`)
    return button
  }
  return { wrapper, user, action }
}
beforeEach(() => {
  vi.clearAllMocks()
  setToken('source-original-token')
})

it('discards token-only stale source list, editor lookup, dictionary lookup and preview replies without starting follow-up requests', async () => {
  const { wrapper, action } = sourceHarness()
  const detail = deferredSource()
  const dictionaries = deferredSource()
  const preview = deferredSource()
  const list = deferredSource()
  calls.detail.mockReturnValueOnce(detail.promise)
  calls.dictionaries.mockReturnValueOnce(dictionaries.promise)
  calls.query.mockReturnValueOnce(preview.promise)
  calls.fetch.mockReturnValueOnce(list.promise)
  await wrapper.get('[aria-label="数据源名称"]').setValue('当前未保存输入')
  await action('维护数据源').trigger('click')
  await action('搜索关联字典').trigger('click')
  await action('查询预览').trigger('click')
  const fetchData = wrapper
    .getComponent({ name: 'SourceTable' })
    .props('fetchData')
  const pendingList = fetchData({ current: 1, pageSize: 20, filters: {} })
  setToken('source-replacement-token')
  detail.resolve(sourceRecord('stale'))
  dictionaries.resolve({
    list: [{ id: 'private-dictionary', dictName: '旧字典私密内容' }],
    total: 1,
  })
  preview.resolve({
    sourceRevision: 1,
    dictionaryRevision: 1,
    options: [{ label: '旧预览私密内容', value: 'private' }],
  })
  list.resolve({ list: [sourceRecord('stale')], total: 1 })
  expect(await pendingList).toEqual({ list: [], total: 0 })
  await flushPromises()
  expect(
    (wrapper.get('[aria-label="数据源名称"]').element as HTMLInputElement).value
  ).toBe('当前未保存输入')
  expect(wrapper.text()).not.toContain('旧字典私密内容')
  expect(wrapper.text()).not.toContain('旧预览私密内容')
  expect(wrapper.find('[data-testid="form-source-preview"]').exists()).toBe(
    false
  )
  expect(calls.detail).toHaveBeenCalledTimes(1)
  expect(calls.dictionaries).toHaveBeenCalledTimes(1)
  expect(calls.query).toHaveBeenCalledTimes(1)
  expect(calls.fetch).toHaveBeenCalledTimes(1)
  expect(calls.reload).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('releases token-only stale source save without changing the editor or reloading under the new token, preserving the retry key', async () => {
  const { wrapper, action } = sourceHarness()
  calls.detail.mockResolvedValueOnce(sourceRecord('selected'))
  await action('维护数据源').trigger('click')
  await flushPromises()
  const old = deferredSource()
  const next = deferredSource()
  calls.save.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
  await wrapper.findAll('form')[1].trigger('submit')
  expect(calls.save).toHaveBeenCalledTimes(1)
  setToken('source-replacement-token')
  old.resolve(sourceRecord('selected'))
  await flushPromises()
  expect(calls.reload).not.toHaveBeenCalled()
  expect(calls.notice).not.toHaveBeenCalled()
  expect(calls.save).toHaveBeenCalledTimes(1)
  expect(
    (wrapper.get('[aria-label="数据源名称"]').element as HTMLInputElement).value
  ).toBe('名称-selected')
  expect(action('保存数据源').attributes('disabled')).toBeUndefined()
  await wrapper.findAll('form')[1].trigger('submit')
  expect(calls.save).toHaveBeenCalledTimes(2)
  expect(calls.save.mock.calls[1][1]).toBe(calls.save.mock.calls[0][1])
  next.resolve(sourceRecord('selected'))
  await flushPromises()
  expect(calls.reload).toHaveBeenCalledTimes(1)
  expect(calls.notice).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})

it('does not let an old identity save callback overwrite a newer editor or release its pending save', async () => {
  const { wrapper, user, action } = sourceHarness()
  calls.detail.mockResolvedValueOnce(sourceRecord('old'))
  await action('维护数据源').trigger('click')
  await flushPromises()
  const old = deferredSource()
  const next = deferredSource()
  calls.save.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
  await wrapper.findAll('form')[1].trigger('submit')
  setToken('source-replacement-token')
  user.$patch({
    permissions: [
      'form-source:list',
      'form-source:update',
      'system:dict:read',
      'form-source:create',
    ],
  })
  await flushPromises()
  calls.detail.mockResolvedValueOnce(sourceRecord('new'))
  await action('维护数据源').trigger('click')
  await flushPromises()
  await wrapper.findAll('form')[1].trigger('submit')
  expect(calls.save).toHaveBeenCalledTimes(2)
  old.resolve(sourceRecord('old'))
  await flushPromises()
  expect(action('保存中…').attributes('disabled')).toBeDefined()
  expect(
    (wrapper.get('[aria-label="数据源名称"]').element as HTMLInputElement).value
  ).toBe('名称-new')
  expect(calls.reload).not.toHaveBeenCalled()
  expect(calls.notice).not.toHaveBeenCalled()
  next.resolve(sourceRecord('new'))
  await flushPromises()
  expect(action('保存数据源').attributes('disabled')).toBeUndefined()
  expect(calls.reload).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})

it('suppresses an old-token source list rejection instead of surfacing it in the current table', async () => {
  const { wrapper } = sourceHarness()
  calls.fetch.mockRejectedValueOnce(
    new Error('stale previous session list error')
  )
  const fetchData = wrapper
    .getComponent({ name: 'SourceTable' })
    .props('fetchData')
  const pending = fetchData({ current: 1, pageSize: 20, filters: {} })
  setToken('replacement-token')
  await expect(pending).resolves.toEqual({ list: [], total: 0 })
  expect(calls.fetch).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})
