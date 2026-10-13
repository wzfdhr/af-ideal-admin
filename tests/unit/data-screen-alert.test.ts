import { describe, expect, it } from 'vitest'
import {
  buildDataScreenAlertFacts,
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
})
