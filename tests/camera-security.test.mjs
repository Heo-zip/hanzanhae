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
const { PACKAGED_RENDERER_URL, isRendererUrl, cameraAssetName, rendererAssetPath } = module.exports

test('다른 출처, 경로, 정원 창의 카메라 요청을 허용하지 않는다', () => {
  const dashboard = PACKAGED_RENDERER_URL
  const garden = `${dashboard}?view=garden`
  assert.equal(isRendererUrl(dashboard, dashboard), true)
  assert.equal(isRendererUrl(garden, garden), true)
  assert.equal(isRendererUrl(garden, dashboard), false)
  assert.equal(isRendererUrl('file:///app/out/renderer/index.html', dashboard), false)
  assert.equal(isRendererUrl('https://example.com/index.html', dashboard), false)
  assert.equal(isRendererUrl(undefined, dashboard), false)
  assert.equal(isRendererUrl('hanzanhae-app://other/index.html', dashboard), false)
  assert.equal(isRendererUrl(`${dashboard}#x`, dashboard), false)
  const dev = 'http://localhost:5173/'
  assert.equal(isRendererUrl('http://localhost:5173/', dev), true)
  assert.equal(isRendererUrl('http://localhost:5174/', dev), false)
})

test('앱 주소로는 화면과 번들 에셋만 읽을 수 있다', () => {
  const base = 'hanzanhae-app://app'
  assert.equal(rendererAssetPath(PACKAGED_RENDERER_URL, 'GET'), 'index.html')
  assert.equal(rendererAssetPath(`${PACKAGED_RENDERER_URL}?view=garden`, 'GET'), 'index.html')
  assert.equal(rendererAssetPath(`${base}/assets/index-A1_b.css`, 'GET'), 'assets/index-A1_b.css')
  assert.equal(rendererAssetPath(`${base}/assets/%2e%2e/%2e%2e/user.sqlite`, 'GET'), null)
  assert.equal(rendererAssetPath(`${base}/assets/sub/index.js`, 'GET'), null)
  assert.equal(rendererAssetPath(`${base}/index.html?view=other`, 'GET'), null)
  assert.equal(rendererAssetPath(PACKAGED_RENDERER_URL, 'POST'), null)
  assert.equal(rendererAssetPath('hanzanhae-app://user@app/index.html', 'GET'), null)
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
