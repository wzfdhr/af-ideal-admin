import { describe, expect, it } from 'vitest'
import {
  buildDataScreenAlertFacts,
  dataScreenAlertSourceName,
  emptySourceRuntime,
  type SourceRuntimeState,
} from '@/components/data-screen/reference/runtime'
import type {
  BusinessRecordStatus,
  DataScreenSourceRunResultV1,
  ReportingKind,
} from '@af-admin/contracts'

const state = ({
  sourceKey,
  kind,
  count,
  queryStatuses = [],
  from = '2026-10-13',
  to = '2026-10-13',
  queriedAt = '2026-10-13T12:00:00.000Z',
}: {
  sourceKey: string
  kind: ReportingKind
  count: number
  queryStatuses?: BusinessRecordStatus[]
  from?: string
  to?: string
  queriedAt?: string
}): SourceRuntimeState => {
  const source: DataScreenSourceRunResultV1 = {
    sourceKey,
    reportDefinitionVersionId: `${sourceKey}-v1`,
    actualQuery: {
      version: 1,
      timeZone: 'America/New_York',
      dateRange: { from, to },
      statuses: queryStatuses,
      keyword: '',
      searchFields: [],
      sort: {
        field: { kind: 'metadata', id: 'createdAt' },
        direction: 'desc',
      },
      current: 1,
      pageSize: 100,
    },
    status: count ? 'ready' : 'empty',
    errorCode: null,
    queriedAt,
    dataCutoffAt: queriedAt,
    result: {
      version: 1,
      definitionId: sourceKey,
      definitionVersion: 1,
      source: { kind: 'application-records', applicationId: 'sales-app' },
      sourceReleaseId: 'sales-release',
      sourceReleaseVersion: 1,
      policyVersion: 1,
      kind,
      metric: 'count',
      factTime: 'createdAt',
      timeZone: 'America/New_York',
      dateRange: { from, to },
      queriedAt,
      dataCutoffAt: queriedAt,
      scope: 'current-authorized-records',
      releaseScope: 'fixed-published-source',
      visibleFields: [],
      hiddenFields: [],
      current: 1,
      pageSize: 100,
      total: count,
      rows: [],
      trend: [],
      distribution: [{ status: queryStatuses[0] || 'draft', count }],
    },
  }
  return {
    phase: count ? 'ready' : 'empty',
    refreshing: false,
    stale: false,
    lastSuccessAt: queriedAt,
    dataCutoffAt: queriedAt,
    message: '',
    source,
  }
}

describe('data screen alert facts', () => {
  it('deduplicates three report views of the same six-record collection instead of claiming eighteen records', () => {
    const facts = buildDataScreenAlertFacts(
      [
        state({ sourceKey: 'trend', kind: 'trend', count: 6 }),
        state({ sourceKey: 'distribution', kind: 'distribution', count: 6 }),
        state({
          sourceKey: 'detail',
          kind: 'detail',
          count: 6,
          queriedAt: '2026-10-13T12:00:02.000Z',
        }),
      ],
      ['draft']
    )
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({
      applicationId: 'sales-app',
      sourceReleaseId: 'sales-release',
      count: 6,
      queriedAt: '2026-10-13T12:00:02.000Z',
    })
  })

  it('keeps different status filters and natural date windows as separate potentially overlapping facts', () => {
    const facts = buildDataScreenAlertFacts(
      [
        state({
          sourceKey: 'today-draft',
          kind: 'distribution',
          count: 2,
          queryStatuses: ['draft'],
        }),
        state({
          sourceKey: 'week-running',
          kind: 'distribution',
          count: 4,
          queryStatuses: ['running'],
          from: '2026-10-07',
        }),
      ],
      ['draft', 'running']
    )
    expect(facts).toHaveLength(2)
    expect(facts.map((fact) => fact.count).sort()).toEqual([2, 4])
    expect(new Set(facts.map((fact) => fact.collectionKey)).size).toBe(2)
  })

  it('does not expose an alert fact for a permission-error source whose old result was cleared', () => {
    const rights = {
      ...emptySourceRuntime(),
      phase: 'rights' as const,
      message: '当前身份无权读取该来源，已清除旧数据',
    }
    expect(
      buildDataScreenAlertFacts(
        [state({ sourceKey: 'detail', kind: 'detail', count: 6 }), rights],
        ['draft']
      )
    ).toHaveLength(1)
    expect(buildDataScreenAlertFacts([rights], ['draft'])).toEqual([])
  })

  it('uses the bound published report name and falls back to a business widget title instead of a raw source UUID', () => {
    const [fact] = buildDataScreenAlertFacts(
      [state({ sourceKey: 'detail', kind: 'detail', count: 6 })],
      ['draft']
    )
    const definition = {
      version: 1 as const,
      title: '销售大屏',
      theme: { preset: 'enterprise' as const, brandColor: '#722ED1' },
      sources: [
        {
          sourceKey: 'detail',
          reportDefinitionVersionId: 'sales-detail-v1',
          dateWindow: 'today' as const,
          statuses: [],
          refreshSeconds: 15,
        },
      ],
      widgets: [
        {
          id: 'detail',
          kind: 'table' as const,
          title: '销售订单授权明细',
          sourceKey: 'detail',
          layout: { x: 0, y: 0, width: 640, height: 400, z: 0 },
          props: {
            view: 'detail' as const,
            columns: [{ kind: 'metadata' as const, id: 'id' as const }],
            maxRows: 100,
            scrollingPaused: true,
          },
        },
      ],
      alert: {
        enabled: true,
        statuses: ['draft' as const],
        countThreshold: 1,
        scrollingPaused: true,
      },
    }
    const reports = [
      {
        id: 'sales-detail-v1',
        definitionId: 'sales-detail',
        version: 1,
        schema: {
          version: 1 as const,
          name: '销售订单明细报表',
          source: {
            kind: 'application-records' as const,
            applicationId: 'sales-app',
          },
          kind: 'detail' as const,
          metric: 'count' as const,
          factTime: 'createdAt' as const,
          timeZone: 'America/New_York',
          fields: [{ kind: 'metadata' as const, id: 'id' as const }],
        },
        sourceReleaseId: 'sales-release',
        sourceReleaseVersion: 1,
        contentHash: 'hash',
        publishedBy: 'admin',
        publishedAt: '2026-10-13T12:00:00.000Z',
      },
    ]
    expect(dataScreenAlertSourceName(fact, definition, reports)).toBe(
      '销售订单明细报表'
    )
    expect(dataScreenAlertSourceName(fact, definition, [])).toBe(
      '销售订单授权明细'
    )
  })
})
