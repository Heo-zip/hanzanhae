import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const sourcePath = fileURLToPath(new URL('../src/main/storage/database.ts', import.meta.url))
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const compile = (filename) =>
  ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
const previous = Module._extensions['.ts']
Module._extensions['.ts'] = (module, filename) => module._compile(compile(filename), filename)
const loaded = new Module(sourcePath)
loaded.filename = sourcePath
loaded._compile(compile(sourcePath), sourcePath)
if (previous) Module._extensions['.ts'] = previous
else delete Module._extensions['.ts']
const { AppDatabase, StaleStateError, InvalidSetupError } = loaded.exports

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function withDatabase(run) {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-count-'))
  const path = join(dir, 'data.sqlite')
  let now = new Date('2026-11-15T03:00:00Z')
  const db = new AppDatabase(path, () => now)
  try {
    run(db, path, (value) => {
      now = new Date(value)
    })
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

test('물 마신 횟수와 텀블러 용량은 서로 영향을 주지 않으며 각각 취소된다', () => {
  withDatabase((db) => {
    const state = db.completeSetup({ requestId: 'setup', goalCount: 8, cupMl: 500 })
    assert.equal(state.goalCount, 8)
    const base = { expectedGoalId: state.goalId, day: state.day }
    const action = db.recordDrinkAction({ ...base, kind: 'add', requestId: 'drink' })
    assert.equal(action.state.todayCount, 1)
    assert.equal(action.state.todayMl, 0)
    assert.equal(action.state.growthPoints, 0)
    assert.equal(db.recordDrinkAction({ ...base, kind: 'add', requestId: 'drink' }).created, false)
    const water = db.recordCup({ ...base, requestId: 'bottle' }).state
    assert.equal(water.todayCount, 1)
    assert.equal(water.todayMl, 500)
    assert.equal(water.growthPoints, 500)
    const undone = db.recordDrinkAction({
      ...base,
      kind: 'undo',
      requestId: 'undo',
      recordId: water.latestDrinkId
    }).state
    assert.equal(undone.todayCount, 0)
    assert.equal(undone.todayMl, 500)
    assert.equal(undone.growthPoints, 500)
    const cancel = db.cancelWater({
      ...base,
      kind: 'latest',
      requestId: 'cancel',
      recordId: undone.todayRecords[0].id
    }).state
    assert.equal(cancel.todayCount, 0)
    assert.equal(cancel.todayMl, 0)
    assert.equal(cancel.growthPoints, 0)
  })
})

test('횟수 취소는 최신 기록만 허용하고 자정 이후 이전 요청을 거부한다', () => {
  withDatabase((db, path, setNow) => {
    const state = db.completeSetup({ requestId: 'setup', goalCount: 3, cupMl: 300 })
    const base = { expectedGoalId: state.goalId, day: state.day }
    const first = db.recordDrinkAction({ ...base, kind: 'add', requestId: 'one' }).state
    db.recordDrinkAction({ ...base, kind: 'add', requestId: 'two' })
    assert.throws(
      () =>
        db.recordDrinkAction({
          ...base,
          kind: 'undo',
          requestId: 'stale',
          recordId: first.latestDrinkId
        }),
      StaleStateError
    )
    setNow('2026-11-15T15:00:00Z')
    assert.equal(db.readState().todayCount, 0)
    assert.throws(
      () => db.recordDrinkAction({ ...base, kind: 'add', requestId: 'old-day' }),
      StaleStateError
    )
    assert.throws(
      () => db.recordDrinkAction({ ...base, kind: 'add', requestId: 'one', recordId: 2 }),
      InvalidSetupError
    )
  })
})

test('기존 8 버전 데이터는 백업 후 유지하고 새 목표 횟수 설정을 요구한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-legacy-'))
  const path = join(dir, 'data.sqlite')
  try {
    const db = new AppDatabase(path, () => new Date('2026-11-15T03:00:00Z'))
    const state = db.completeSetup({ requestId: 'setup', goalCount: 8, cupMl: 500 })
    db.recordCup({ requestId: 'water', expectedGoalId: state.goalId, day: state.day })
    db.close()
    const legacy = new DatabaseSync(path)
    legacy.exec(
      'DROP TABLE vitality_gains; DROP TABLE drink_actions; DROP TABLE drink_action_receipts; ALTER TABLE goal_sessions DROP COLUMN target_count; PRAGMA user_version = 8;'
    )
    legacy.close()
    const migrated = new AppDatabase(path, () => new Date('2026-11-15T03:00:00Z'))
    const restored = migrated.readState()
    assert.equal(restored.status, 'goal-stopped')
    assert.equal(restored.todayMl, 500)
    assert.equal(restored.todayCount, 0)
    assert.equal(restored.growthPoints, 500)
    assert.equal(readdirSync(join(dir, 'backups')).length, 1)
    migrated.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('기존 사용자가 새 횟수 목표를 설정하면 이전 기록과 성장은 보존된다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-convert-'))
  const path = join(dir, 'data.sqlite')
  try {
    const old = new AppDatabase(path, () => new Date('2026-11-15T03:00:00Z'))
    const setup = old.completeSetup({ requestId: 'setup', goalCount: 8, cupMl: 500 })
    old.recordCup({ requestId: 'bottle', expectedGoalId: setup.goalId, day: setup.day })
    old.close()
    const raw = new DatabaseSync(path)
    raw.exec(
      'DROP TABLE vitality_gains; DROP TABLE drink_actions; DROP TABLE drink_action_receipts; ALTER TABLE goal_sessions DROP COLUMN target_count; PRAGMA user_version = 8;'
    )
    raw.close()
    const db = new AppDatabase(path, () => new Date('2026-11-15T03:00:00Z'))
    const before = db.readState()
    assert.equal(before.status, 'goal-stopped')
    const next = db.updateSettings({
      requestId: 'new-goal',
      kind: 'goal',
      expectedGoalId: null,
      day: before.day,
      expectedTodayMl: before.todayMl,
      todayMl: before.todayMl,
      goalCount: 6
    })
    assert.equal(next.status, 'ready')
    assert.equal(next.goalCount, 6)
    assert.equal(next.todayCount, 0)
    assert.equal(next.todayMl, 500)
    assert.equal(next.growthPoints, 500)
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('횟수 저장에 실패하면 기록과 중복 방지 영수증을 함께 되돌린다', () => {
  withDatabase((db, path) => {
    const state = db.completeSetup({ requestId: 'setup', goalCount: 8, cupMl: 500 })
    const inspector = new DatabaseSync(path)
    inspector.exec(
      "CREATE TRIGGER fail_action BEFORE INSERT ON drink_action_receipts BEGIN SELECT RAISE(ABORT, 'forced failure'); END"
    )
    const input = { requestId: 'retry', expectedGoalId: state.goalId, day: state.day, kind: 'add' }
    assert.throws(() => db.recordDrinkAction(input))
    assert.equal(db.readState().todayCount, 0)
    inspector.exec('DROP TRIGGER fail_action')
    assert.equal(db.recordDrinkAction(input).state.todayCount, 1)
    inspector.close()
  })
})

test('횟수 목표 달성과 알림은 용량 기록이 아닌 행동 횟수를 사용한다', () => {
  withDatabase((db) => {
    const state = db.completeSetup({ requestId: 'setup', goalCount: 2, cupMl: 500 })
    const base = { expectedGoalId: state.goalId, day: state.day }
    db.recordCup({ ...base, requestId: 'bottle' })
    assert.equal(db.readStatistics().days.at(-1).achieved, false)
    db.recordDrinkAction({ ...base, kind: 'add', requestId: 'one' })
    db.recordDrinkAction({ ...base, kind: 'add', requestId: 'two' })
    const day = db.readStatistics().days.at(-1)
    assert.equal(day.drinkCount, 2)
    assert.equal(day.goalCount, 2)
    assert.equal(day.totalMl, 500)
    assert.equal(day.achieved, true)
    assert.equal(db.readReminderContext().todayCount, 2)
    assert.equal(db.readReminderContext().goalCount, 2)
  })
})

test('오늘 기록 전체 취소는 오늘 마신 횟수와 그 생기도 함께 취소한다', () => {
  withDatabase((db) => {
    let state = db.completeSetup({ requestId: 'setup', goalCount: 8, cupMl: 500 })
    const base = { expectedGoalId: state.goalId, day: state.day }
    db.recordDrinkAction({ ...base, kind: 'add', requestId: 'one', source: 'camera' })
    db.recordDrinkAction({ ...base, kind: 'add', requestId: 'two', source: 'camera' })
    state = db.recordCup({ ...base, requestId: 'bottle' }, { cameraActive: true }).state
    assert.equal(state.todayCount, 2)
    // 오늘 기록 목록에 보일 마신 횟수는 최신 순이고 출처를 담는다.
    assert.deepEqual(
      state.todayDrinks.map((drink) => [drink.id, drink.source]),
      [
        [2, 'camera'],
        [1, 'camera']
      ]
    )
    assert.equal(state.plantVitality, 87)
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const clear = (requestId, overrides = {}) =>
      db.cancelWater({
        ...base,
        requestId,
        kind: 'today',
        expectedRecordIds: state.todayRecords.map((record) => record.id),
        expectedDrinkCount: state.todayCount,
        expectedLatestDrinkId: state.latestDrinkId,
        ...overrides
      })
    // 화면에서 본 횟수와 다르면 취소하지 않는다.
    assert.throws(() => clear('stale', { expectedDrinkCount: 1 }))
    const result = clear('clear')
    assert.equal(result.cancelledCount, 3)
    assert.equal(result.state.todayCount, 0)
    assert.equal(result.state.latestDrinkId, null)
    assert.equal(result.state.todayMl, 0)
    assert.equal(result.state.plantVitality, 60)
    assert.equal(db.readStatistics().days.at(-1).drinkCount, 0)
  })
})

test('텀블러 기록 없이 마신 횟수만 있어도 전체 취소할 수 있다', () => {
  withDatabase((db) => {
    const state = db.completeSetup({ requestId: 'setup', goalCount: 8, cupMl: 500 })
    const base = { expectedGoalId: state.goalId, day: state.day }
    const added = db.recordDrinkAction({ ...base, kind: 'add', requestId: 'one' }).state
    const result = db.cancelWater({
      ...base,
      requestId: 'clear',
      kind: 'today',
      expectedRecordIds: [],
      expectedDrinkCount: 1,
      expectedLatestDrinkId: added.latestDrinkId
    })
    assert.equal(result.state.todayCount, 0)
    assert.throws(() =>
      db.cancelWater({
        ...base,
        requestId: 'again',
        kind: 'today',
        expectedRecordIds: [],
        expectedDrinkCount: 0,
        expectedLatestDrinkId: null
      })
    )
  })
})
