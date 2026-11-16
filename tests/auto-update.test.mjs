/* eslint-disable @typescript-eslint/explicit-function-return-type -- JavaScript 테스트 보조 함수다. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Module from 'node:module'
import ts from 'typescript'

const path = fileURLToPath(new URL('../src/main/updates/controller.ts', import.meta.url))
const source = ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const testModule = new Module(path)
testModule.filename = path
testModule._compile(source, path)
const { createUpdateController } = testModule.exports

function harness() {
  const calls = []
  let enabled = true
  let confirmDownload = false
  let confirmInstall = false
  let checkpointError = false
  let result = { isUpdateAvailable: true, updateInfo: { version: '1.1.0' } }
  const engine = {
    checkForUpdates: async () => {
      calls.push('check')
      return result
    },
    downloadUpdate: async () => {
      calls.push('download')
    },
    quitAndInstall: () => calls.push('install')
  }
  const dialogs = {
    unavailable: async () => {
      calls.push('unavailable')
    },
    busy: async () => {
      calls.push('busy')
    },
    upToDate: async () => {
      calls.push('up-to-date')
    },
    confirmDownload: async (version) => {
      calls.push(`ask-download:${version}`)
      return confirmDownload
    },
    downloading: async () => {
      calls.push('downloading')
    },
    confirmInstall: async (version) => {
      calls.push(`ask-install:${version}`)
      return confirmInstall
    },
    failed: async () => {
      calls.push('failed')
    },
    installFailed: async () => {
      calls.push('install-failed')
    },
    storageFailed: async () => {
      calls.push('storage-failed')
    }
  }
  const controller = createUpdateController(
    engine,
    dialogs,
    () => enabled,
    () => {
      calls.push('checkpoint')
      if (checkpointError) throw new Error('저장 실패')
    }
  )
  return {
    calls,
    engine,
    controller,
    setEnabled: (value) => {
      enabled = value
    },
    setDownload: (value) => {
      confirmDownload = value
    },
    setInstall: (value) => {
      confirmInstall = value
    },
    setResult: (value) => {
      result = value
    },
    setCheckpointError: (value) => {
      checkpointError = value
    }
  }
}

test('개발 환경과 최신 버전은 수동 확인에만 결과를 안내한다', async () => {
  const h = harness()
  h.setEnabled(false)
  await h.controller.check()
  await h.controller.check(true)
  assert.deepEqual(h.calls, ['unavailable'])
  h.setEnabled(true)
  h.setResult({ isUpdateAvailable: false, updateInfo: { version: '1.0.0' } })
  await h.controller.check()
  await h.controller.check(true)
  assert.deepEqual(h.calls.slice(1), ['check', 'check', 'up-to-date'])
})

test('거절한 버전은 자동으로 재질문하지 않지만 수동 확인 시 다시 제안한다', async () => {
  const h = harness()
  await h.controller.check()
  await h.controller.check()
  assert.deepEqual(h.calls, ['check', 'ask-download:1.1.0', 'check'])
  await h.controller.check(true)
  assert.deepEqual(h.calls.slice(3), ['check', 'ask-download:1.1.0'])
})

test('다운로드 후 재시작을 미루면 수동 확인 시 재다운로드 없이 설치를 제안한다', async () => {
  const h = harness()
  h.setDownload(true)
  await h.controller.check()
  assert.deepEqual(h.calls, [
    'check',
    'ask-download:1.1.0',
    'downloading',
    'download',
    'ask-install:1.1.0'
  ])
  h.setInstall(true)
  await h.controller.check(true)
  assert.deepEqual(h.calls.slice(5), ['ask-install:1.1.0', 'checkpoint', 'install'])
})

test('저장 상태를 확인하지 못하면 업데이트 설치를 멈추고 다시 시도할 수 있다', async () => {
  const h = harness()
  h.setDownload(true)
  h.setInstall(true)
  h.setCheckpointError(true)
  await h.controller.check(true)
  assert.deepEqual(h.calls.slice(-2), ['checkpoint', 'storage-failed'])
  assert.equal(h.calls.includes('install'), false)
  h.setCheckpointError(false)
  await h.controller.check(true)
  assert.deepEqual(h.calls.slice(-3), ['ask-install:1.1.0', 'checkpoint', 'install'])
})

test('자동 확인 실패는 조용히 지나가고 수동 확인과 다운로드 실패는 안내한다', async () => {
  const h = harness()
  h.engine.checkForUpdates = async () => {
    throw new Error('offline')
  }
  await h.controller.check()
  assert.deepEqual(h.calls, [])
  await h.controller.check(true)
  assert.deepEqual(h.calls, ['failed'])
  h.engine.checkForUpdates = async () => ({
    isUpdateAvailable: true,
    updateInfo: { version: '1.1.0' }
  })
  h.engine.downloadUpdate = async () => {
    throw new Error('download failed')
  }
  h.setDownload(true)
  await h.controller.check()
  assert.deepEqual(h.calls.slice(1), ['ask-download:1.1.0', 'downloading', 'failed'])
})

test('중복 확인 요청은 새 네트워크 요청을 만들지 않는다', async () => {
  const h = harness()
  let resolve
  h.engine.checkForUpdates = () => {
    h.calls.push('check')
    return new Promise((done) => {
      resolve = done
    })
  }
  const first = h.controller.check()
  await h.controller.check(true)
  assert.deepEqual(h.calls, ['check', 'busy'])
  resolve({ isUpdateAvailable: false, updateInfo: { version: '1.0.0' } })
  await first
})

test('재시작 준비 중 설치 오류가 발생하면 앱 재실행 전까지 중복 설치를 막는다', async () => {
  const h = harness()
  h.setDownload(true)
  h.setInstall(true)
  await h.controller.check(true)
  assert.equal(h.calls.at(-1), 'install')
  h.controller.handleInstallError()
  assert.equal(h.calls.at(-1), 'install-failed')
  h.setDownload(false)
  await h.controller.check(true)
  assert.deepEqual(h.calls.slice(-2), ['install-failed', 'install-failed'])
})

test('설치 요청이 즉시 실패해도 기록 상태는 그대로 두고 재실행을 안내한다', async () => {
  const h = harness()
  h.setDownload(true)
  h.setInstall(true)
  h.engine.quitAndInstall = () => {
    throw new Error('install failed')
  }
  await h.controller.check(true)
  assert.deepEqual(h.calls.slice(-2), ['checkpoint', 'install-failed'])
  await h.controller.check(true)
  assert.equal(h.calls.at(-1), 'install-failed')
})

test('macOS 업데이트 종료 이벤트는 창을 숨기지 않고 닫을 수 있게 한다', () => {
  const events = new EventEmitter()
  const nativeUpdater = new EventEmitter()
  const windowPath = fileURLToPath(new URL('../src/main/windows/gardenWindow.ts', import.meta.url))
  const compiled = ts.transpileModule(readFileSync(windowPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const windowModule = new Module(windowPath)
  windowModule.filename = windowPath
  const mocks = {
    electron: { app: events, autoUpdater: nativeUpdater, ipcMain: new EventEmitter() },
    '@electron-toolkit/utils': { is: {} },
    '../storage/ipc': {},
    '../../shared/platform': {},
    './gardenPosition': {}
  }
  windowModule.require = (name) =>
    name in mocks ? mocks[name] : Module.prototype.require.call(windowModule, name)
  windowModule._compile(compiled, windowPath)
  assert.equal(windowModule.exports.isAppQuitting(), false)
  nativeUpdater.emit('before-quit-for-update')
  assert.equal(windowModule.exports.isAppQuitting(), true)
})
