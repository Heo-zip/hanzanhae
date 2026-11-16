import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Module from 'node:module'
import ts from 'typescript'

const path = fileURLToPath(new URL('../src/shared/platform.ts', import.meta.url))
const source = ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const testModule = new Module(path)
testModule.filename = path
testModule._compile(source, path)
const { platformSupport, platformName, dockName, permissionSettingsHint } = testModule.exports

test('자동 업데이트는 macOS만, 로그인 항목·클릭 통과·잠금 감지는 macOS·Windows만 지원한다', () => {
  assert.deepEqual(platformSupport('darwin'), {
    loginItem: true,
    autoUpdate: true,
    gardenClickThrough: true,
    screenLockEvents: true
  })
  assert.deepEqual(platformSupport('win32'), {
    loginItem: true,
    autoUpdate: false,
    gardenClickThrough: true,
    screenLockEvents: true
  })
  assert.deepEqual(platformSupport('linux'), {
    loginItem: false,
    autoUpdate: false,
    gardenClickThrough: false,
    screenLockEvents: false
  })
})

test('OS별 이름과 설정 위치 안내가 Mac 문구로 고정되지 않는다', () => {
  assert.equal(platformName('win32'), 'Windows')
  assert.equal(platformName('linux'), 'Linux')
  assert.equal(dockName('darwin'), 'Dock')
  assert.equal(dockName('win32'), '작업 표시줄')
  assert.match(permissionSettingsHint('win32', '알림'), /^Windows 설정/)
  assert.doesNotMatch(permissionSettingsHint('linux', '카메라'), /Mac|Windows/)
})
