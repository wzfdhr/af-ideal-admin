import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ScreenWidget from '@/components/data-screen/reference/widget.vue'
import type {
  DataScreenMapWidget,
  DataScreenSourceRunResultV1,
  ReportingQueryResultV1,
} from '@af-admin/contracts'

const longitude = { kind: 'field' as const, id: 'longitude' }
const latitude = { kind: 'field' as const, id: 'latitude' }
const widget: DataScreenMapWidget = {
  id: 'map',
  kind: 'map',
  title: '真实地图',
  sourceKey: 'detail',
  layout: { x: 0, y: 0, width: 640, height: 400, z: 0 },
  props: {
    view: 'coordinates',
    longitudeField: longitude,
    latitudeField: latitude,
    maxPoints: 100,
  },
}
const result: ReportingQueryResultV1 = {
  version: 1,
  definitionId: 'detail',
  definitionVersion: 1,
  source: { kind: 'application-records', applicationId: 'sales' },
  sourceReleaseId: 'sales-release',
  sourceReleaseVersion: 1,
  policyVersion: 1,
  kind: 'detail',
  metric: 'count',
  factTime: 'createdAt',
  timeZone: 'UTC',
  dateRange: { from: '2026-10-12', to: '2026-10-12' },
  queriedAt: '2026-10-12T12:00:00.000Z',
  dataCutoffAt: '2026-10-12T11:59:59.000Z',
  scope: 'current-authorized-records',
  releaseScope: 'fixed-published-source',
  visibleFields: [
    {
      reference: longitude,
      key: 'field:longitude',
      label: '经度',
      valueType: 'coordinate',
      coordinateAxis: 'longitude',
      searchable: false,
      sortable: false,
    },
    {
      reference: latitude,
      key: 'field:latitude',
      label: '纬度',
      valueType: 'coordinate',
      coordinateAxis: 'latitude',
      searchable: false,
      sortable: false,
    },
  ],
  hiddenFields: [],
  current: 1,
  pageSize: 100,
  total: 8,
  rows: [
    { id: 'zero', values: { 'field:longitude': 0, 'field:latitude': 0 } },
    {
      id: 'canonical-string',
      values: { 'field:longitude': '-73.5', 'field:latitude': '40.2' },
    },
    {
      id: 'null',
      values: { 'field:longitude': null, 'field:latitude': null },
    },
    { id: 'empty', values: { 'field:longitude': '', 'field:latitude': '' } },
    {
      id: 'whitespace',
      values: { 'field:longitude': ' 1', 'field:latitude': '2 ' },
    },
    {
      id: 'non-canonical',
      values: { 'field:longitude': '01', 'field:latitude': '1e2' },
    },
    {
      id: 'bounds',
      values: { 'field:longitude': 181, 'field:latitude': 91 },
    },
    {
      id: 'hidden',
      values: { 'field:longitude': 12, 'field:latitude': 24 },
      hiddenFieldKeys: ['field:longitude'],
    },
  ],
  trend: [],
  distribution: [],
}
const source: DataScreenSourceRunResultV1 = {
  sourceKey: 'detail',
  reportDefinitionVersionId: 'detail-v1',
  actualQuery: null,
  status: 'ready',
  errorCode: null,
  queriedAt: result.queriedAt,
  dataCutoffAt: result.dataCutoffAt,
  result,
}

describe('real data screen map', () => {
  it('renders only authorized finite bounded coordinates and never coerces null or empty values to zero', () => {
    const wrapper = mount(ScreenWidget, {
      props: {
        widget,
        runtime: {
          phase: 'ready',
          refreshing: false,
          stale: false,
          lastSuccessAt: result.queriedAt,
          dataCutoffAt: result.dataCutoffAt,
          message: '',
          source,
        },
      },
    })
    const points = wrapper.findAll('.map-point')
    expect(points).toHaveLength(2)
    expect(points.map((point) => point.attributes('title'))).toEqual([
      '0, 0',
      '-73.5, 40.2',
    ])
  })

  it('requires visible fields with explicit coordinate axes before plotting values', () => {
    const withoutAxis = {
      ...source,
      result: {
        ...result,
        visibleFields: result.visibleFields.map((field) => ({
          ...field,
          coordinateAxis: undefined,
        })),
      },
    }
    const wrapper = mount(ScreenWidget, {
      props: {
        widget,
        runtime: {
          phase: 'ready',
          refreshing: false,
          stale: false,
          lastSuccessAt: result.queriedAt,
          dataCutoffAt: result.dataCutoffAt,
          message: '',
          source: withoutAxis,
        },
      },
    })
    expect(wrapper.findAll('.map-point')).toHaveLength(0)
    expect(wrapper.text()).toContain('不会生成位置')
  })
})
