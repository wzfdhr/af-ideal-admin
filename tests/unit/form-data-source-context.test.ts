/* eslint-disable vue/one-component-per-file */
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { expect, it, vi } from 'vitest'
import { useUserStore } from '@/store'
import Manager from '@/components/form-data-source-manager.vue'
import type { PropType } from 'vue'
import type { TableColumnData } from '@arco-design/web-vue'

const calls = vi.hoisted(() => ({
  query: vi.fn(),
  fetch: vi.fn(),
  detail: vi.fn(),
  reset: vi.fn().mockResolvedValue(undefined),
  record: { id: 'source-a' },
}))
vi.mock('@/api/form-data-sources', () => ({
  fetchFormDataSources: calls.fetch,
  getFormDataSource: calls.detail,
  saveFormDataSource: vi.fn(),
  queryFormDataSource: calls.query,
}))
vi.mock('@/api/system/dictionary', () => ({ fetchSystemDictionaries: vi.fn() }))
vi.mock('@/components/pro-ui', async () => {
  const vue = await import('vue')
  return {
    adminUi: {
      Message: { success: vi.fn() },
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
        ctx.expose({ reset: calls.reset })
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
