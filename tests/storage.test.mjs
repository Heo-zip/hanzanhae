import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// 실제 TypeScript 저장소를 임시 변환해 동일한 SQLite 동작을 검증한다.
const path = fileURLToPath(new URL('../src/main/storage/database.ts', import.meta.url))
const source = ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const moduleUnderTest = new Module(path)
moduleUnderTest.filename = path
moduleUnderTest._compile(source, path)
const {
  AppDatabase,
  AlreadyConfiguredError,
  InvalidSetupError,
  StaleStateError,
  NoRecordsError,
  TotalBelowZeroError
} = moduleUnderTest.exports
const day = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date())

test('최초 설정은 재실행해도 유지되고 같은 요청은 중복 저장되지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-storage-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    assert.deepEqual(db.readState(), { status: 'setup-required' })
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(
        () => db.completeSetup({ requestId: 'bad', goalMl: value, cupMl: 200 }),
        InvalidSetupError
      )
    }
    assert.deepEqual(db.readState(), { status: 'setup-required' })
    const input = { requestId: 'first', goalMl: 1500, cupMl: 250 }
    const expected = {
      status: 'ready',
      goalId: 1,
      goalMl: 1500,
      cupMl: 250,
      todayMl: 0,
      todayRecords: [],
      day,
      plantStage: 'seedling'
    }
    assert.deepEqual(db.completeSetup(input), expected)
    assert.deepEqual(db.completeSetup(input), expected)
    assert.throws(() => db.completeSetup({ ...input, cupMl: 300 }), InvalidSetupError)
    assert.throws(() => db.completeSetup({ ...input, requestId: 'second' }), AlreadyConfiguredError)
    db.close()
    const reopened = new AppDatabase(path)
    assert.deepEqual(reopened.readState(), expected)
    reopened.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('저장 도중 실패하면 모든 데이터가 취소되고 다시 시도할 수 있다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-rollback-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    const inspector = new DatabaseSync(path)
    inspector.exec(
      "CREATE TRIGGER fail_plant BEFORE INSERT ON plant_state BEGIN SELECT RAISE(ABORT, 'failure'); END"
    )
    const input = { requestId: 'retry', goalMl: 1200, cupMl: 200 }
    assert.throws(() => db.completeSetup(input))
    assert.deepEqual(db.readState(), { status: 'setup-required' })
    assert.equal(inspector.prepare('SELECT COUNT(*) AS n FROM mutation_receipts').get().n, 0)
    inspector.exec('DROP TRIGGER fail_plant')
    assert.equal(db.completeSetup(input).status, 'ready')
    inspector.exec("UPDATE goal_sessions SET stopped_at = '2026-11-13T00:00:00Z'")
    assert.deepEqual(db.readState(), {
      status: 'goal-stopped',
      cupMl: 200,
      todayMl: 0,
      todayRecords: [],
      day
    })
    assert.deepEqual(db.completeSetup(input), {
      status: 'ready',
      goalId: 1,
      goalMl: 1200,
      cupMl: 200,
      todayMl: 0,
      todayRecords: [],
      day,
      plantStage: 'seedling'
    })
    assert.deepEqual(db.readState(), {
      status: 'goal-stopped',
      cupMl: 200,
      todayMl: 0,
      todayRecords: [],
      day
    })
    assert.throws(() => db.completeSetup({ ...input, requestId: 'new' }), AlreadyConfiguredError)
    inspector.close()
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('불완전한 데이터는 최초 사용자로 오인하지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-corrupt-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    const inspector = new DatabaseSync(path)
    inspector.exec("INSERT INTO goal_sessions (target_ml, started_at) VALUES (1000, '2026-11-13')")
    assert.throws(() => db.readState(), /불완전한 설정 데이터/)
    inspector.close()
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('결과 이력만 남은 손상된 데이터도 최초 설정으로 처리하지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-orphan-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    const inspector = new DatabaseSync(path)
    inspector.exec("INSERT INTO mutation_receipts VALUES ('orphan', 1000, 200)")
    assert.throws(() => db.readState(), /불완전한 설정 데이터/)
    assert.throws(() => db.completeSetup({ requestId: 'orphan', goalMl: 1000, cupMl: 200 }))
    inspector.close()
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('목표 변경은 이력과 오늘 총량 차이를 보존하고 재전송은 중복되지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-goal-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    const first = db.completeSetup({ requestId: 'setup', goalMl: 1500, cupMl: 200 })
    const change = {
      requestId: 'change',
      kind: 'goal',
      goalMl: 1800,
      todayMl: 700,
      expectedTodayMl: 0,
      expectedGoalId: first.goalId,
      day
    }
    const changed = db.updateSettings(change)
    assert.equal(changed.todayMl, 700)
    assert.equal(changed.goalMl, 1800)
    assert.deepEqual(db.updateSettings(change), changed)
    assert.throws(() => db.updateSettings({ ...change, goalMl: 1600 }), InvalidSetupError)
    assert.throws(() => db.updateSettings({ ...change, requestId: 'stale' }), StaleStateError)
    assert.throws(
      () =>
        db.updateSettings({
          ...change,
          requestId: 'day',
          expectedGoalId: changed.goalId,
          expectedTodayMl: 700,
          day: '2000-01-01'
        }),
      StaleStateError
    )
    const inspector = new DatabaseSync(path)
    assert.equal(inspector.prepare('SELECT COUNT(*) AS n FROM goal_sessions').get().n, 2)
    assert.equal(inspector.prepare('SELECT COUNT(*) AS n FROM daily_adjustments').get().n, 1)
    const stop = db.updateSettings({
      requestId: 'stop',
      kind: 'stop',
      expectedGoalId: changed.goalId
    })
    assert.equal(stop.status, 'goal-stopped')
    assert.equal(stop.todayMl, 700)
    const restart = db.updateSettings({
      requestId: 'restart',
      kind: 'goal',
      goalMl: 2000,
      todayMl: 500,
      expectedTodayMl: 700,
      expectedGoalId: null,
      day
    })
    assert.equal(restart.todayMl, 500)
    assert.equal(db.updateSettings({ requestId: 'cup', kind: 'cup', cupMl: 300 }).cupMl, 300)
    inspector.close()
    db.close()
    const reopened = new AppDatabase(path)
    assert.deepEqual(reopened.readState(), { ...restart, cupMl: 300 })
    reopened.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('설정 저장 실패는 이전 목표와 조정을 함께 보존한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-settings-rollback-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    const before = db.completeSetup({ requestId: 'setup', goalMl: 1500, cupMl: 200 })
    const inspector = new DatabaseSync(path)
    inspector.exec(
      "CREATE TRIGGER fail_adjust BEFORE INSERT ON daily_adjustments BEGIN SELECT RAISE(ABORT, 'failure'); END"
    )
    const input = {
      requestId: 'retry',
      kind: 'goal',
      goalMl: 1800,
      todayMl: 500,
      expectedTodayMl: 0,
      expectedGoalId: before.goalId,
      day
    }
    assert.throws(() => db.updateSettings(input))
    assert.deepEqual(db.readState(), before)
    assert.equal(inspector.prepare('SELECT COUNT(*) AS n FROM goal_sessions').get().n, 1)
    inspector.exec('DROP TRIGGER fail_adjust')
    assert.equal(db.updateSettings(input).todayMl, 500)
    inspector.close()
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('버전 1 데이터는 설정을 유지하며 버전 4로 이전한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-migrate-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    const expected = db.completeSetup({ requestId: 'setup', goalMl: 1700, cupMl: 250 })
    db.close()
    const old = new DatabaseSync(path)
    old.exec(
      'DROP TABLE cancel_receipts; DROP TABLE water_records; DROP TABLE daily_adjustments; DROP TABLE settings_receipts; PRAGMA user_version = 1'
    )
    old.close()
    const migrated = new AppDatabase(path)
    assert.deepEqual(migrated.readState(), expected)
    assert.equal(migrated.updateSettings({ requestId: 'cup', kind: 'cup', cupMl: 300 }).cupMl, 300)
    migrated.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('물 기록은 용량을 보존하고 조정·이전 목표와 합산하며 중복 요청을 무시한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-water-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    const initial = db.completeSetup({ requestId: 'setup', goalMl: 300, cupMl: 200 })
    const first = { requestId: 'first', expectedGoalId: initial.goalId, day }
    const result = db.recordCup(first)
    assert.equal(result.created, true)
    assert.equal(result.state.todayMl, 200)
    assert.equal(result.state.todayRecords.length, 1)
    db.updateSettings({ requestId: 'cup', kind: 'cup', cupMl: 250 })
    assert.equal(db.recordCup(first).created, false)
    assert.throws(() => db.recordCup({ ...first, expectedGoalId: 999 }), InvalidSetupError)
    const second = db.recordCup({ ...first, requestId: 'second' }).state
    assert.equal(second.todayMl, 450)
    assert.deepEqual(
      second.todayRecords.map((r) => r.amountMl),
      [250, 200]
    )
    const changed = db.updateSettings({
      requestId: 'goal',
      kind: 'goal',
      goalMl: 2000,
      todayMl: 700,
      expectedTodayMl: 450,
      expectedGoalId: initial.goalId,
      day
    })
    assert.equal(changed.todayMl, 700)
    assert.equal(changed.todayRecords.length, 2)
    assert.throws(() => db.recordCup({ ...first, requestId: 'old-goal' }), StaleStateError)
    const third = db.recordCup({ requestId: 'third', expectedGoalId: changed.goalId, day }).state
    assert.equal(third.todayMl, 950)
    assert.equal(third.todayRecords.length, 3)
    db.close()
    const reopened = new AppDatabase(path)
    assert.deepEqual(reopened.readState(), third)
    reopened.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('물 기록 저장 실패는 데이터와 요청 ID를 남기지 않고 재시도할 수 있다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-water-fail-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    const initial = db.completeSetup({ requestId: 'setup', goalMl: 1000, cupMl: 200 })
    const sql = new DatabaseSync(path)
    sql.exec(
      "CREATE TRIGGER fail_water BEFORE INSERT ON water_records BEGIN SELECT RAISE(ABORT, 'failure'); END"
    )
    const input = { requestId: 'retry', expectedGoalId: initial.goalId, day }
    assert.throws(() => db.recordCup(input))
    assert.deepEqual(db.readState(), initial)
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM water_records').get().n, 0)
    sql.exec('DROP TRIGGER fail_water')
    assert.equal(db.recordCup(input).state.todayMl, 200)
    db.updateSettings({ requestId: 'stop', kind: 'stop', expectedGoalId: initial.goalId })
    assert.throws(() => db.recordCup({ ...input, requestId: 'stopped' }), StaleStateError)
    assert.equal(db.recordCup(input).created, false)
    sql.close()
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('한국 자정 이후 이전 날짜 요청은 거절하고 새 날짜 기록을 구분한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-water-day-'))
  const path = join(dir, 'test.sqlite')
  try {
    let now = new Date('2026-11-13T14:59:59.000Z')
    const db = new AppDatabase(path, () => now)
    const initial = db.completeSetup({ requestId: 'setup', goalMl: 1000, cupMl: 200 })
    assert.equal(initial.day, '2026-11-13')
    const old = { requestId: 'before', expectedGoalId: initial.goalId, day: initial.day }
    assert.equal(db.recordCup(old).state.todayMl, 200)
    now = new Date('2026-11-13T15:00:00.000Z')
    assert.equal(db.readState().day, '2026-11-14')
    assert.equal(db.readState().todayMl, 0)
    assert.throws(() => db.recordCup({ ...old, requestId: 'stale' }), StaleStateError)
    assert.equal(db.recordCup({ ...old, requestId: 'after', day: '2026-11-14' }).state.todayMl, 200)
    assert.equal(db.recordCup(old).created, false)
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('버전 2 데이터의 목표와 조정을 보존하며 물 기록 테이블을 추가한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-water-migration-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    const initial = db.completeSetup({ requestId: 'setup', goalMl: 1000, cupMl: 250 })
    const changed = db.updateSettings({
      requestId: 'change',
      kind: 'goal',
      goalMl: 1500,
      todayMl: 300,
      expectedTodayMl: 0,
      expectedGoalId: initial.goalId,
      day
    })
    db.close()
    const old = new DatabaseSync(path)
    old.exec('DROP TABLE cancel_receipts; DROP TABLE water_records; PRAGMA user_version = 2')
    old.close()
    const migrated = new AppDatabase(path)
    assert.deepEqual(migrated.readState(), changed)
    assert.equal(
      migrated.recordCup({ requestId: 'cup', expectedGoalId: changed.goalId, day }).state.todayMl,
      550
    )
    migrated.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('최근 한 잔 취소는 최신 기록만 대상으로 하고 재전송해도 다른 잔을 취소하지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-cancel-latest-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    const start = db.completeSetup({ requestId: 'setup', goalMl: 1000, cupMl: 200 })
    const base = { expectedGoalId: start.goalId, day: start.day }
    const one = db.recordCup({ ...base, requestId: 'one' }).state
    const two = db.recordCup({ ...base, requestId: 'two' }).state
    assert.throws(
      () =>
        db.cancelWater({
          ...base,
          requestId: 'old',
          kind: 'latest',
          recordId: one.todayRecords[0].id
        }),
      StaleStateError
    )
    const input = { ...base, requestId: 'cancel', kind: 'latest', recordId: two.todayRecords[0].id }
    const result = db.cancelWater(input)
    assert.equal(result.cancelledCount, 1)
    assert.equal(result.created, true)
    assert.equal(result.state.todayMl, 200)
    assert.deepEqual(
      result.state.todayRecords.map((r) => r.id),
      [one.todayRecords[0].id]
    )
    const three = db.recordCup({ ...base, requestId: 'three' }).state
    const replay = db.cancelWater(input)
    assert.equal(replay.created, false)
    assert.deepEqual(replay.state, three)
    assert.throws(
      () => db.cancelWater({ ...input, recordId: three.todayRecords[0].id }),
      InvalidSetupError
    )
    db.close()
    const reopened = new AppDatabase(path)
    assert.deepEqual(reopened.readState(), three)
    reopened.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('오늘 전체 취소는 현재 목표 기록만 취소하고 이전 목표·다른 날짜·조정을 보존한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-cancel-scope-'))
  const path = join(dir, 'test.sqlite')
  try {
    let now = new Date('2026-11-12T14:00:00Z')
    const db = new AppDatabase(path, () => now)
    const a = db.completeSetup({ requestId: 'setup', goalMl: 1000, cupMl: 250 })
    const previousDay = db.recordCup({
      requestId: 'yesterday',
      expectedGoalId: a.goalId,
      day: a.day
    }).state.day
    now = new Date('2026-11-13T01:00:00Z')
    const today = db.readState().day
    db.recordCup({ requestId: 'a1', expectedGoalId: a.goalId, day: today })
    db.recordCup({ requestId: 'a2', expectedGoalId: a.goalId, day: today })
    const b = db.updateSettings({
      requestId: 'goal',
      kind: 'goal',
      goalMl: 2000,
      todayMl: 700,
      expectedTodayMl: 500,
      expectedGoalId: a.goalId,
      day: today
    })
    db.updateSettings({ requestId: 'cup', kind: 'cup', cupMl: 300 })
    const before = db.recordCup({ requestId: 'b1', expectedGoalId: b.goalId, day: today }).state
    assert.equal(before.todayMl, 1000)
    const id = before.todayRecords.find((r) => r.goalId === b.goalId).id
    const input = {
      requestId: 'all',
      kind: 'today',
      expectedGoalId: b.goalId,
      day: today,
      expectedRecordIds: [id]
    }
    const result = db.cancelWater(input)
    assert.equal(result.cancelledCount, 1)
    assert.equal(result.state.todayMl, 700)
    assert.equal(result.state.goalId, b.goalId)
    assert.equal(result.state.todayRecords.length, 2)
    assert.equal(
      result.state.todayRecords.every((r) => r.goalId === a.goalId),
      true
    )
    assert.equal(db.cancelWater(input).created, false)
    assert.throws(
      () => db.cancelWater({ ...input, requestId: 'none', expectedRecordIds: [] }),
      NoRecordsError
    )
    const later = db.recordCup({ requestId: 'b2', expectedGoalId: b.goalId, day: today }).state
    assert.equal(later.todayMl, 1000)
    assert.deepEqual(db.cancelWater(input).state, later)
    const inspector = new DatabaseSync(path)
    assert.equal(
      inspector
        .prepare('SELECT COUNT(*) AS n FROM water_records WHERE day = ? AND cancelled_at IS NULL')
        .get(previousDay).n,
      1
    )
    assert.equal(
      inspector
        .prepare('SELECT SUM(amount_ml) AS n FROM daily_adjustments WHERE day = ?')
        .get(today).n,
      200
    )
    inspector.close()
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('전체 취소는 확인 후 기록이 바뀌면 거절하고 저장 실패 시 전체 롤백한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-cancel-rollback-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    const state = db.completeSetup({ requestId: 'setup', goalMl: 1000, cupMl: 250 })
    const base = { expectedGoalId: state.goalId, day: state.day }
    const one = db.recordCup({ ...base, requestId: 'one' }).state
    const stale = {
      ...base,
      requestId: 'stale',
      kind: 'today',
      expectedRecordIds: one.todayRecords.map((r) => r.id)
    }
    const two = db.recordCup({ ...base, requestId: 'two' }).state
    assert.throws(() => db.cancelWater(stale), StaleStateError)
    assert.equal(db.readState().todayMl, 500)
    const inspector = new DatabaseSync(path)
    inspector.exec(
      `CREATE TRIGGER fail_cancel BEFORE UPDATE OF cancelled_at ON water_records WHEN OLD.id = ${one.todayRecords[0].id} BEGIN SELECT RAISE(ABORT, 'failure'); END`
    )
    const input = {
      ...base,
      requestId: 'retry',
      kind: 'today',
      expectedRecordIds: two.todayRecords.map((r) => r.id)
    }
    assert.throws(() => db.cancelWater(input))
    assert.deepEqual(db.readState(), two)
    assert.equal(inspector.prepare('SELECT COUNT(*) AS n FROM cancel_receipts').get().n, 0)
    inspector.exec('DROP TRIGGER fail_cancel')
    inspector.exec(
      "CREATE TRIGGER fail_receipt BEFORE INSERT ON cancel_receipts BEGIN SELECT RAISE(ABORT, 'failure'); END"
    )
    assert.throws(() => db.cancelWater(input))
    assert.deepEqual(db.readState(), two)
    assert.equal(inspector.prepare('SELECT COUNT(*) AS n FROM cancel_receipts').get().n, 0)
    inspector.exec('DROP TRIGGER fail_receipt')
    assert.equal(db.cancelWater(input).state.todayMl, 0)
    inspector.close()
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('취소 후 총량이 음수면 어떤 기록도 취소하지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-cancel-negative-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    const initial = db.completeSetup({ requestId: 'setup', goalMl: 1000, cupMl: 500 })
    db.recordCup({ requestId: 'one', expectedGoalId: initial.goalId, day: initial.day })
    const sql = new DatabaseSync(path)
    sql
      .prepare(
        'INSERT INTO daily_adjustments (goal_id, day, amount_ml, created_at) VALUES (?, ?, ?, ?)'
      )
      .run(initial.goalId, initial.day, -300, '2026-11-13T00:00:00Z')
    const before = db.readState()
    assert.equal(before.todayMl, 200)
    assert.throws(
      () =>
        db.cancelWater({
          requestId: 'negative',
          kind: 'latest',
          expectedGoalId: initial.goalId,
          day: initial.day,
          recordId: before.todayRecords[0].id
        }),
      TotalBelowZeroError
    )
    assert.deepEqual(db.readState(), before)
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM cancel_receipts').get().n, 0)
    sql.close()
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('한국 자정 이후 이전 날짜 취소 요청을 거절하고 어제 기록을 보존한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-cancel-day-'))
  const path = join(dir, 'test.sqlite')
  try {
    let now = new Date('2026-11-13T14:59:59Z')
    const db = new AppDatabase(path, () => now)
    const initial = db.completeSetup({ requestId: 'setup', goalMl: 1000, cupMl: 250 })
    const recorded = db.recordCup({
      requestId: 'one',
      expectedGoalId: initial.goalId,
      day: initial.day
    }).state
    const input = {
      requestId: 'cancel',
      kind: 'latest',
      expectedGoalId: initial.goalId,
      day: initial.day,
      recordId: recorded.todayRecords[0].id
    }
    now = new Date('2026-11-13T15:00:00Z')
    assert.throws(() => db.cancelWater(input), StaleStateError)
    assert.equal(db.readState().todayMl, 0)
    const sql = new DatabaseSync(path)
    assert.equal(
      sql.prepare('SELECT cancelled_at FROM water_records WHERE id = ?').get(input.recordId)
        .cancelled_at,
      null
    )
    sql.close()
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('버전 3 데이터의 기록을 보존하며 취소 이력 테이블을 추가한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-cancel-migration-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    const initial = db.completeSetup({ requestId: 'setup', goalMl: 1000, cupMl: 250 })
    const recorded = db.recordCup({
      requestId: 'one',
      expectedGoalId: initial.goalId,
      day: initial.day
    }).state
    db.close()
    const old = new DatabaseSync(path)
    old.exec('DROP TABLE cancel_receipts; PRAGMA user_version = 3')
    old.close()
    const migrated = new AppDatabase(path)
    assert.deepEqual(migrated.readState(), recorded)
    assert.equal(
      migrated.cancelWater({
        requestId: 'cancel',
        kind: 'latest',
        expectedGoalId: initial.goalId,
        day: initial.day,
        recordId: recorded.todayRecords[0].id
      }).state.todayMl,
      0
    )
    migrated.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('목표가 중단되거나 다른 목표로 바뀌면 이전 목표 기록을 취소할 수 없다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-cancel-stale-goal-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    const first = db.completeSetup({ requestId: 'setup', goalMl: 1000, cupMl: 250 })
    const recorded = db.recordCup({
      requestId: 'one',
      expectedGoalId: first.goalId,
      day: first.day
    }).state
    const old = {
      kind: 'latest',
      expectedGoalId: first.goalId,
      day: first.day,
      recordId: recorded.todayRecords[0].id
    }
    db.updateSettings({ requestId: 'stop', kind: 'stop', expectedGoalId: first.goalId })
    assert.throws(() => db.cancelWater({ ...old, requestId: 'stopped' }), StaleStateError)
    const next = db.updateSettings({
      requestId: 'new',
      kind: 'goal',
      expectedGoalId: null,
      day: first.day,
      expectedTodayMl: 250,
      goalMl: 1500,
      todayMl: 250
    })
    assert.throws(() => db.cancelWater({ ...old, requestId: 'different-goal' }), StaleStateError)
    assert.equal(db.readState().todayMl, 250)
    assert.equal(db.readState().goalId, next.goalId)
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
