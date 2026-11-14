/* eslint-disable @typescript-eslint/explicit-function-return-type -- JavaScript 테스트 보조 함수에는 TypeScript 반환 타입을 쓸 수 없다. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

function compile(path, mocks = {}) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const module = new Module(path)
  module.filename = path
  module.require = (name) =>
    name in mocks ? mocks[name] : Module.prototype.require.call(module, name)
  module._compile(source, path)
  return module.exports
}

const policy = compile(fileURLToPath(new URL('../src/main/reminders/policy.ts', import.meta.url)))
const servicePath = fileURLToPath(new URL('../src/main/reminders/service.ts', import.meta.url))
const flush = () => new Promise((resolve) => setImmediate(resolve))

function createHarness(mode = 'show', initiallyEnabled = true) {
  const app = new EventEmitter()
  const powerMonitor = new EventEmitter()
  const handlers = new Map()
  const windows = { webContents: {} }
  const instances = []
  let opened = 0
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date())
  const [hour, minute] = time.split(':').map(Number)
  const next = (hour * 60 + minute + 1) % 1440
  const endTime = `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`
  const context = {
    settings: { enabled: initiallyEnabled, intervalMinutes: 120, startTime: time, endTime },
    goalStartedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    latestRecordAt: null,
    lastNotifiedAt: null,
    todayMl: 0,
    goalMl: 1000,
    vitality: 30
  }
  const writes = []
  class FakeNotification extends EventEmitter {
    static isSupported() {
      return mode !== 'unsupported'
    }
    constructor(options) {
      super()
      this.options = options
      instances.push(this)
    }
    show() {
      if (mode !== 'deferred')
        queueMicrotask(() => this.emit(mode === 'failed' ? 'failed' : 'show'))
    }
  }
  const database = {
    readReminderContext: () => context,
    readReminderSettings: () => context.settings,
    saveReminderSettings: (settings) => (context.settings = settings),
    recordReminderShown: (at) => {
      writes.push(at)
      context.lastNotifiedAt = at.toISOString()
    }
  }
  const service = compile(servicePath, {
    electron: {
      app,
      powerMonitor,
      ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
      Notification: FakeNotification
    },
    '../storage/ipc': { getDatabase: () => database, trusted: (event) => event.trusted },
    '../storage/database': { InvalidSetupError: class extends Error {} },
    './policy': policy
  })
  service.initializeReminders(
    () => windows,
    () => {
      opened += 1
    }
  )
  return {
    app,
    powerMonitor,
    handlers,
    windows,
    instances,
    context,
    writes,
    database,
    opened: () => opened
  }
}

test('알림 성공 시 발송 시각을 저장하고 즉시 재발송하지 않는다', async () => {
  const h = createHarness()
  try {
    await flush()
    assert.equal(h.instances.length, 1)
    assert.match(h.instances[0].options.body, /말라/)
    assert.equal(h.writes.length, 1)
    h.powerMonitor.emit('resume')
    await flush()
    assert.equal(h.instances.length, 1)
    h.instances[0].emit('click')
    assert.equal(h.opened(), 1)
  } finally {
    h.app.emit('will-quit')
  }
})

test('알림을 처음 켤 때 확인 알림을 요청하고 표시 성공 시 중복 간격을 기록한다', async () => {
  const h = createHarness('show', false)
  try {
    await flush()
    assert.equal(h.instances.length, 0)
    const update = h.handlers.get('reminder:update-settings')
    const result = await update(
      { trusted: true, sender: h.windows.webContents },
      { ...h.context.settings, enabled: true }
    )
    assert.equal(result.activation, 'shown')
    assert.equal(h.context.settings.enabled, true)
    assert.equal(h.instances.length, 1)
    assert.equal(h.writes.length, 1)
    h.powerMonitor.emit('resume')
    await flush()
    assert.equal(h.instances.length, 1)
  } finally {
    h.app.emit('will-quit')
  }
})

test('처음 켤 때 확인 알림이 거절되면 설정은 저장하되 실패를 알리고 발송 시각을 남기지 않는다', async () => {
  const h = createHarness('failed', false)
  try {
    const update = h.handlers.get('reminder:update-settings')
    const result = await update(
      { trusted: true, sender: h.windows.webContents },
      { ...h.context.settings, enabled: true }
    )
    assert.equal(result.ok, true)
    assert.equal(result.activation, 'failed')
    assert.equal(result.settings.enabled, true)
    assert.equal(h.writes.length, 0)
  } finally {
    h.app.emit('will-quit')
  }
})

test('알림을 처리 중일 때 설정을 껐다 켜도 확인 알림을 중복 생성하지 않는다', async () => {
  const h = createHarness('deferred')
  try {
    const update = h.handlers.get('reminder:update-settings')
    await update(
      { trusted: true, sender: h.windows.webContents },
      { ...h.context.settings, enabled: false }
    )
    const result = await update(
      { trusted: true, sender: h.windows.webContents },
      { ...h.context.settings, enabled: true }
    )
    assert.equal(result.activation, 'pending')
    assert.equal(h.instances.length, 1)
    h.instances[0].emit('show')
    await flush()
    assert.equal(h.writes.length, 1)
  } finally {
    h.app.emit('will-quit')
  }
})

test('알림 실패는 발송 시각을 남기지 않고 다른 창의 설정 요청을 거절한다', async () => {
  const h = createHarness('failed')
  try {
    await flush()
    assert.equal(h.instances.length, 1)
    assert.equal(h.writes.length, 0)
    const get = h.handlers.get('reminder:get-settings')
    assert.deepEqual(get({ trusted: true, sender: {} }), { ok: false, code: 'VALIDATION_ERROR' })
    assert.equal(get({ trusted: true, sender: h.windows.webContents }).ok, true)
    const check = h.handlers.get('reminder:test')
    assert.deepEqual(await check({ trusted: false, sender: h.windows.webContents }), {
      ok: false,
      code: 'VALIDATION_ERROR'
    })
    assert.deepEqual(await check({ trusted: true, sender: h.windows.webContents }), {
      ok: false,
      code: 'NOTIFICATION_ERROR'
    })
    assert.equal(h.writes.length, 0)
  } finally {
    h.app.emit('will-quit')
  }
})

test('알림 표시 후 시각 저장이 실패하면 같은 알림 대신 저장을 재시도한다', async () => {
  const h = createHarness()
  let attempts = 0
  h.database.recordReminderShown = (at) => {
    attempts += 1
    if (attempts === 1) throw new Error('저장 실패')
    h.writes.push(at)
    h.context.lastNotifiedAt = at.toISOString()
  }
  try {
    await flush()
    assert.equal(h.instances.length, 1)
    assert.equal(h.writes.length, 0)
    h.powerMonitor.emit('resume')
    await flush()
    assert.equal(attempts, 2)
    assert.equal(h.writes.length, 1)
    assert.equal(h.instances.length, 1)
  } finally {
    h.app.emit('will-quit')
  }
})

test('알림을 지원하지 않으면 실패를 반환하고 발송 시각을 저장하지 않는다', async () => {
  const h = createHarness('unsupported')
  try {
    await flush()
    const check = h.handlers.get('reminder:test')
    assert.deepEqual(await check({ trusted: true, sender: h.windows.webContents }), {
      ok: false,
      code: 'UNSUPPORTED'
    })
    assert.equal(h.instances.length, 0)
    assert.equal(h.writes.length, 0)
  } finally {
    h.app.emit('will-quit')
  }
})
