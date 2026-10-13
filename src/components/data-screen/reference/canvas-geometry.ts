export const DATA_SCREEN_CANVAS_WIDTH = 1920
export const DATA_SCREEN_CANVAS_HEIGHT = 1080
export const DATA_SCREEN_MIN_WIDTH = 160
export const DATA_SCREEN_MIN_HEIGHT = 96
export const DATA_SCREEN_GRID_SIZE = 8
export const DATA_SCREEN_MAX_WIDGETS = 30

export const CANVAS_RESIZE_HANDLES = [
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
  'nw',
] as const
export const CANVAS_ALIGNMENTS = [
  'left',
  'right',
  'top',
  'bottom',
  'horizontal-center',
  'vertical-center',
] as const
export const CANVAS_LAYER_ACTIONS = [
  'forward',
  'backward',
  'front',
  'back',
] as const
export const CANVAS_RECT_PROPERTIES = ['x', 'y', 'width', 'height'] as const

export type CanvasResizeHandle = (typeof CANVAS_RESIZE_HANDLES)[number]
export type CanvasAlignment = (typeof CANVAS_ALIGNMENTS)[number]
export type CanvasLayerAction = (typeof CANVAS_LAYER_ACTIONS)[number]
export type CanvasRectProperty = (typeof CANVAS_RECT_PROPERTIES)[number]

export interface CanvasRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasDelta {
  x: number
  y: number
}

export interface CanvasLayer {
  id: string
  z: number
}

const invalidGeometry = (message: string): never => {
  throw new RangeError(message)
}

const finite = (value: number, field: string): void => {
  if (typeof value !== 'number' || !Number.isFinite(value))
    invalidGeometry(`${field}必须为有限数字`)
}

const positive = (value: number, field: string): void => {
  finite(value, field)
  if (value <= 0) invalidGeometry(`${field}必须大于0`)
}

const normalizeZero = (value: number): number => (value === 0 ? 0 : value)

const clamp = (value: number, min: number, max: number): number =>
  normalizeZero(Math.min(max, Math.max(min, value)))

const copyRect = (rect: CanvasRect): CanvasRect => ({
  x: normalizeZero(rect.x),
  y: normalizeZero(rect.y),
  width: rect.width,
  height: rect.height,
})

export const validateCanvasRect = (rect: CanvasRect): void => {
  if (!rect || typeof rect !== 'object' || Array.isArray(rect))
    invalidGeometry('画布矩形必须为数据对象')
  CANVAS_RECT_PROPERTIES.forEach((property) => finite(rect[property], property))
  if (
    rect.width < DATA_SCREEN_MIN_WIDTH ||
    rect.height < DATA_SCREEN_MIN_HEIGHT
  )
    invalidGeometry('组件尺寸不能小于160×96')
  if (
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x + rect.width > DATA_SCREEN_CANVAS_WIDTH ||
    rect.y + rect.height > DATA_SCREEN_CANVAS_HEIGHT
  )
    invalidGeometry('组件矩形必须位于1920×1080画布内')
}

const validateDelta = (delta: CanvasDelta): void => {
  if (!delta || typeof delta !== 'object' || Array.isArray(delta))
    invalidGeometry('位移必须为数据对象')
  finite(delta.x, '水平位移')
  finite(delta.y, '垂直位移')
}

export const snapCanvasValue = (value: number): number => {
  finite(value, '吸附值')
  const snapped =
    Math.round(value / DATA_SCREEN_GRID_SIZE) * DATA_SCREEN_GRID_SIZE
  finite(snapped, '吸附结果')
  return normalizeZero(snapped)
}

export const fitCanvasScale = (
  viewportWidth: number,
  viewportHeight: number
): number => {
  positive(viewportWidth, '视口宽度')
  positive(viewportHeight, '视口高度')
  const scale = Math.min(
    viewportWidth / DATA_SCREEN_CANVAS_WIDTH,
    viewportHeight / DATA_SCREEN_CANVAS_HEIGHT
  )
  positive(scale, '画布有效缩放')
  return scale
}

/** The supplied scale is the actual effective CSS scale, including any additional zoom. */
export const clientDeltaToCanvasDelta = (
  delta: CanvasDelta,
  effectiveScale: number
): CanvasDelta => {
  validateDelta(delta)
  positive(effectiveScale, '画布有效缩放')
  const result = {
    x: normalizeZero(delta.x / effectiveScale),
    y: normalizeZero(delta.y / effectiveScale),
  }
  validateDelta(result)
  return result
}

export const moveCanvasRect = (
  rect: CanvasRect,
  delta: CanvasDelta
): CanvasRect => {
  validateCanvasRect(rect)
  validateDelta(delta)
  const result = {
    ...copyRect(rect),
    x:
      delta.x === 0
        ? rect.x
        : clamp(
            snapCanvasValue(rect.x + delta.x),
            0,
            DATA_SCREEN_CANVAS_WIDTH - rect.width
          ),
    y:
      delta.y === 0
        ? rect.y
        : clamp(
            snapCanvasValue(rect.y + delta.y),
            0,
            DATA_SCREEN_CANVAS_HEIGHT - rect.height
          ),
  }
  validateCanvasRect(result)
  return copyRect(result)
}

/** Snap changed dimensions; keep the opposite edge fixed, with boundary/minimum precedence. */
export const resizeCanvasRect = (
  rect: CanvasRect,
  handle: CanvasResizeHandle,
  delta: CanvasDelta
): CanvasRect => {
  validateCanvasRect(rect)
  validateDelta(delta)
  if (!CANVAS_RESIZE_HANDLES.includes(handle))
    invalidGeometry('画布缩放方向不受支持')
  const result = copyRect(rect)
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  if (handle.includes('e') && delta.x !== 0)
    result.width = clamp(
      snapCanvasValue(rect.width + delta.x),
      DATA_SCREEN_MIN_WIDTH,
      DATA_SCREEN_CANVAS_WIDTH - rect.x
    )
  if (handle.includes('w') && delta.x !== 0) {
    result.width = clamp(
      snapCanvasValue(rect.width - delta.x),
      DATA_SCREEN_MIN_WIDTH,
      right
    )
    result.x = right - result.width
  }
  if (handle.includes('s') && delta.y !== 0)
    result.height = clamp(
      snapCanvasValue(rect.height + delta.y),
      DATA_SCREEN_MIN_HEIGHT,
      DATA_SCREEN_CANVAS_HEIGHT - rect.y
    )
  if (handle.includes('n') && delta.y !== 0) {
    result.height = clamp(
      snapCanvasValue(rect.height - delta.y),
      DATA_SCREEN_MIN_HEIGHT,
      bottom
    )
    result.y = bottom - result.height
  }
  validateCanvasRect(result)
  return copyRect(result)
}

/** Property controls reuse the same move/resize paths used by pointer and keyboard actions. */
export const setCanvasRectProperty = (
  rect: CanvasRect,
  property: CanvasRectProperty,
  value: number
): CanvasRect => {
  validateCanvasRect(rect)
  if (!CANVAS_RECT_PROPERTIES.includes(property))
    invalidGeometry('画布矩形属性不受支持')
  finite(value, '属性值')
  if (property === 'x') return moveCanvasRect(rect, { x: value - rect.x, y: 0 })
  if (property === 'y') return moveCanvasRect(rect, { x: 0, y: value - rect.y })
  positive(value, '组件尺寸')
  if (property === 'width')
    return resizeCanvasRect(rect, 'e', { x: value - rect.width, y: 0 })
  return resizeCanvasRect(rect, 's', { x: 0, y: value - rect.height })
}

/** Align inside the selection's bounding box, preserving each original size and exact centers. */
export const alignCanvasRects = (
  rects: readonly CanvasRect[],
  alignment: CanvasAlignment
): CanvasRect[] => {
  if (!Array.isArray(rects) || rects.length > DATA_SCREEN_MAX_WIDGETS)
    invalidGeometry('对齐组件数量不能超过30')
  if (!CANVAS_ALIGNMENTS.includes(alignment))
    invalidGeometry('画布对齐方式不受支持')
  Array.from(rects).forEach(validateCanvasRect)
  if (!rects.length) return []
  const left = Math.min(...rects.map((rect) => rect.x))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const top = Math.min(...rects.map((rect) => rect.y))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return rects.map((rect) => {
    const result = copyRect(rect)
    if (alignment === 'left') result.x = left
    else if (alignment === 'right') result.x = right - rect.width
    else if (alignment === 'top') result.y = top
    else if (alignment === 'bottom') result.y = bottom - rect.height
    else if (alignment === 'horizontal-center')
      result.x = (left + right - rect.width) / 2
    else result.y = (top + bottom - rect.height) / 2
    validateCanvasRect(result)
    return copyRect(result)
  })
}

const validateLayers = <T extends CanvasLayer>(
  layers: readonly T[],
  selectedIds: readonly string[]
): void => {
  if (
    !Array.isArray(layers) ||
    layers.length > DATA_SCREEN_MAX_WIDGETS ||
    !Array.isArray(selectedIds) ||
    selectedIds.length > DATA_SCREEN_MAX_WIDGETS
  )
    invalidGeometry('画布层级必须为不超过30个组件的数组')
  const ids = new Set<string>()
  const levels = new Set<number>()
  Array.from(layers).forEach((layer) => {
    if (
      !layer ||
      typeof layer !== 'object' ||
      typeof layer.id !== 'string' ||
      !layer.id ||
      layer.id.trim() !== layer.id
    )
      invalidGeometry('组件标识必须为非空文本')
    if (ids.has(layer.id)) invalidGeometry('组件标识重复')
    ids.add(layer.id)
    finite(layer.z, '组件层级')
    if (
      !Number.isInteger(layer.z) ||
      layer.z < 0 ||
      layer.z >= layers.length ||
      levels.has(layer.z)
    )
      invalidGeometry('组件层级必须为连续且唯一的0起整数')
    levels.add(layer.z)
  })
  const selected = new Set<string>()
  Array.from(selectedIds).forEach((id) => {
    if (!ids.has(id)) invalidGeometry('所选组件标识不存在')
    if (selected.has(id)) invalidGeometry('所选组件标识重复')
    selected.add(id)
  })
}

/** Reorder selected layers as stable groups; do not use click order as the visual order. */
export const reorderCanvasLayers = <T extends CanvasLayer>(
  layers: readonly T[],
  selectedIds: readonly string[],
  action: CanvasLayerAction
): T[] => {
  validateLayers(layers, selectedIds)
  if (!CANVAS_LAYER_ACTIONS.includes(action))
    invalidGeometry('画布层级操作不受支持')
  const selected = new Set(selectedIds)
  let ordered = [...layers].sort((left, right) => left.z - right.z)
  if (action === 'front')
    ordered = [
      ...ordered.filter((layer) => !selected.has(layer.id)),
      ...ordered.filter((layer) => selected.has(layer.id)),
    ]
  else if (action === 'back')
    ordered = [
      ...ordered.filter((layer) => selected.has(layer.id)),
      ...ordered.filter((layer) => !selected.has(layer.id)),
    ]
  else if (action === 'forward') {
    for (let index = ordered.length - 2; index >= 0; index--) {
      const current = ordered[index]
      const above = ordered[index + 1]
      if (selected.has(current.id) && !selected.has(above.id)) {
        ordered[index] = above
        ordered[index + 1] = current
      }
    }
  } else {
    for (let index = 1; index < ordered.length; index++) {
      const current = ordered[index]
      const below = ordered[index - 1]
      if (selected.has(current.id) && !selected.has(below.id)) {
        ordered[index] = below
        ordered[index - 1] = current
      }
    }
  }
  return ordered.map((layer, index) => ({ ...layer, z: index }))
}
