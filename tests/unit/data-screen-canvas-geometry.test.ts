import { describe, expect, it } from 'vitest'
import {
  DATA_SCREEN_CANVAS_WIDTH,
  DATA_SCREEN_CANVAS_HEIGHT,
  DATA_SCREEN_MIN_WIDTH,
  DATA_SCREEN_MIN_HEIGHT,
  DATA_SCREEN_GRID_SIZE,
  DATA_SCREEN_MAX_WIDGETS,
  CANVAS_RESIZE_HANDLES,
  CANVAS_ALIGNMENTS,
  CANVAS_LAYER_ACTIONS,
  validateCanvasRect,
  snapCanvasValue,
  fitCanvasScale,
  clientDeltaToCanvasDelta,
  moveCanvasRect,
  resizeCanvasRect,
  setCanvasRectProperty,
  alignCanvasRects,
  reorderCanvasLayers,
} from '@/components/data-screen/reference/canvas-geometry'
import type {
  CanvasRect,
  CanvasResizeHandle,
  CanvasAlignment,
  CanvasLayerAction,
  CanvasRectProperty,
} from '@/components/data-screen/reference/canvas-geometry'

const rect: CanvasRect = { x: 400, y: 240, width: 320, height: 192 }
const layers = () =>
  ['a', 'b', 'c', 'd', 'e', 'f'].map((id, z) => ({
    id,
    z,
    label: `label-${id}`,
  }))
const ids = (result: { id: string }[]) => result.map((layer) => layer.id)

describe('reference canvas geometry', () => {
  it('exports the closed schema dimensions, minima, grid and component cap', () => {
    expect([
      DATA_SCREEN_CANVAS_WIDTH,
      DATA_SCREEN_CANVAS_HEIGHT,
      DATA_SCREEN_MIN_WIDTH,
      DATA_SCREEN_MIN_HEIGHT,
      DATA_SCREEN_GRID_SIZE,
      DATA_SCREEN_MAX_WIDGETS,
    ]).toEqual([1920, 1080, 160, 96, 8, 30])
    expect(CANVAS_RESIZE_HANDLES).toHaveLength(8)
    expect(CANVAS_ALIGNMENTS).toHaveLength(6)
    expect(CANVAS_LAYER_ACTIONS).toEqual([
      'forward',
      'backward',
      'front',
      'back',
    ])
  })

  it('converts actual client movement by the effective scale before logical snapping', () => {
    const scale = fitCanvasScale(1280, 720)
    expect(scale).toBeCloseTo(2 / 3)
    const delta = clientDeltaToCanvasDelta({ x: 64, y: -32 }, scale)
    expect(delta).toEqual({ x: 96, y: -48 })
    expect(moveCanvasRect(rect, delta)).toEqual({ ...rect, x: 496, y: 192 })
    expect(fitCanvasScale(960, 900)).toBe(0.5)
    expect(fitCanvasScale(3840, 2160)).toBe(2)
    expect(clientDeltaToCanvasDelta({ x: 16, y: 8 }, 0.25)).toEqual({
      x: 64,
      y: 32,
    })
  })

  it('snaps movement and clamps to exact canvas edges even when an edge is not on the grid', () => {
    expect(moveCanvasRect(rect, { x: 5, y: -5 })).toEqual({
      ...rect,
      x: 408,
      y: 232,
    })
    expect(moveCanvasRect(rect, { x: -10000, y: -10000 })).toEqual({
      ...rect,
      x: 0,
      y: 0,
    })
    const fractional = { x: 7.5, y: 4.5, width: 169.5, height: 101.5 }
    expect(moveCanvasRect(fractional, { x: 10000, y: 10000 })).toEqual({
      ...fractional,
      x: 1750.5,
      y: 978.5,
    })
    expect(moveCanvasRect(fractional, { x: 0, y: 0 })).toEqual(fractional)
    expect(snapCanvasValue(3.99)).toBe(0)
    expect(snapCanvasValue(4)).toBe(8)
    expect(snapCanvasValue(-4)).toBe(0)
    expect(Object.is(snapCanvasValue(-4), -0)).toBe(false)
  })

  it.each([
    ['n', { ...rect, y: 256, height: 176 }],
    ['ne', { ...rect, y: 256, width: 328, height: 176 }],
    ['e', { ...rect, width: 328 }],
    ['se', { ...rect, width: 328, height: 208 }],
    ['s', { ...rect, height: 208 }],
    ['sw', { ...rect, x: 408, width: 312, height: 208 }],
    ['w', { ...rect, x: 408, width: 312 }],
    ['nw', { ...rect, x: 408, y: 256, width: 312, height: 176 }],
  ] as [CanvasResizeHandle, CanvasRect][])(
    'resizes handle%s with correct directional anchors',
    (handle, expected) => {
      expect(resizeCanvasRect(rect, handle, { x: 8, y: 16 })).toEqual(expected)
    }
  )

  it('prevents inverted sizes at minimums and keeps opposite edges fixed for reverse handles', () => {
    expect(resizeCanvasRect(rect, 'e', { x: -10000, y: 0 })).toEqual({
      ...rect,
      width: 160,
    })
    expect(resizeCanvasRect(rect, 's', { x: 0, y: -10000 })).toEqual({
      ...rect,
      height: 96,
    })
    const shrunk = resizeCanvasRect(rect, 'nw', { x: 10000, y: 10000 })
    expect(shrunk).toEqual({ x: 560, y: 336, width: 160, height: 96 })
    expect(shrunk.x + shrunk.width).toBe(rect.x + rect.width)
    expect(shrunk.y + shrunk.height).toBe(rect.y + rect.height)
    expect(resizeCanvasRect(rect, 'nw', { x: -16, y: -16 })).toEqual({
      x: 384,
      y: 224,
      width: 336,
      height: 208,
    })
  })

  it('keeps resize bounds and grid precedence without flipping or moving inactive axes', () => {
    expect(resizeCanvasRect(rect, 'se', { x: 10000, y: 10000 })).toEqual({
      ...rect,
      width: 1520,
      height: 840,
    })
    expect(resizeCanvasRect(rect, 'nw', { x: -10000, y: -10000 })).toEqual({
      x: 0,
      y: 0,
      width: 720,
      height: 432,
    })
    const nearEdge = { x: 1749.5, y: 978.5, width: 169.5, height: 101.5 }
    expect(resizeCanvasRect(nearEdge, 'e', { x: 5, y: 999 })).toEqual({
      ...nearEdge,
      width: 170.5,
    })
    expect(resizeCanvasRect(nearEdge, 'n', { x: 999, y: 0 })).toEqual(nearEdge)
    expect(resizeCanvasRect(rect, 'se', { x: 3, y: 3 })).toEqual(rect)
    expect(resizeCanvasRect(rect, 'se', { x: 4, y: 4 })).toEqual({
      ...rect,
      width: 328,
      height: 200,
    })
  })

  it('uses the same geometry for property edits and keyboard-sized logical moves', () => {
    expect(setCanvasRectProperty(rect, 'x', 405)).toEqual(
      moveCanvasRect(rect, { x: 5, y: 0 })
    )
    expect(setCanvasRectProperty(rect, 'y', -100)).toEqual(
      moveCanvasRect(rect, { x: 0, y: -340 })
    )
    expect(setCanvasRectProperty(rect, 'width', 325)).toEqual(
      resizeCanvasRect(rect, 'e', { x: 5, y: 0 })
    )
    expect(setCanvasRectProperty(rect, 'height', 197)).toEqual(
      resizeCanvasRect(rect, 's', { x: 0, y: 5 })
    )
    expect(setCanvasRectProperty(rect, 'width', 1).width).toBe(160)
    expect(
      setCanvasRectProperty(rect, 'x', rect.x + DATA_SCREEN_GRID_SIZE)
    ).toEqual(moveCanvasRect(rect, { x: DATA_SCREEN_GRID_SIZE, y: 0 }))
    expect(
      setCanvasRectProperty(rect, 'height', rect.height + DATA_SCREEN_GRID_SIZE)
    ).toEqual(resizeCanvasRect(rect, 's', { x: 0, y: DATA_SCREEN_GRID_SIZE }))
  })

  it('aligns multiple unequal rectangles without changing dimensions or snapping exact centers', () => {
    const selection = [
      { x: 8, y: 8, width: 160, height: 96 },
      { x: 328, y: 248, width: 169, height: 105 },
    ]
    const left = alignCanvasRects(selection, 'left')
    expect(left.map((item) => item.x)).toEqual([8, 8])
    expect(
      alignCanvasRects(selection, 'right').map((item) => item.x + item.width)
    ).toEqual([497, 497])
    expect(alignCanvasRects(selection, 'top').map((item) => item.y)).toEqual([
      8, 8,
    ])
    expect(
      alignCanvasRects(selection, 'bottom').map((item) => item.y + item.height)
    ).toEqual([353, 353])
    const horizontal = alignCanvasRects(selection, 'horizontal-center')
    const vertical = alignCanvasRects(selection, 'vertical-center')
    expect(horizontal.map((item) => item.x + item.width / 2)).toEqual([
      252.5, 252.5,
    ])
    expect(vertical.map((item) => item.y + item.height / 2)).toEqual([
      180.5, 180.5,
    ])
    expect(horizontal[0].x).toBe(172.5)
    expect(vertical[0].y).toBe(132.5)
    CANVAS_ALIGNMENTS.forEach((alignment) =>
      expect(
        alignCanvasRects(selection, alignment).map(({ width, height }) => [
          width,
          height,
        ])
      ).toEqual([
        [160, 96],
        [169, 105],
      ])
    )
    expect(alignCanvasRects([], 'left')).toEqual([])
    expect(alignCanvasRects([rect], 'horizontal-center')).toEqual([rect])
    expect(selection[0]).toEqual({ x: 8, y: 8, width: 160, height: 96 })
  })

  it('moves selected layer groups one level while preserving both relative orders', () => {
    const original = layers()
    const forward = reorderCanvasLayers(original, ['e', 'c', 'b'], 'forward')
    expect(ids(forward)).toEqual(['a', 'd', 'b', 'c', 'f', 'e'])
    const backward = reorderCanvasLayers(original, ['e', 'c', 'b'], 'backward')
    expect(ids(backward)).toEqual(['b', 'c', 'a', 'e', 'd', 'f'])
    expect(ids(reorderCanvasLayers(original, ['f'], 'forward'))).toEqual(
      ids(original)
    )
    expect(ids(reorderCanvasLayers(original, ['a'], 'backward'))).toEqual(
      ids(original)
    )
    expect(original).toEqual(layers())
    expect(forward.find((layer) => layer.id === 'b')?.label).toBe('label-b')
    expect(forward.map((layer) => layer.z)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('moves stable selected groups to front/back and normalizes array order by valid z', () => {
    const original = layers().reverse()
    expect(ids(reorderCanvasLayers(original, ['e', 'b'], 'front'))).toEqual([
      'a',
      'c',
      'd',
      'f',
      'b',
      'e',
    ])
    expect(ids(reorderCanvasLayers(original, ['e', 'b'], 'back'))).toEqual([
      'b',
      'e',
      'a',
      'c',
      'd',
      'f',
    ])
    expect(ids(reorderCanvasLayers(original, [], 'front'))).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ])
    expect(reorderCanvasLayers([], [], 'forward')).toEqual([])
    expect(
      ids(reorderCanvasLayers(original, ['f', 'd', 'c', 'b', 'a', 'e'], 'back'))
    ).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('rejects nonfinite geometry, invalid dimensions/scales and unknown operation selectors', () => {
    ;[NaN, Infinity, -Infinity].forEach((value) => {
      ;['x', 'y', 'width', 'height'].forEach((property) =>
        expect(() =>
          validateCanvasRect({ ...rect, [property]: value })
        ).toThrow(RangeError)
      )
      expect(() => moveCanvasRect(rect, { x: value, y: 0 })).toThrow(RangeError)
      expect(() => resizeCanvasRect(rect, 'e', { x: 0, y: value })).toThrow(
        RangeError
      )
      expect(() => setCanvasRectProperty(rect, 'x', value)).toThrow(RangeError)
      expect(() => snapCanvasValue(value)).toThrow(RangeError)
    })
    ;[-1, 0, 159].forEach((width) =>
      expect(() => validateCanvasRect({ ...rect, width })).toThrow(RangeError)
    )
    ;[-1, 0, 95].forEach((height) =>
      expect(() => validateCanvasRect({ ...rect, height })).toThrow(RangeError)
    )
    ;[-1, 0, NaN, Infinity].forEach((scale) =>
      expect(() => clientDeltaToCanvasDelta({ x: 8, y: 8 }, scale)).toThrow(
        RangeError
      )
    )
    expect(() =>
      clientDeltaToCanvasDelta({ x: 1e308, y: 0 }, Number.MIN_VALUE)
    ).toThrow(RangeError)
    expect(() => fitCanvasScale(0, 720)).toThrow(RangeError)
    expect(() => fitCanvasScale(1280, Infinity)).toThrow(RangeError)
    expect(() =>
      resizeCanvasRect(rect, 'bad' as CanvasResizeHandle, { x: 0, y: 0 })
    ).toThrow(RangeError)
    expect(() => alignCanvasRects([rect], 'bad' as CanvasAlignment)).toThrow(
      RangeError
    )
    expect(() =>
      setCanvasRectProperty(rect, 'bad' as CanvasRectProperty, 8)
    ).toThrow(RangeError)
    expect(() => setCanvasRectProperty(rect, 'width', -1)).toThrow(RangeError)
    expect(() => setCanvasRectProperty(rect, 'height', 0)).toThrow(RangeError)
    expect(() => validateCanvasRect({ ...rect, x: -1 })).toThrow(RangeError)
    expect(() => validateCanvasRect({ ...rect, x: 1800 })).toThrow(RangeError)
    expect(() =>
      alignCanvasRects(
        Array.from({ length: 31 }, () => rect),
        'left'
      )
    ).toThrow(RangeError)
  })

  it('rejects duplicate/unknown IDs, discontinuous z and oversized layer collections', () => {
    expect(() =>
      reorderCanvasLayers(
        [
          { id: 'a', z: 0 },
          { id: 'a', z: 1 },
        ],
        [],
        'front'
      )
    ).toThrow(RangeError)
    expect(() => reorderCanvasLayers(layers(), ['b', 'b'], 'front')).toThrow(
      RangeError
    )
    expect(() => reorderCanvasLayers(layers(), ['unknown'], 'front')).toThrow(
      RangeError
    )
    expect(() =>
      reorderCanvasLayers(layers(), [], 'bad' as CanvasLayerAction)
    ).toThrow(RangeError)
    ;[NaN, Infinity, -1, 0.5, 1].forEach((z) =>
      expect(() => reorderCanvasLayers([{ id: 'a', z }], [], 'front')).toThrow(
        RangeError
      )
    )
    expect(() =>
      reorderCanvasLayers(
        [
          { id: 'a', z: 0 },
          { id: 'b', z: 0 },
        ],
        [],
        'front'
      )
    ).toThrow(RangeError)
    expect(() => reorderCanvasLayers([{ id: ' ', z: 0 }], [], 'front')).toThrow(
      RangeError
    )
    expect(() =>
      reorderCanvasLayers(
        Array.from({ length: 31 }, (_, z) => ({ id: `widget${z}`, z })),
        [],
        'front'
      )
    ).toThrow(RangeError)
    expect(() =>
      reorderCanvasLayers(
        layers(),
        Array.from({ length: 31 }, () => 'a'),
        'front'
      )
    ).toThrow(RangeError)
  })

  it('does not mutate frozen geometry or layer input', () => {
    const frozen = Object.freeze({ ...rect })
    expect(moveCanvasRect(frozen, { x: 8, y: 8 })).toEqual({
      ...rect,
      x: 408,
      y: 248,
    })
    expect(resizeCanvasRect(frozen, 'nw', { x: 8, y: 8 })).toEqual({
      x: 408,
      y: 248,
      width: 312,
      height: 184,
    })
    const frozenLayers = Object.freeze(
      layers().map((layer) => Object.freeze(layer))
    )
    expect(reorderCanvasLayers(frozenLayers, ['b'], 'front').at(-1)?.id).toBe(
      'b'
    )
    expect(frozenLayers).toEqual(layers())
  })
})
