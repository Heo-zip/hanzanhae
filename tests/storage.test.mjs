import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
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
// 저장소가 가져오는 정책 모듈도 같은 방식으로 변환한다.
const previousTsLoader = Module._extensions['.ts']
Module._extensions['.ts'] = (module, filename) => {
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  module._compile(compiled, filename)
}
moduleUnderTest._compile(source, path)
if (previousTsLoader) Module._extensions['.ts'] = previousTsLoader
else delete Module._extensions['.ts']
const {
  AppDatabase,
  recoverInterruptedReset,
  resetDatabaseFile,
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

// 기존 ml 목표는 보존하지만 횟수 목표를 새로 설정하기 전까지 활성 목표로 쓰지 않는다.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function legacyState(state) {
  const result = { ...state, status: 'goal-stopped' }
  delete result.goalId
  delete result.goalCount
  return result
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function startCountGoal(db, state, requestId = 'count-goal') {
  return db.updateSettings({
    requestId,
    kind: 'goal',
    goalCount: 8,
    expectedGoalId: null,
    day: state.day,
    expectedTodayMl: state.todayMl,
    todayMl: state.todayMl
  })
}

test('최초 설정은 재실행해도 유지되고 같은 요청은 중복 저장되지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-storage-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    assert.deepEqual(db.readState(), { status: 'setup-required' })
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(
        () => db.completeSetup({ requestId: 'bad', goalCount: value, cupMl: 200 }),
        InvalidSetupError
      )
    }
    assert.deepEqual(db.readState(), { status: 'setup-required' })
    const input = { requestId: 'first', goalCount: 1500, cupMl: 250 }
    const expected = {
      status: 'ready',
      goalId: 1,
      goalCount: 1500,
      cupMl: 250,
      todayMl: 0,
      todayRecords: [],
      todayCount: 0,
      latestDrinkId: null,
      todayDrinks: [],
      day,
      plantStage: 'seedling',
      plantVitality: 60,
      growthPoints: 0
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
    const input = { requestId: 'retry', goalCount: 1200, cupMl: 200 }
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
      todayCount: 0,
      latestDrinkId: null,
      todayDrinks: [],
      day,
      plantStage: 'seedling',
      plantVitality: 60,
      growthPoints: 0
    })
    assert.deepEqual(db.completeSetup(input), {
      status: 'ready',
      goalId: 1,
      goalCount: 1200,
      cupMl: 200,
      todayMl: 0,
      todayRecords: [],
      todayCount: 0,
      latestDrinkId: null,
      todayDrinks: [],
      day,
      plantStage: 'seedling',
      plantVitality: 60,
      growthPoints: 0
    })
    assert.deepEqual(db.readState(), {
      status: 'goal-stopped',
      cupMl: 200,
      todayMl: 0,
      todayRecords: [],
      todayCount: 0,
      latestDrinkId: null,
      todayDrinks: [],
      day,
      plantStage: 'seedling',
      plantVitality: 60,
      growthPoints: 0
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
    assert.throws(() => db.completeSetup({ requestId: 'orphan', goalCount: 1000, cupMl: 200 }))
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
    const first = db.completeSetup({ requestId: 'setup', goalCount: 1500, cupMl: 200 })
    const change = {
      requestId: 'change',
      kind: 'goal',
      goalCount: 1800,
      todayMl: 700,
      expectedTodayMl: 0,
      expectedGoalId: first.goalId,
      day
    }
    const changed = db.updateSettings(change)
    assert.equal(changed.todayMl, 700)
    assert.equal(changed.goalCount, 1800)
    assert.deepEqual(db.updateSettings(change), changed)
    assert.throws(() => db.updateSettings({ ...change, goalCount: 1600 }), InvalidSetupError)
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
      goalCount: 2000,
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
    const before = db.completeSetup({ requestId: 'setup', goalCount: 1500, cupMl: 200 })
    const inspector = new DatabaseSync(path)
    inspector.exec(
      "CREATE TRIGGER fail_adjust BEFORE INSERT ON daily_adjustments BEGIN SELECT RAISE(ABORT, 'failure'); END"
    )
    const input = {
      requestId: 'retry',
      kind: 'goal',
      goalCount: 1800,
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

test('버전 1 데이터는 설정을 유지하며 버전 8로 이전한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-migrate-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    const expected = db.completeSetup({ requestId: 'setup', goalCount: 1700, cupMl: 250 })
    db.close()
    const old = new DatabaseSync(path)
    old.exec(
      'DROP TABLE vitality_gains; DROP TABLE reminder_settings; DROP TABLE garden_settings; DROP TABLE growth_events; DROP TABLE plant_vitality; DROP TABLE cancel_receipts; DROP TABLE water_records; DROP TABLE daily_adjustments; DROP TABLE settings_receipts; DROP TABLE drink_actions; DROP TABLE drink_action_receipts; ALTER TABLE goal_sessions DROP COLUMN target_count; PRAGMA user_version = 1'
    )
    old.close()
    const migrated = new AppDatabase(path)
    // 버전 5 이전 데이터의 생기는 그때의 기본값 80으로 만든다.
    assert.deepEqual(migrated.readState(), { ...legacyState(expected), plantVitality: 80 })
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
    const initial = db.completeSetup({ requestId: 'setup', goalCount: 300, cupMl: 200 })
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
      goalCount: 2000,
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
    const initial = db.completeSetup({ requestId: 'setup', goalCount: 1000, cupMl: 200 })
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
    const initial = db.completeSetup({ requestId: 'setup', goalCount: 1000, cupMl: 200 })
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
    const initial = db.completeSetup({ requestId: 'setup', goalCount: 1000, cupMl: 250 })
    const changed = db.updateSettings({
      requestId: 'change',
      kind: 'goal',
      goalCount: 1500,
      todayMl: 300,
      expectedTodayMl: 0,
      expectedGoalId: initial.goalId,
      day
    })
    db.close()
    const old = new DatabaseSync(path)
    old.exec(
      'DROP TABLE vitality_gains; DROP TABLE reminder_settings; DROP TABLE garden_settings; DROP TABLE growth_events; DROP TABLE plant_vitality; DROP TABLE cancel_receipts; DROP TABLE water_records; DROP TABLE drink_actions; DROP TABLE drink_action_receipts; ALTER TABLE goal_sessions DROP COLUMN target_count; PRAGMA user_version = 2'
    )
    old.close()
    const migrated = new AppDatabase(path)
    assert.deepEqual(migrated.readState(), { ...legacyState(changed), plantVitality: 80 })
    const countGoal = startCountGoal(migrated, migrated.readState())
    assert.equal(
      migrated.recordCup({ requestId: 'cup', expectedGoalId: countGoal.goalId, day }).state.todayMl,
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
    const start = db.completeSetup({ requestId: 'setup', goalCount: 1000, cupMl: 200 })
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
    const a = db.completeSetup({ requestId: 'setup', goalCount: 1000, cupMl: 250 })
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
      goalCount: 2000,
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
      expectedDrinkCount: 0,
      expectedLatestDrinkId: null,
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
    const state = db.completeSetup({ requestId: 'setup', goalCount: 1000, cupMl: 250 })
    const base = { expectedGoalId: state.goalId, day: state.day }
    const one = db.recordCup({ ...base, requestId: 'one' }).state
    const stale = {
      ...base,
      requestId: 'stale',
      kind: 'today',
      expectedDrinkCount: 0,
      expectedLatestDrinkId: null,
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
      expectedDrinkCount: 0,
      expectedLatestDrinkId: null,
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
    const initial = db.completeSetup({ requestId: 'setup', goalCount: 1000, cupMl: 500 })
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
    const initial = db.completeSetup({ requestId: 'setup', goalCount: 1000, cupMl: 250 })
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
    const initial = db.completeSetup({ requestId: 'setup', goalCount: 1000, cupMl: 250 })
    const recorded = db.recordCup({
      requestId: 'one',
      expectedGoalId: initial.goalId,
      day: initial.day
    }).state
    db.close()
    const old = new DatabaseSync(path)
    old.exec(
      'DROP TABLE vitality_gains; DROP TABLE reminder_settings; DROP TABLE garden_settings; DROP TABLE growth_events; DROP TABLE plant_vitality; DROP TABLE cancel_receipts; DROP TABLE drink_actions; DROP TABLE drink_action_receipts; ALTER TABLE goal_sessions DROP COLUMN target_count; PRAGMA user_version = 3'
    )
    old.close()
    const migrated = new AppDatabase(path)
    assert.deepEqual(migrated.readState(), {
      ...legacyState(recorded),
      plantVitality: 80,
      growthPoints: 0,
      plantStage: 'seedling'
    })
    assert.throws(
      () =>
        migrated.cancelWater({
          requestId: 'cancel',
          kind: 'latest',
          expectedGoalId: initial.goalId,
          day: initial.day,
          recordId: recorded.todayRecords[0].id
        }),
      StaleStateError
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
    const first = db.completeSetup({ requestId: 'setup', goalCount: 1000, cupMl: 250 })
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
      goalCount: 1500,
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

test('기록한 텀블러 용량에 따라 성장하고 취소·재기록이 중복되지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-growth-'))
  try {
    const db = new AppDatabase(join(dir, 'test.sqlite'), () => new Date('2026-11-13T03:00:00Z'))
    let state = db.completeSetup({ requestId: 'setup', goalCount: 500, cupMl: 300 })
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const record = (id) =>
      db.recordCup({ requestId: id, expectedGoalId: state.goalId, day: state.day })
    state = record('one').state
    assert.equal(state.growthPoints, 300)
    assert.equal(state.plantVitality, 90)
    state = record('two').state
    assert.equal(state.growthPoints, 600)
    assert.equal(state.plantVitality, 100)
    state = record('three').state
    assert.equal(state.growthPoints, 900)
    assert.equal(record('three').created, false)
    assert.equal(db.readState().growthPoints, 900)
    state = db.cancelWater({
      requestId: 'undo-three',
      kind: 'latest',
      expectedGoalId: state.goalId,
      day: state.day,
      recordId: state.todayRecords[0].id
    }).state
    assert.equal(state.growthPoints, 600)
    state = db.cancelWater({
      requestId: 'undo-two',
      kind: 'latest',
      expectedGoalId: state.goalId,
      day: state.day,
      recordId: state.todayRecords[0].id
    }).state
    assert.equal(state.growthPoints, 300)
    state = record('four').state
    assert.equal(state.growthPoints, 600)
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('목표 변경 후 전체 취소는 이전 목표와 이전 날짜의 성장을 보존하고 단계를 복원한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-growth-scope-'))
  let now = new Date('2026-11-12T03:00:00Z')
  try {
    const path = join(dir, 'test.sqlite')
    const db = new AppDatabase(path, () => now)
    let state = db.completeSetup({ requestId: 'setup', goalCount: 100, cupMl: 1000 })
    for (let i = 0; i < 3; i++)
      state = db.recordCup({
        requestId: `old-${i}`,
        expectedGoalId: state.goalId,
        day: state.day
      }).state
    assert.equal(state.growthPoints, 3000)
    assert.equal(state.plantStage, 'young')
    now = new Date('2026-11-13T03:00:00Z')
    state = db.readState()
    state = db.recordCup({
      requestId: 'old-today',
      expectedGoalId: state.goalId,
      day: state.day
    }).state
    assert.equal(state.growthPoints, 4000)
    state = db.updateSettings({
      requestId: 'change',
      kind: 'goal',
      expectedGoalId: state.goalId,
      expectedTodayMl: state.todayMl,
      day: state.day,
      goalCount: 200,
      todayMl: state.todayMl
    })
    state = db.recordCup({
      requestId: 'new-today',
      expectedGoalId: state.goalId,
      day: state.day
    }).state
    assert.equal(state.growthPoints, 5000)
    state = db.cancelWater({
      requestId: 'clear',
      kind: 'today',
      expectedDrinkCount: 0,
      expectedLatestDrinkId: null,
      expectedGoalId: state.goalId,
      day: state.day,
      expectedRecordIds: state.todayRecords
        .filter((item) => item.goalId === state.goalId)
        .map((item) => item.id)
    }).state
    assert.equal(state.growthPoints, 4000)
    assert.equal(state.todayMl, 1000)
    db.close()
    const reopened = new AppDatabase(path, () => now)
    assert.equal(reopened.readState().growthPoints, 4000)
    assert.equal(reopened.readState().plantStage, 'young')
    reopened.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('성장 저장 실패는 물 기록과 생기 회복도 함께 롤백한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-growth-rollback-'))
  try {
    const path = join(dir, 'test.sqlite')
    const db = new AppDatabase(path, () => new Date('2026-11-13T03:00:00Z'))
    const state = db.completeSetup({ requestId: 'setup', goalCount: 100, cupMl: 100 })
    const inspector = new DatabaseSync(path)
    inspector.exec(
      "CREATE TRIGGER fail_growth BEFORE INSERT ON growth_events BEGIN SELECT RAISE(ABORT, 'failure'); END"
    )
    const input = { requestId: 'cup', expectedGoalId: state.goalId, day: state.day }
    assert.throws(() => db.recordCup(input))
    assert.deepEqual(db.readState(), state)
    inspector.exec('DROP TRIGGER fail_growth')
    const result = db.recordCup(input)
    assert.equal(result.state.growthPoints, 100)
    assert.equal(result.state.plantVitality, 90)
    inspector.close()
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('생기는 사용 중 시간당 10, 자리 비움·종료 중 시간당 2씩 줄고 재실행으로 복원한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-vitality-'))
  let now = new Date('2026-11-13T00:00:00Z')
  // 앱은 1분마다 생기를 저장한다. 그 주기를 흉내 낸다.
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const run = (db, minutes) => {
    for (let i = 0; i < minutes; i++) {
      now = new Date(now.getTime() + 60_000)
      db.checkpointPlant()
    }
  }
  try {
    const path = join(dir, 'test.sqlite')
    let db = new AppDatabase(path, () => now)
    db.completeSetup({ requestId: 'setup', goalCount: 8, cupMl: 200 })
    assert.equal(db.readState().plantVitality, 60)
    run(db, 60)
    assert.equal(db.readState().plantVitality, 50)
    db.setPresence('away')
    run(db, 300)
    assert.equal(db.readState().plantVitality, 40)
    db.setPresence('active')
    run(db, 30)
    assert.equal(db.readState().plantVitality, 35)
    db.close()
    now = new Date(now.getTime() + 5 * 3_600_000)
    db = new AppDatabase(path, () => now)
    assert.equal(db.readState().plantVitality, 25)
    now = new Date(now.getTime() + 48 * 3_600_000)
    assert.equal(db.readState().plantVitality, 20)
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('버전 4의 기존 물 기록은 보존하되 성장 보상을 소급하지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-v4-'))
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const now = () => new Date('2026-11-13T03:00:00Z')
  try {
    const path = join(dir, 'test.sqlite')
    let db = new AppDatabase(path, now)
    let state = db.completeSetup({ requestId: 'setup', goalCount: 100, cupMl: 100 })
    state = db.recordCup({ requestId: 'old', expectedGoalId: state.goalId, day: state.day }).state
    db.close()
    const old = new DatabaseSync(path)
    old.exec(
      'DROP TABLE vitality_gains; DROP TABLE reminder_settings; DROP TABLE garden_settings; DROP TABLE growth_events; DROP TABLE plant_vitality; DROP TABLE drink_actions; DROP TABLE drink_action_receipts; ALTER TABLE goal_sessions DROP COLUMN target_count; PRAGMA user_version = 4'
    )
    old.close()
    db = new AppDatabase(path, now)
    state = db.readState()
    assert.equal(state.todayMl, 100)
    assert.equal(state.todayRecords.length, 1)
    assert.equal(state.growthPoints, 0)
    assert.equal(state.plantVitality, 80)
    state = startCountGoal(db, state)
    state = db.recordCup({ requestId: 'new', expectedGoalId: state.goalId, day: state.day }).state
    assert.equal(state.growthPoints, 100)
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('저장 주기가 끊긴 잠자기·강제 종료 공백은 자리 비움 속도로 계산한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-checkpoint-'))
  let now = new Date('2026-11-13T00:00:00Z')
  try {
    const path = join(dir, 'test.sqlite')
    const db = new AppDatabase(path, () => now)
    db.completeSetup({ requestId: 'setup', goalCount: 8, cupMl: 200 })
    // 잠자기 알림 없이 10시간이 지나도 처음 3분만 사용 중으로 본다.
    now = new Date('2026-11-13T10:00:00Z')
    db.checkpointPlant()
    assert.equal(db.readState().plantVitality, 40)
    // 강제 종료 뒤 재실행해도 마지막 저장 이후는 종료 중 속도로 계산한다.
    now = new Date('2026-11-13T15:00:00Z')
    const reopened = new AppDatabase(path, () => now)
    assert.equal(reopened.readState().plantVitality, 30)
    reopened.close()
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('마신 횟수는 생기를 6 올리고 버튼은 5분에 한 번만, 카메라는 제한 없이 올린다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-drink-vitality-'))
  let now = new Date('2026-11-13T03:00:00Z')
  try {
    const db = new AppDatabase(join(dir, 'test.sqlite'), () => now)
    let state = db.completeSetup({ requestId: 'setup', goalCount: 8, cupMl: 200 })
    db.setPresence('away')
    const base = { expectedGoalId: state.goalId, day: state.day, kind: 'add' }
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const add = (requestId, source) => db.recordDrinkAction({ ...base, requestId, source }).state
    assert.equal(add('button-1').plantVitality, 66)
    assert.equal(add('button-2', 'button').plantVitality, 66)
    assert.equal(add('camera-1', 'camera').plantVitality, 72)
    assert.equal(add('camera-2', 'camera').plantVitality, 78)
    state = db.recordDrinkAction({
      ...base,
      kind: 'undo',
      requestId: 'undo-camera-2',
      recordId: db.readState().latestDrinkId
    }).state
    assert.equal(state.plantVitality, 72)
    assert.equal(state.todayCount, 3)
    // 버튼 5분 제한은 마지막으로 생기를 올린 버튼 기록부터 센다.
    now = new Date('2026-11-13T03:04:00Z')
    assert.equal(add('button-3').plantVitality, 72)
    now = new Date('2026-11-13T03:06:00Z')
    assert.equal(add('button-4').plantVitality, 78)
    assert.equal(db.readState().todayCount, 5)
    assert.throws(() => add('bad', 'remote'))
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('텀블러는 카메라를 쓰면 15, 안 쓰면 30 올리고 취소하면 실제로 오른 만큼만 되돌린다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-cup-vitality-'))
  const now = new Date('2026-11-13T03:00:00Z')
  try {
    const db = new AppDatabase(join(dir, 'test.sqlite'), () => now)
    let state = db.completeSetup({ requestId: 'setup', goalCount: 8, cupMl: 200 })
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const cup = (requestId, cameraActive) =>
      db.recordCup({ requestId, expectedGoalId: state.goalId, day: state.day }, { cameraActive })
        .state
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const cancelLatest = (requestId) =>
      db.cancelWater({
        requestId,
        kind: 'latest',
        expectedGoalId: state.goalId,
        day: state.day,
        recordId: db.readState().todayRecords[0].id
      }).state
    assert.equal(cup('with-camera', true).plantVitality, 75)
    assert.equal(cup('without-camera', false).plantVitality, 100)
    assert.equal(cancelLatest('undo-1').plantVitality, 75)
    assert.equal(cancelLatest('undo-2').plantVitality, 60)
    state = db.readState()
    cup('a')
    cup('b')
    state = db.cancelWater({
      requestId: 'clear',
      kind: 'today',
      expectedDrinkCount: 0,
      expectedLatestDrinkId: null,
      expectedGoalId: state.goalId,
      day: state.day,
      expectedRecordIds: db.readState().todayRecords.map((record) => record.id)
    }).state
    assert.equal(state.plantVitality, 60)
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('정원에서는 15초 안의 최신 카메라 기록만 되돌릴 수 있다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-garden-undo-'))
  let now = new Date('2026-11-13T03:00:00Z')
  try {
    const db = new AppDatabase(join(dir, 'test.sqlite'), () => now)
    const state = db.completeSetup({ requestId: 'setup', goalCount: 8, cupMl: 200 })
    const base = { expectedGoalId: state.goalId, day: state.day }
    const garden = { recentCameraOnly: true }
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const undo = (requestId) =>
      db.recordDrinkAction(
        { ...base, kind: 'undo', requestId, recordId: db.readState().latestDrinkId },
        garden
      )
    assert.throws(() => db.recordDrinkAction({ ...base, kind: 'add', requestId: 'g-add' }, garden))
    db.recordDrinkAction({ ...base, kind: 'add', requestId: 'button' })
    assert.throws(() => undo('undo-button'))
    db.recordDrinkAction({ ...base, kind: 'add', requestId: 'old', source: 'camera' })
    now = new Date('2026-11-13T03:00:20Z')
    assert.throws(() => undo('undo-old'))
    db.recordDrinkAction({ ...base, kind: 'add', requestId: 'fresh', source: 'camera' })
    now = new Date('2026-11-13T03:00:28Z')
    assert.equal(undo('undo-fresh').state.todayCount, 2)
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('설정 없이 생기만 남은 데이터는 새로운 사용자로 오인하지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-orphan-vitality-'))
  try {
    const path = join(dir, 'test.sqlite')
    const db = new AppDatabase(path)
    const inspector = new DatabaseSync(path)
    inspector.prepare('INSERT INTO plant_vitality VALUES (1, 80, ?)').run(new Date().toISOString())
    assert.throws(() => db.readState(), /불완전한 설정 데이터/)
    inspector.close()
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('통계는 한국 날짜마다 마지막 목표와 취소·조정된 총량을 사용한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-stats-'))
  let now = new Date('2026-11-10T14:59:00Z')
  try {
    const db = new AppDatabase(join(dir, 'test.sqlite'), () => now)
    let state = db.completeSetup({ requestId: 'setup', goalCount: 2, cupMl: 100 })
    state = db.recordCup({
      requestId: 'before-midnight',
      expectedGoalId: state.goalId,
      day: state.day
    }).state
    state = db.recordDrinkAction({
      requestId: 'count-before',
      kind: 'add',
      expectedGoalId: state.goalId,
      day: state.day
    }).state
    now = new Date('2026-11-10T15:01:00Z')
    state = db.readState()
    assert.equal(state.day, '2026-11-11')
    state = db.recordCup({
      requestId: 'morning',
      expectedGoalId: state.goalId,
      day: state.day
    }).state
    state = db.recordDrinkAction({
      requestId: 'count-morning',
      kind: 'add',
      expectedGoalId: state.goalId,
      day: state.day
    }).state
    state = db.updateSettings({
      requestId: 'new-goal',
      kind: 'goal',
      expectedGoalId: state.goalId,
      expectedTodayMl: state.todayMl,
      day: state.day,
      goalCount: 2,
      todayMl: 120
    })
    state = db.recordCup({
      requestId: 'afternoon',
      expectedGoalId: state.goalId,
      day: state.day
    }).state
    state = db.recordDrinkAction({
      requestId: 'count-afternoon',
      kind: 'add',
      expectedGoalId: state.goalId,
      day: state.day
    }).state
    let stats = db.readStatistics()
    assert.deepEqual(stats.days.at(-2), {
      day: '2026-11-10',
      totalMl: 100,
      goalCount: 2,
      goalMl: null,
      drinkCount: 1,
      achieved: false
    })
    assert.deepEqual(stats.days.at(-1), {
      day: '2026-11-11',
      totalMl: 220,
      goalCount: 2,
      goalMl: null,
      drinkCount: 2,
      achieved: true
    })
    assert.equal(stats.averageCount, 1.5)
    assert.equal(stats.bestDay.day, '2026-11-11')
    assert.equal(stats.achievedDays, 1)
    assert.equal(stats.trackedDays, 2)
    assert.equal(stats.streak, 1)
    state = db.cancelWater({
      requestId: 'cancel',
      kind: 'latest',
      expectedGoalId: state.goalId,
      day: state.day,
      recordId: state.todayRecords[0].id
    }).state
    stats = db.readStatistics()
    assert.deepEqual(stats.days.at(-1), {
      day: '2026-11-11',
      totalMl: 120,
      goalCount: 2,
      goalMl: null,
      drinkCount: 2,
      achieved: true
    })
    assert.equal(stats.achievedDays, 1)
    assert.equal(stats.streak, 1)
    db.updateSettings({ requestId: 'stop', kind: 'stop', expectedGoalId: state.goalId })
    assert.equal(db.readStatistics().days.at(-1).goalCount, 2)
    now = new Date('2026-11-11T15:01:00Z')
    stats = db.readStatistics()
    assert.deepEqual(stats.days.at(-1), {
      day: '2026-11-12',
      totalMl: 0,
      goalCount: null,
      goalMl: null,
      drinkCount: 0,
      achieved: false
    })
    assert.equal(stats.trackedDays, 2)
    assert.equal(stats.averageCount, 1.5)
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('연속 달성은 7일을 넘어 이어지고 오늘 진행 중에는 어제까지 유지된다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-streak-'))
  let now = new Date('2026-11-01T03:00:00Z')
  try {
    const path = join(dir, 'test.sqlite')
    const db = new AppDatabase(path, () => now)
    let state = db.completeSetup({ requestId: 'setup', goalCount: 1, cupMl: 100 })
    for (let i = 0; i < 10; i++) {
      now = new Date(Date.UTC(2026, 10, 1 + i, 3))
      state = db.readState()
      state = db.recordCup({
        requestId: `cup-${i}`,
        expectedGoalId: state.goalId,
        day: state.day
      }).state
      state = db.recordDrinkAction({
        requestId: `drink-${i}`,
        kind: 'add',
        expectedGoalId: state.goalId,
        day: state.day
      }).state
    }
    now = new Date('2026-11-11T03:00:00Z')
    let stats = db.readStatistics()
    assert.equal(stats.streak, 10)
    assert.equal(stats.achievedDays, 6)
    assert.equal(stats.trackedDays, 7)
    assert.equal(stats.averageCount, 0.9)
    assert.equal(stats.bestDay.day, '2026-11-10')
    state = db.readState()
    state = db.recordCup({ requestId: 'today', expectedGoalId: state.goalId, day: state.day }).state
    state = db.recordDrinkAction({
      requestId: 'drink-today',
      kind: 'add',
      expectedGoalId: state.goalId,
      day: state.day
    }).state
    assert.equal(db.readStatistics().streak, 11)
    db.recordDrinkAction({
      requestId: 'cancel-today',
      kind: 'undo',
      expectedGoalId: state.goalId,
      day: state.day,
      recordId: state.latestDrinkId
    })
    assert.equal(db.readStatistics().streak, 10)
    const inspector = new DatabaseSync(path)
    inspector
      .prepare('UPDATE drink_actions SET cancelled_at = ? WHERE day = ?')
      .run(now.toISOString(), '2026-11-08')
    assert.equal(db.readStatistics().streak, 2)
    inspector.close()
    db.close()
    const reopened = new AppDatabase(path, () => now)
    assert.equal(reopened.readStatistics().streak, 2)
    reopened.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('목표 없는 날은 통계 분모에서 제외하고 지난 연속 달성을 끊는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-stats-no-goal-'))
  let now = new Date('2026-11-01T03:00:00Z')
  try {
    const db = new AppDatabase(join(dir, 'test.sqlite'), () => now)
    assert.throws(() => db.readStatistics(), StaleStateError)
    let state = db.completeSetup({ requestId: 'setup', goalCount: 1, cupMl: 100 })
    state = db.recordCup({ requestId: 'first', expectedGoalId: state.goalId, day: state.day }).state
    state = db.recordDrinkAction({
      requestId: 'first-count',
      kind: 'add',
      expectedGoalId: state.goalId,
      day: state.day
    }).state
    db.updateSettings({ requestId: 'stop', kind: 'stop', expectedGoalId: state.goalId })
    now = new Date('2026-11-03T03:00:00Z')
    state = db.readState()
    state = db.updateSettings({
      requestId: 'restart',
      kind: 'goal',
      expectedGoalId: null,
      expectedTodayMl: state.todayMl,
      day: state.day,
      goalCount: 1,
      todayMl: 0
    })
    let stats = db.readStatistics()
    assert.equal(stats.days.at(-2).goalCount, null)
    assert.equal(stats.trackedDays, 2)
    assert.equal(stats.averageCount, 0.5)
    assert.equal(stats.streak, 0)
    state = db.recordCup({ requestId: 'today', expectedGoalId: state.goalId, day: state.day }).state
    state = db.recordDrinkAction({
      requestId: 'today-count',
      kind: 'add',
      expectedGoalId: state.goalId,
      day: state.day
    }).state
    stats = db.readStatistics()
    assert.equal(stats.streak, 1)
    assert.equal(stats.achievedDays, 2)
    assert.equal(stats.bestDay.day, state.day)
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('정원 설정은 최초 설정 전부터 저장하고 재실행 후 복원한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-garden-settings-'))
  try {
    const path = join(dir, 'test.sqlite')
    let db = new AppDatabase(path)
    assert.deepEqual(db.readGardenSettings(), {
      placement: 'dock',
      alwaysOnTop: true,
      x: null,
      y: null
    })
    const expected = { placement: 'floor', alwaysOnTop: false, x: -1300, y: 456 }
    assert.deepEqual(db.saveGardenSettings(expected), expected)
    assert.deepEqual(db.readState(), { status: 'setup-required' })
    for (const value of [
      { ...expected, x: null },
      { ...expected, x: 0.5 },
      { ...expected, y: 10_000_001 },
      { ...expected, placement: 'side' },
      { ...expected, alwaysOnTop: 1 }
    ])
      assert.throws(() => db.saveGardenSettings(value), InvalidSetupError)
    const inspector = new DatabaseSync(path)
    inspector.exec(
      "CREATE TRIGGER fail_garden BEFORE UPDATE ON garden_settings BEGIN SELECT RAISE(ABORT, 'failure'); END"
    )
    assert.throws(() => db.saveGardenSettings({ ...expected, x: 30 }))
    assert.deepEqual(db.readGardenSettings(), expected)
    inspector.exec('DROP TRIGGER fail_garden')
    inspector.close()
    db.close()
    db = new AppDatabase(path)
    assert.deepEqual(db.readGardenSettings(), expected)
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('버전 5 데이터 이전 시 기존 기록을 유지하고 정원 설정 기본값을 만든다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-garden-v5-'))
  try {
    const path = join(dir, 'test.sqlite')
    let db = new AppDatabase(path)
    const state = db.completeSetup({ requestId: 'setup', goalCount: 1000, cupMl: 200 })
    const recorded = db.recordCup({
      requestId: 'water',
      expectedGoalId: state.goalId,
      day: state.day
    }).state
    db.close()
    const old = new DatabaseSync(path)
    old.exec(
      'DROP TABLE vitality_gains; DROP TABLE reminder_settings; DROP TABLE garden_settings; DROP TABLE drink_actions; DROP TABLE drink_action_receipts; ALTER TABLE goal_sessions DROP COLUMN target_count; PRAGMA user_version = 5'
    )
    old.close()
    db = new AppDatabase(path)
    assert.deepEqual(db.readState(), legacyState(recorded))
    assert.deepEqual(db.readGardenSettings(), {
      placement: 'dock',
      alwaysOnTop: true,
      x: null,
      y: null
    })
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('버전 6 정원 설정은 보존하면서 직접 이동한 위치를 저장할 수 있다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-garden-v6-'))
  try {
    const path = join(dir, 'test.sqlite')
    let db = new AppDatabase(path)
    const expected = { placement: 'floor', alwaysOnTop: false, x: -700, y: 600 }
    db.saveGardenSettings(expected)
    db.close()
    const old = new DatabaseSync(path)
    old.exec(`
      DROP TABLE reminder_settings;
      ALTER TABLE garden_settings RENAME TO tmp_settings;
      CREATE TABLE garden_settings (id INTEGER PRIMARY KEY CHECK(id = 1), placement TEXT NOT NULL CHECK(placement IN ('dock','floor')), always_on_top INTEGER NOT NULL CHECK(always_on_top IN (0,1)), x INTEGER, y INTEGER, CHECK((x IS NULL AND y IS NULL) OR (x IS NOT NULL AND y IS NOT NULL)));
      INSERT INTO garden_settings SELECT * FROM tmp_settings;
      DROP TABLE tmp_settings;
      DROP TABLE vitality_gains; DROP TABLE drink_actions; DROP TABLE drink_action_receipts; ALTER TABLE goal_sessions DROP COLUMN target_count; PRAGMA user_version = 6;
    `)
    old.close()
    db = new AppDatabase(path)
    assert.deepEqual(db.readGardenSettings(), expected)
    assert.deepEqual(db.saveGardenSettings({ ...expected, placement: 'custom' }), {
      ...expected,
      placement: 'custom'
    })
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('버전 7의 기록과 위치를 보존하며 알림 설정을 추가하고 재실행 후 복원한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-reminder-v7-'))
  try {
    const path = join(dir, 'test.sqlite')
    let now = new Date('2026-11-13T00:00:00.000Z')
    let db = new AppDatabase(path, () => now)
    let state = db.completeSetup({ requestId: 'setup', goalCount: 1500, cupMl: 250 })
    const position = { placement: 'custom', alwaysOnTop: true, x: 100, y: 200 }
    db.saveGardenSettings(position)
    now = new Date('2026-11-13T01:00:00.000Z')
    state = db.recordCup({ requestId: 'water', expectedGoalId: state.goalId, day: state.day }).state
    db.close()
    const old = new DatabaseSync(path)
    old.exec(
      'DROP TABLE vitality_gains; DROP TABLE reminder_settings; DROP TABLE drink_actions; DROP TABLE drink_action_receipts; ALTER TABLE goal_sessions DROP COLUMN target_count; PRAGMA user_version = 7'
    )
    old.close()
    db = new AppDatabase(path, () => now)
    const initial = { enabled: false, intervalMinutes: 120, startTime: '09:00', endTime: '21:00' }
    assert.deepEqual(db.readReminderSettings(), initial)
    assert.deepEqual(db.readGardenSettings(), position)
    assert.equal(db.readState().todayMl, 250)
    const saved = { enabled: true, intervalMinutes: 180, startTime: '22:00', endTime: '06:00' }
    assert.deepEqual(db.saveReminderSettings(saved), saved)
    assert.throws(
      () => db.saveReminderSettings({ ...saved, startTime: '06:00' }),
      InvalidSetupError
    )
    assert.throws(
      () => db.saveReminderSettings({ ...saved, intervalMinutes: 0 }),
      InvalidSetupError
    )
    assert.deepEqual(db.readReminderSettings(), saved)
    db.recordReminderShown(now)
    assert.equal(db.readReminderContext().latestRecordAt, null)
    assert.equal(db.readReminderContext().lastNotifiedAt, now.toISOString())
    state = startCountGoal(db, db.readState())
    state = db.recordDrinkAction({
      requestId: 'count',
      kind: 'add',
      expectedGoalId: state.goalId,
      day: state.day
    }).state
    assert.equal(db.readReminderContext().latestRecordAt, now.toISOString())
    state = db.recordDrinkAction({
      requestId: 'cancel-count',
      kind: 'undo',
      expectedGoalId: state.goalId,
      day: state.day,
      recordId: state.latestDrinkId
    }).state
    assert.equal(db.readReminderContext().latestRecordAt, null)
    assert.equal(state.todayMl, 250)
    db.close()
    db = new AppDatabase(path, () => now)
    assert.deepEqual(db.readReminderSettings(), saved)
    assert.equal(db.readReminderContext().lastNotifiedAt, now.toISOString())
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('알림 설정이나 전송 시각 저장이 실패하면 이전 값을 유지한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-reminder-fail-'))
  try {
    const path = join(dir, 'test.sqlite')
    const db = new AppDatabase(path)
    const before = db.readReminderSettings()
    const inspector = new DatabaseSync(path)
    inspector.exec(
      "CREATE TRIGGER fail_reminder BEFORE UPDATE ON reminder_settings BEGIN SELECT RAISE(ABORT, 'failure'); END;"
    )
    assert.throws(() => db.saveReminderSettings({ ...before, enabled: true }))
    assert.throws(() => db.recordReminderShown(new Date()))
    assert.deepEqual(db.readReminderSettings(), before)
    assert.equal(db.readReminderContext().lastNotifiedAt, null)
    inspector.close()
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('최초 설정부터 달성·취소·통계·알림 기준과 재실행 복원이 함께 일치한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-mvp-flow-'))
  const path = join(dir, 'test.sqlite')
  let now = new Date('2026-11-14T03:00:00.000Z')
  let db
  try {
    db = new AppDatabase(path, () => now)
    assert.equal(db.readState().status, 'setup-required')
    let state = db.completeSetup({ requestId: 'setup-flow', goalCount: 2, cupMl: 250 })
    const goalId = state.goalId
    const reminders = { enabled: true, intervalMinutes: 60, startTime: '09:00', endTime: '21:00' }
    db.saveReminderSettings(reminders)
    const firstTime = now.toISOString()
    state = db.recordCup({ requestId: 'flow-first', expectedGoalId: goalId, day: state.day }).state
    assert.equal(state.todayMl, 250)
    assert.equal(state.growthPoints, 250)
    state = db.recordDrinkAction({
      requestId: 'count-first',
      kind: 'add',
      expectedGoalId: goalId,
      day: state.day
    }).state
    assert.equal(db.readReminderContext().latestRecordAt, firstTime)

    now = new Date('2026-11-14T04:00:00.000Z')
    state = db.recordCup({ requestId: 'flow-second', expectedGoalId: goalId, day: state.day }).state
    assert.equal(state.todayMl, 500)
    assert.equal(state.growthPoints, 600)
    state = db.recordDrinkAction({
      requestId: 'count-second',
      kind: 'add',
      expectedGoalId: goalId,
      day: state.day
    }).state
    assert.equal(db.readStatistics().days.at(-1).achieved, true)
    assert.equal(db.readReminderContext().todayCount, 2)

    state = db.cancelWater({
      requestId: 'flow-undo',
      kind: 'latest',
      expectedGoalId: goalId,
      day: state.day,
      recordId: state.todayRecords[0].id
    }).state
    assert.equal(state.todayMl, 250)
    assert.equal(state.growthPoints, 450)
    assert.equal(db.readStatistics().days.at(-1).achieved, true)
    state = db.recordDrinkAction({
      requestId: 'count-undo',
      kind: 'undo',
      expectedGoalId: goalId,
      day: state.day,
      recordId: state.latestDrinkId
    }).state
    assert.equal(db.readStatistics().days.at(-1).achieved, false)
    assert.equal(db.readReminderContext().latestRecordAt, firstTime)

    now = new Date('2026-11-14T04:15:00.000Z')
    state = db.recordCup({ requestId: 'flow-again', expectedGoalId: goalId, day: state.day }).state
    assert.equal(state.growthPoints, 600)
    state = db.recordDrinkAction({
      requestId: 'count-again',
      kind: 'add',
      expectedGoalId: goalId,
      day: state.day
    }).state
    state = db.cancelWater({
      requestId: 'flow-undo-all',
      kind: 'today',
      expectedDrinkCount: state.todayCount,
      expectedLatestDrinkId: state.latestDrinkId,
      expectedGoalId: goalId,
      day: state.day,
      expectedRecordIds: state.todayRecords.map((record) => record.id)
    }).state
    // 전체 취소는 오늘 마신 횟수도 함께 취소한다.
    assert.equal(state.goalId, goalId)
    assert.equal(state.todayMl, 0)
    assert.equal(state.growthPoints, 0)
    assert.equal(state.todayCount, 0)
    assert.equal(db.readStatistics().days.at(-1).achieved, false)
    assert.equal(db.readReminderContext().latestRecordAt, null)
    db.close()

    db = new AppDatabase(path, () => now)
    assert.equal(db.readState().goalId, goalId)
    assert.equal(db.readState().todayMl, 0)
    assert.equal(db.readState().growthPoints, 0)
    assert.equal(db.readState().todayCount, 0)
    assert.deepEqual(db.readReminderSettings(), reminders)
    assert.equal(db.readStatistics().days.at(-1).achieved, false)
  } finally {
    db?.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('스키마 이전 전 사용자 기록을 복구 가능한 SQLite 백업으로 보관한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-update-backup-'))
  const path = join(dir, 'hanzanhae.sqlite')
  try {
    let db = new AppDatabase(path)
    const initial = db.completeSetup({ requestId: 'backup-setup', goalCount: 250, cupMl: 250 })
    const garden = { placement: 'custom', alwaysOnTop: false, x: 100, y: 200 }
    db.saveGardenSettings(garden)
    db.recordCup({ requestId: 'backup-water', expectedGoalId: initial.goalId, day: initial.day })
    db.close()
    const old = new DatabaseSync(path)
    // WAL에 아직 남아 있는 변경도 백업에 반영돼야 한다.
    old.exec(
      'PRAGMA journal_mode = WAL; DROP TABLE reminder_settings; DROP TABLE vitality_gains; DROP TABLE drink_actions; DROP TABLE drink_action_receipts; ALTER TABLE goal_sessions DROP COLUMN target_count; PRAGMA user_version = 7'
    )
    db = new AppDatabase(path)
    assert.equal(db.readState().todayMl, 250)
    assert.equal(db.readState().growthPoints, 250)
    assert.deepEqual(db.readGardenSettings(), garden)
    db.close()
    old.close()
    const backups = readdirSync(join(dir, 'backups'))
    assert.equal(backups.length, 1)
    const backup = new DatabaseSync(join(dir, 'backups', backups[0]), { readOnly: true })
    assert.equal(backup.prepare('PRAGMA user_version').get().user_version, 7)
    assert.equal(backup.prepare('SELECT COUNT(*) AS count FROM water_records').get().count, 1)
    assert.equal(backup.prepare('SELECT target_ml FROM goal_sessions').get().target_ml, 250)
    assert.equal(backup.prepare('SELECT points FROM growth_events').get().points, 250)
    assert.equal(backup.prepare('SELECT placement FROM garden_settings').get().placement, 'custom')
    backup.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('마이그레이션 전 백업을 만들 수 없다면 기존 데이터를 변경하지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-update-backup-error-'))
  const path = join(dir, 'hanzanhae.sqlite')
  try {
    const db = new AppDatabase(path)
    db.completeSetup({ requestId: 'backup-fail-setup', goalCount: 1000, cupMl: 250 })
    db.close()
    const old = new DatabaseSync(path)
    old.exec(
      'DROP TABLE vitality_gains; DROP TABLE reminder_settings; DROP TABLE drink_actions; DROP TABLE drink_action_receipts; ALTER TABLE goal_sessions DROP COLUMN target_count; PRAGMA user_version = 7'
    )
    old.close()
    writeFileSync(join(dir, 'backups'), '백업 폴더를 만들 수 없는 상황')
    assert.throws(() => new AppDatabase(path))
    const unchanged = new DatabaseSync(path, { readOnly: true })
    assert.equal(unchanged.prepare('PRAGMA user_version').get().user_version, 7)
    assert.equal(unchanged.prepare('SELECT target_ml FROM goal_sessions').get().target_ml, 250)
    unchanged.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('더 최신 앱의 데이터베이스는 이전 버전에서 변경하지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-update-newer-schema-'))
  const path = join(dir, 'hanzanhae.sqlite')
  try {
    const db = new AppDatabase(path)
    db.completeSetup({ requestId: 'future-setup', goalCount: 1000, cupMl: 250 })
    db.close()
    const future = new DatabaseSync(path)
    future.exec('PRAGMA user_version = 11')
    future.close()
    assert.throws(() => new AppDatabase(path), /지원하지 않는 데이터베이스 버전/)
    const unchanged = new DatabaseSync(path, { readOnly: true })
    assert.equal(unchanged.prepare('PRAGMA user_version').get().user_version, 11)
    assert.equal(unchanged.prepare('SELECT target_ml FROM goal_sessions').get().target_ml, 250)
    unchanged.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('기록 내보내기는 취소하지 않은 기록만 한국 시각으로 내고 사본은 같은 상태를 연다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-export-'))
  let now = new Date('2026-11-11T00:05:00Z')
  try {
    const db = new AppDatabase(join(dir, 'test.sqlite'), () => now)
    let state = db.completeSetup({ requestId: 'setup', goalCount: 4, cupMl: 500 })
    const base = { expectedGoalId: state.goalId, day: state.day }
    state = db.recordDrinkAction({ ...base, kind: 'add', requestId: 'button' }).state
    now = new Date('2026-11-11T00:10:00Z')
    state = db.recordDrinkAction({
      ...base,
      kind: 'add',
      requestId: 'camera',
      source: 'camera'
    }).state
    state = db.recordCup({ ...base, requestId: 'cup' }).state
    state = db.recordCup({ ...base, requestId: 'cancelled' }).state
    state = db.cancelWater({
      ...base,
      requestId: 'cancel',
      kind: 'latest',
      recordId: state.todayRecords[0].id
    }).state
    assert.equal(
      db.exportCsv(),
      '﻿날짜,시각,종류,양(ml),기록 방법\n' +
        '2026-11-11,09:05,마신 횟수,,버튼\n' +
        '2026-11-11,09:10,마신 횟수,,카메라\n' +
        '2026-11-11,09:10,텀블러 비움,500,\n'
    )
    const copy = join(dir, 'copy.sqlite')
    db.backupTo(copy)
    const restored = new AppDatabase(copy, () => now)
    assert.equal(restored.readState().todayCount, 2)
    assert.equal(restored.readState().todayMl, 500)
    restored.close()
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('모든 기록 지우기는 사본을 남기고, 새 DB를 못 열면 원래 기록으로 되돌린다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-reset-'))
  const path = join(dir, 'data.sqlite')
  try {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const seed = (name) => {
      const db = new AppDatabase(path)
      const state = db.completeSetup({ requestId: `setup-${name}`, goalCount: 8, cupMl: 500 })
      db.recordCup({ requestId: `cup-${name}`, expectedGoalId: state.goalId, day: state.day })
      return db
    }
    // 성공: 사본에는 예전 기록, 새 DB는 첫 설정 상태
    const backup = join(dir, 'backup-1.sqlite')
    const fresh = resetDatabaseFile(seed('a'), path, backup, (file) => new AppDatabase(file))
    assert.equal(fresh.readState().status, 'setup-required')
    fresh.close()
    const copy = new AppDatabase(backup)
    assert.equal(copy.readState().todayMl, 500)
    copy.close()
    // 실패: 새 DB를 못 열면 원래 기록이 그대로 남는다
    rmSync(path, { force: true })
    assert.throws(() =>
      resetDatabaseFile(seed('b'), path, join(dir, 'backup-2.sqlite'), () => {
        throw new Error('열기 실패')
      })
    )
    const restored = new AppDatabase(path)
    assert.equal(restored.readState().todayMl, 500)
    restored.close()
    // 사본을 못 만들면 아무것도 지우지 않는다
    const db = new AppDatabase(path)
    assert.throws(() =>
      resetDatabaseFile(db, path, join(dir, 'missing', 'backup.sqlite'), () => {
        throw new Error('열리면 안 됨')
      })
    )
    assert.equal(db.isOpen(), true)
    assert.equal(db.readState().todayMl, 500)
    db.close()
    assert.equal(
      readdirSync(dir).some((name) => name.endsWith('.resetting')),
      false
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('초기화 도중 종료하면 다음 실행에 이전 기록을 복구한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-reset-recovery-'))
  const path = join(dir, 'data.sqlite')
  try {
    const db = new AppDatabase(path)
    const state = db.completeSetup({ requestId: 'setup', goalCount: 8, cupMl: 500 })
    db.recordCup({ requestId: 'cup', expectedGoalId: state.goalId, day: state.day })
    db.close()
    renameSync(path, `${path}.resetting`)

    new AppDatabase(path).close()
    recoverInterruptedReset(path)
    recoverInterruptedReset(path)
    const recovered = new AppDatabase(path)
    try {
      assert.equal(recovered.readState().todayMl, 500)
      assert.equal(readdirSync(dir).includes('data.sqlite.resetting'), false)
    } finally {
      recovered.close()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
