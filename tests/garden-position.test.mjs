import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const path = fileURLToPath(new URL('../src/main/windows/gardenPosition.ts', import.meta.url))
const source = ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const moduleUnderTest = new Module(path)
moduleUnderTest.filename = path
moduleUnderTest._compile(source, path)
const { restorePosition, presetPosition, toWindowPosition, toGardenPosition, GARDEN_LEFT_PADDING } =
  moduleUnderTest.exports
const primary = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1440, height: 900 },
  workArea: { x: 0, y: 24, width: 1440, height: 806 }
}
const external = {
  id: 2,
  bounds: { x: -1920, y: -100, width: 1920, height: 1080 },
  workArea: { x: -1920, y: -76, width: 1920, height: 980 }
}

test('그림자 여백을 추가해도 저장된 화분 좌표와 복원 위치를 유지한다', () => {
  for (const point of [
    { x: 300, y: 400 },
    { x: -1300, y: 400 },
    { x: 0, y: 0 }
  ]) {
    const windowPosition = toWindowPosition(point)
    assert.deepEqual(windowPosition, { x: point.x - GARDEN_LEFT_PADDING, y: point.y })
    assert.deepEqual(toGardenPosition(windowPosition), point)
  }
})

test('기본 위치와 Dock 위·화면 바닥 선택은 수평 좌표를 유지한다', () => {
  assert.deepEqual(restorePosition(null, 'dock', [primary], 1), { x: 1272, y: 610 })
  assert.deepEqual(presetPosition({ x: 300, y: 400 }, 'dock', [primary], 1), { x: 300, y: 610 })
  assert.deepEqual(presetPosition({ x: 300, y: 400 }, 'floor', [primary], 1), { x: 300, y: 680 })
})

test('음수 좌표의 보조 화면 위치를 유지하고 모니터 제거 시 기본 화면에 복구한다', () => {
  assert.deepEqual(restorePosition({ x: -1300, y: 400 }, 'dock', [primary, external], 1), {
    x: -1300,
    y: 400
  })
  assert.deepEqual(presetPosition({ x: -1300, y: 400 }, 'floor', [primary, external], 1), {
    x: -1300,
    y: 760
  })
  assert.deepEqual(restorePosition({ x: -1300, y: 400 }, 'floor', [primary], 1), { x: 0, y: 400 })
})

test('화면에 걸친 창은 가장 많이 겹치는 화면에서 벗어나지 않게 보정한다', () => {
  assert.deepEqual(restorePosition({ x: -40, y: 850 }, 'dock', [primary, external], 1), {
    x: 0,
    y: 680
  })
  assert.deepEqual(restorePosition({ x: 9999, y: -9999 }, 'dock', [primary], 1), { x: 1280, y: 0 })
})
