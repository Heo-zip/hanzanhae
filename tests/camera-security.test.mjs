import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Module from 'node:module'
import ts from 'typescript'

const path = fileURLToPath(new URL('../src/main/camera/security.ts', import.meta.url))
const source = ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const module = new Module(path)
module._compile(source, path)
const { isDashboardUrl, cameraAssetName } = module.exports

test('다른 출처, 경로, 정원 창의 카메라 요청을 허용하지 않는다', () => {
  const dashboard = 'file:///app/out/renderer/index.html'
  assert.equal(isDashboardUrl(dashboard, dashboard), true)
  assert.equal(isDashboardUrl(`${dashboard}?view=garden`, dashboard), false)
  assert.equal(isDashboardUrl('file:///app/out/other.html', dashboard), false)
  assert.equal(isDashboardUrl('https://example.com/app/out/renderer/index.html', dashboard), false)
  assert.equal(isDashboardUrl(undefined, dashboard), false)
})

test('모델과 실행 파일만 허용하고 임의 파일이나 다른 요청은 차단한다', () => {
  assert.equal(
    cameraAssetName('hanzanhae-assets://app/face_landmarker-abc123.task', 'GET'),
    'face_landmarker-abc123.task'
  )
  assert.equal(
    cameraAssetName('hanzanhae-assets://app/pose_landmarker_lite-abc123.task', 'GET'),
    'pose_landmarker_lite-abc123.task'
  )
  assert.equal(
    cameraAssetName('hanzanhae-assets://app/efficientdet_lite0-a_12.tflite', 'GET'),
    'efficientdet_lite0-a_12.tflite'
  )
  assert.equal(
    cameraAssetName('hanzanhae-assets://app/vision_wasm_internal-a.wasm', 'GET'),
    'vision_wasm_internal-a.wasm'
  )
  assert.equal(cameraAssetName('hanzanhae-assets://app/secret.sqlite', 'GET'), null)
  assert.equal(cameraAssetName('hanzanhae-assets://app/%2e%2e/secret.sqlite', 'GET'), null)
  // 더 이상 쓰지 않는 모델도 차단한다.
  assert.equal(cameraAssetName('hanzanhae-assets://app/hand_landmarker-abc123.task', 'GET'), null)
  assert.equal(cameraAssetName('hanzanhae-assets://other/face_landmarker-abc123.task', 'GET'), null)
  assert.equal(cameraAssetName('hanzanhae-assets://app/face_landmarker-abc123.task', 'POST'), null)
})
