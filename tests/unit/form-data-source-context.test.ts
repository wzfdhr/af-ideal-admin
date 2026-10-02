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
  reset: vi.fn().mockResolvedValue(undefined),
  record: { id: 'source-a' },
}))
vi.mock('@/api/form-data-sources', () => ({
  fetchFormDataSources: vi.fn(),
  getFormDataSource: vi.fn(),
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
      props: {
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
