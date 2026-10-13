import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import QueryResults from '@/components/reporting/query-results.vue'
import type {
  ReportingQueryResultV1,
  ReportingVisibleField,
} from '@af-admin/contracts'

enableAutoUnmount(afterEach)

const visibleFields: ReportingVisibleField[] = [
  {
    reference: { kind: 'metadata', id: 'status' },
    key: 'metadata:status',
    label: '业务状态',
    valueType: 'status',
    searchable: false,
    sortable: true,
  },
  {
    reference: { kind: 'field', id: 'subject' },
    key: 'field:subject',
    label: '申请主题',
    valueType: 'text',
    searchable: true,
    sortable: false,
  },
]
const result = (
  overrides: Partial<ReportingQueryResultV1> = {}
): ReportingQueryResultV1 => ({
  version: 1,
  definitionId: 'fixed-definition-1',
  definitionVersion: 3,
  source: { kind: 'application-records', applicationId: 'application-7' },
  sourceReleaseId: 'fixed-release-2',
  sourceReleaseVersion: 2,
  policyVersion: 1,
  kind: 'detail',
  metric: 'count',
  factTime: 'createdAt',
  timeZone: 'Asia/Shanghai',
  dateRange: { from: '2026-10-01', to: '2026-10-13' },
  queriedAt: '2026-10-13T08:05:00.000Z',
  dataCutoffAt: '2026-10-13T08:04:59.000Z',
  scope: 'current-authorized-records',
  releaseScope: 'fixed-published-source',
  visibleFields,
  hiddenFields: [],
  current: 1,
  pageSize: 10,
  total: 21,
  rows: [
    {
      id: 'record-1',
      values: { 'metadata:status': 'approved', 'field:subject': '办公申请' },
    },
  ],
  trend: [],
  distribution: [],
  ...overrides,
})
const mountResult = (data: ReportingQueryResultV1 = result(), busy = false) =>
  mount(QueryResults, { props: { result: data, busy } })
const detailSelector = '[data-testid="reporting-result-detail"]'
const previousSelector = '[data-testid="reporting-result-previous"]'
const nextSelector = '[data-testid="reporting-result-next"]'

describe('authorized server reporting results', () => {
  it('shows the fixed application release, current authorization scope, timezone and authoritative query metadata', () => {
    const wrapper = mountResult()
    const metadata = wrapper.get('dl').text().replace(/\s+/g, ' ')

    expect(metadata).toContain('application-7 · 来源发布版 2')
    expect(metadata).toContain('fixed-release-2')
    expect(metadata).toContain('仅此固定来源发布版的记录')
    expect(metadata).toContain('当前成员当前有权访问的记录')
    expect(metadata).toContain('按创建时间 createdAt 统计记录数量')
    expect(metadata).toContain('Asia/Shanghai · 2026-10-01 至 2026-10-13')
    expect(metadata).toContain('首尾日期均包含')
    expect(metadata).toContain('查询 2026-10-13T08:05:00.000Z')
    expect(metadata).toContain('数据截止 2026-10-13T08:04:59.000Z')
    expect(metadata).toContain(
      '固定配置 fixed-definition-1 · 版本 3 · 口径版本 1'
    )
    expect(wrapper.get('h2').text()).toContain('当前授权记录 21 条')
  })

  it('renders only the server visible field projection and translates business statuses', () => {
    const wrapper = mountResult(
      result({
        hiddenFields: [
          {
            reference: { kind: 'metadata', id: 'applicantName' },
            reason: 'permission-denied',
          },
        ],
        rows: [
          {
            id: 'authorized-record',
            values: {
              'metadata:status': 'approved',
              'field:subject': '可见主题',
              'metadata:applicantName': 'PRIVATE_APPLICANT',
              'field:privateSalary': 'PRIVATE_SALARY',
            },
          },
        ],
      })
    )
    const detail = wrapper.get(detailSelector)

    expect(detail.findAll('th').map((cell) => cell.text())).toEqual([
      '业务状态',
      '申请主题',
    ])
    expect(detail.findAll('td').map((cell) => cell.text())).toEqual([
      '已通过',
      '可见主题',
    ])
    expect(wrapper.text()).toContain('申请人姓名：当前字段权限不足')
    expect(wrapper.html()).not.toContain('PRIVATE_APPLICANT')
    expect(wrapper.html()).not.toContain('PRIVATE_SALARY')
  })

  it('distinguishes a hidden row field from an authorized null or absent value without leaking a supplied hidden value', () => {
    const wrapper = mountResult(
      result({
        rows: [
          {
            id: 'hidden',
            values: {
              'metadata:status': 'running',
              'field:subject': 'PRIVATE_ROW_VALUE',
            },
            hiddenFieldKeys: ['field:subject'],
          },
          {
            id: 'empty',
            values: { 'metadata:status': 'approved', 'field:subject': null },
          },
          { id: 'absent', values: { 'metadata:status': 'rejected' } },
        ],
      })
    )
    const rows = wrapper.get(detailSelector).findAll('tbody tr')

    expect(rows[0].findAll('td').map((cell) => cell.text())).toEqual([
      '审批中',
      '此记录字段不可见',
    ])
    expect(rows[1].findAll('td').map((cell) => cell.text())).toEqual([
      '已通过',
      '未填写',
    ])
    expect(rows[2].findAll('td').map((cell) => cell.text())).toEqual([
      '已驳回',
      '未填写',
    ])
    expect(wrapper.html()).not.toContain('PRIVATE_ROW_VALUE')
  })

  it('preserves authorized zero and false values while refusing to serialize object or array contents', () => {
    const wrapper = mountResult(
      result({
        visibleFields: [visibleFields[1]],
        rows: [
          { id: 'zero', values: { 'field:subject': 0 } },
          { id: 'false', values: { 'field:subject': false } },
          {
            id: 'object',
            values: { 'field:subject': { nested: 'PRIVATE_OBJECT' } },
          },
          { id: 'array', values: { 'field:subject': ['PRIVATE_ARRAY'] } },
        ],
      })
    )

    expect(
      wrapper
        .get(detailSelector)
        .findAll('td')
        .map((cell) => cell.text())
    ).toEqual(['0', 'false', '字段格式当前不可显示', '字段格式当前不可显示'])
    expect(wrapper.html()).not.toContain('PRIVATE_OBJECT')
    expect(wrapper.html()).not.toContain('PRIVATE_ARRAY')
  })

  it('renders permitted text as text rather than executing HTML', () => {
    const value = '<img src=x onerror="privateValue()">'
    const wrapper = mountResult(
      result({
        visibleFields: [visibleFields[1]],
        rows: [{ id: 'text', values: { 'field:subject': value } }],
      })
    )

    expect(wrapper.get(detailSelector).get('td').text()).toBe(value)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('explains field capabilities and every server hiding reason without exposing private business field identifiers', () => {
    const wrapper = mountResult(
      result({
        hiddenFields: [
          {
            reference: { kind: 'metadata', id: 'applicantName' },
            reason: 'permission-denied',
          },
          {
            reference: { kind: 'field', id: 'privateScopeField' },
            reason: 'scope-denied',
          },
          {
            reference: { kind: 'field', id: 'privateUnavailableField' },
            reason: 'source-unavailable',
          },
          {
            reference: { kind: 'field', id: 'privateUnsupportedField' },
            reason: 'unsupported',
          },
        ],
      })
    )
    const explanations = wrapper
      .get('.reporting-record')
      .text()
      .replace(/\s+/g, ' ')

    expect(explanations).toContain('业务状态 · 不可搜索 · 允许排序')
    expect(explanations).toContain('申请主题 · 允许搜索 · 不可排序')
    expect(explanations).toContain('申请人姓名：当前字段权限不足')
    expect(explanations).toContain('业务字段：当前成员字段范围不足')
    expect(explanations).toContain('业务字段：固定来源字段当前不可用')
    expect(explanations).toContain('业务字段：当前字段类型尚不支持')
    expect(wrapper.html()).not.toContain('privateScopeField')
    expect(wrapper.html()).not.toContain('privateUnavailableField')
    expect(wrapper.html()).not.toContain('privateUnsupportedField')
  })

  it('displays server daily counts without deriving them from detail rows or rendering another result kind', () => {
    const wrapper = mountResult(
      result({
        kind: 'trend',
        total: 77,
        rows: [
          {
            id: 'unused-detail',
            values: { 'field:subject': 'PRIVATE_UNRENDERED_ROW' },
          },
        ],
        trend: [
          { date: '2026-10-01', count: 4 },
          { date: '2026-10-02', count: 0 },
        ],
        distribution: [{ status: 'approved', count: 999 }],
      })
    )
    const trend = wrapper.get('[data-testid="reporting-result-trend"]')

    expect(
      trend
        .findAll('tbody tr')
        .map((row) => row.findAll('td').map((cell) => cell.text()))
    ).toEqual([
      ['2026-10-01', '4'],
      ['2026-10-02', '0'],
    ])
    expect(trend.findAll('circle title').map((title) => title.text())).toEqual([
      '2026-10-01：4 条',
      '2026-10-02：0 条',
    ])
    expect(wrapper.get('h2').text()).toContain('当前授权记录 77 条')
    expect(wrapper.find(detailSelector).exists()).toBe(false)
    expect(
      wrapper.find('[data-testid="reporting-result-distribution"]').exists()
    ).toBe(false)
    expect(wrapper.html()).not.toContain('PRIVATE_UNRENDERED_ROW')
  })

  it.each([
    [{ date: '2026-10-01', count: 0 }],
    [
      { date: '2026-10-01', count: 0 },
      { date: '2026-10-02', count: 0 },
    ],
  ])('keeps zero-count and single-day server trends finite', (...trend) => {
    const wrapper = mountResult(result({ kind: 'trend', total: 0, trend }))
    const chart = wrapper.get('svg')

    expect(chart.attributes('role')).toBe('img')
    expect(chart.attributes('aria-label')).toBe('服务端记录数量按日趋势')
    expect(chart.get('polyline').attributes('points')).not.toMatch(
      /NaN|Infinity/
    )
    expect(chart.findAll('circle')).toHaveLength(trend.length)
    chart.findAll('circle').forEach((point) => {
      expect(Number.isFinite(Number(point.attributes('cx')))).toBe(true)
      expect(Number.isFinite(Number(point.attributes('cy')))).toBe(true)
    })
  })

  it('displays only returned server distribution buckets and counts', () => {
    const wrapper = mountResult(
      result({
        kind: 'distribution',
        total: 77,
        distribution: [
          { status: 'approved', count: 4 },
          { status: 'withdrawn', count: 0 },
        ],
        trend: [{ date: '2026-10-01', count: 999 }],
      })
    )
    const distribution = wrapper.get(
      '[data-testid="reporting-result-distribution"]'
    )

    expect(distribution.findAll('li').map((item) => item.text())).toEqual([
      '已通过4 条',
      '已撤回0 条',
    ])
    expect(
      distribution
        .findAll('.reporting-bar')
        .map((bar) => bar.attributes('aria-label'))
    ).toEqual(['已通过 4 条', '已撤回 0 条'])
    expect(wrapper.find(detailSelector).exists()).toBe(false)
    expect(
      wrapper.find('[data-testid="reporting-result-trend"]').exists()
    ).toBe(false)
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it.each(['detail', 'trend', 'distribution'] as const)(
    'shows an authorized empty %s result without fabricated rows or a download action',
    (kind) => {
      const wrapper = mountResult(
        result({ kind, total: 0, rows: [], trend: [], distribution: [] })
      )

      expect(wrapper.get('[data-testid="reporting-result-empty"]').text()).toBe(
        '此日期闭区间内没有当前可访问的记录。'
      )
      expect(wrapper.findAll('tbody tr')).toHaveLength(0)
      expect(wrapper.findAll('circle')).toHaveLength(0)
      expect(wrapper.findAll('.reporting-bars li')).toHaveLength(0)
      expect(wrapper.find('a[download]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('导出成功')
      if (kind === 'detail') {
        expect(wrapper.get(previousSelector).element.matches(':disabled')).toBe(
          true
        )
        expect(wrapper.get(nextSelector).element.matches(':disabled')).toBe(
          true
        )
      }
    }
  )

  it.each([
    [1, 21, true, false],
    [2, 21, false, false],
    [3, 21, false, true],
    [2, 20, false, true],
  ] as const)(
    'uses authoritative page %s and total %s to bound navigation',
    async (current, total, previousDisabled, nextDisabled) => {
      const data = result({ current, total })
      const wrapper = mountResult(data)
      const previous = wrapper.get(previousSelector)
        .element as HTMLButtonElement
      const next = wrapper.get(nextSelector).element as HTMLButtonElement

      expect(previous.disabled).toBe(previousDisabled)
      expect(next.disabled).toBe(nextDisabled)
      previous.click()
      next.click()
      await nextTick()

      const expected = []
      if (!previousDisabled) expected.push([current - 1])
      if (!nextDisabled) expected.push([current + 1])
      expect(wrapper.emitted('page') || []).toEqual(expected)
      expect(data.current).toBe(current)
      expect(wrapper.get(detailSelector).findAll('tbody tr')).toHaveLength(1)
    }
  )

  it('disables both page commands while busy and resumes against refreshed server pagination', async () => {
    const wrapper = mountResult(result({ current: 2, total: 21 }), true)
    const previous = wrapper.get(previousSelector).element as HTMLButtonElement
    const next = wrapper.get(nextSelector).element as HTMLButtonElement
    expect(previous.disabled).toBe(true)
    expect(next.disabled).toBe(true)
    previous.click()
    next.click()
    await nextTick()
    expect(wrapper.emitted('page')).toBeUndefined()

    await wrapper.setProps({
      busy: false,
      result: result({ current: 3, total: 21 }),
    })
    expect(previous.disabled).toBe(false)
    expect(next.disabled).toBe(true)
    previous.click()
    await nextTick()
    expect(wrapper.emitted('page')).toEqual([[2]])
  })
})
