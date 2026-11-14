import type { GardenPlacement, GardenPreset } from '../../shared/appState'

export type Rect = { x: number; y: number; width: number; height: number }
export type GardenDisplay = { id: number; bounds: Rect; workArea: Rect }
export type Point = { x: number; y: number }
export const GARDEN_SIZE = { width: 160, height: 220 }

function intersection(a: Rect, b: Rect): number {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  )
}

function displayFor(
  position: Point | null,
  displays: GardenDisplay[],
  primaryId: number
): GardenDisplay {
  const fallback = displays.find((display) => display.id === primaryId) ?? displays[0]
  if (!fallback) throw new Error('연결된 화면이 없어요')
  if (!position) return fallback
  const rect = { ...position, ...GARDEN_SIZE }
  let result = fallback
  let largest = 0
  for (const display of displays) {
    const area = intersection(rect, display.bounds)
    if (area > largest) {
      result = display
      largest = area
    }
  }
  return result
}

function clamp(position: Point, bounds: Rect): Point {
  return {
    x: Math.round(
      Math.max(
        bounds.x,
        Math.min(position.x, bounds.x + Math.max(0, bounds.width - GARDEN_SIZE.width))
      )
    ),
    y: Math.round(
      Math.max(
        bounds.y,
        Math.min(position.y, bounds.y + Math.max(0, bounds.height - GARDEN_SIZE.height))
      )
    )
  }
}

export function restorePosition(
  position: Point | null,
  placement: GardenPlacement,
  displays: GardenDisplay[],
  primaryId: number
): Point {
  const display = displayFor(position, displays, primaryId)
  if (position) return clamp(position, display.bounds)
  return presetPosition(null, placement === 'custom' ? 'dock' : placement, displays, primaryId)
}

export function presetPosition(
  position: Point | null,
  placement: GardenPreset,
  displays: GardenDisplay[],
  primaryId: number
): Point {
  const display = displayFor(position, displays, primaryId)
  const area = placement === 'dock' ? display.workArea : display.bounds
  const x = position?.x ?? area.x + Math.max(0, area.width - GARDEN_SIZE.width - 8)
  return clamp({ x, y: area.y + Math.max(0, area.height - GARDEN_SIZE.height) }, area)
}
