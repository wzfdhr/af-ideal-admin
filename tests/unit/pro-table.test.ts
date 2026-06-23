import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import ProTable from '@/components/pro-table/index.vue'
import type { PropType } from 'vue'

vi.mock('@/components/pro-ui', () => ({
  adminUi: {
    Table: defineComponent({
      name: 'MockAdminTable',
      props: {
        columns: {
          type: Array as PropType<unknown[]>,
          default: () => [],
        },
        data: {
          type: Array as PropType<unknown[]>,
          default: () => [],
        },
        loading: {
          type: Boolean,
          default: false,
        },
        pagination: {
          type: Object as PropType<{ total?: number }>,
          default: () => ({}),
        },
        rowKey: {
          type: String,
          default: '',
        },
      },
      emits: ['page-change', 'page-size-change'],
      setup(props, { emit }) {
        return () =>
          h('div', { 'data-testid': 'table' }, [
            h('span', { 'data-testid': 'loading' }, String(props.loading)),
            h(
              'span',
              { 'data-testid': 'total' },
              String((props.pagination as { total?: number })?.total || 0)
            ),
            h(
              'button',
              {
                'data-testid': 'page-2',
                'onClick': () => emit('page-change', 2),
              },
              'page 2'
            ),
            h(
              'button',
              {
                'data-testid': 'size-20',
                'onClick': () => emit('page-size-change', 20),
              },
              'size 20'
            ),
          ])
      },
    }),
  },
}))

const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
  await nextTick()
}

const mountTable = (
  fetchData = vi.fn().mockResolvedValue({ list: [], total: 0 })
) =>
  mount(ProTable, {
    props: {
      rowKey: 'id',
      columns: [],
      fetchData,
    },
  })

describe('ProTable', () => {
  it('calls fetchData on mount', async () => {
    const fetchData = vi.fn().mockResolvedValue({ list: [], total: 0 })

    mountTable(fetchData)

    await settle()
    expect(fetchData).toHaveBeenCalledWith({
      current: 1,
      pageSize: 10,
      filters: {},
    })
  })

  it('reloads data when the page changes', async () => {
    const fetchData = vi
      .fn()
      .mockResolvedValueOnce({ list: [], total: 20 })
      .mockResolvedValueOnce({ list: [{ id: 2 }], total: 20 })
    const wrapper = mountTable(fetchData)

    await settle()
    await wrapper.find('[data-testid="page-2"]').trigger('click')
    await settle()

    expect(fetchData).toHaveBeenLastCalledWith({
      current: 2,
      pageSize: 10,
      filters: {},
    })
  })

  it('resets to the first page with query filters', async () => {
    const fetchData = vi.fn().mockResolvedValue({ list: [], total: 0 })
    const wrapper = mountTable(fetchData)

    await settle()
    await (
      wrapper.vm as unknown as {
        reset: (filters?: Record<string, unknown>) => Promise<void>
      }
    ).reset({ status: 'enabled' })

    expect(fetchData).toHaveBeenLastCalledWith({
      current: 1,
      pageSize: 10,
      filters: { status: 'enabled' },
    })
  })

  it('renders a stable empty state when no rows are returned', async () => {
    const fetchData = vi.fn().mockResolvedValue({ list: [], total: 0 })
    const wrapper = mount(ProTable, {
      props: {
        rowKey: 'id',
        columns: [],
        fetchData,
        emptyText: 'No records',
      },
    })

    await settle()

    expect(wrapper.find('[data-testid="pro-table-empty"]').text()).toBe(
      'No records'
    )
  })
})
