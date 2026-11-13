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
const { AppDatabase, AlreadyConfiguredError, InvalidSetupError, StaleStateError } =
  moduleUnderTest.exports
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
    assert.deepEqual(db.readState(), { status: 'goal-stopped', cupMl: 200, todayMl: 0, day })
    assert.deepEqual(db.completeSetup(input), {
      status: 'ready',
      goalId: 1,
      goalMl: 1200,
      cupMl: 200,
      todayMl: 0,
      day,
      plantStage: 'seedling'
    })
    assert.deepEqual(db.readState(), { status: 'goal-stopped', cupMl: 200, todayMl: 0, day })
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

test('버전 1 데이터는 설정을 유지하며 버전 2로 이전한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hanzanhae-migrate-'))
  const path = join(dir, 'test.sqlite')
  try {
    const db = new AppDatabase(path)
    const expected = db.completeSetup({ requestId: 'setup', goalMl: 1700, cupMl: 250 })
    db.close()
    const old = new DatabaseSync(path)
    old.exec('DROP TABLE daily_adjustments; DROP TABLE settings_receipts; PRAGMA user_version = 1')
    old.close()
    const migrated = new AppDatabase(path)
    assert.deepEqual(migrated.readState(), expected)
    assert.equal(migrated.updateSettings({ requestId: 'cup', kind: 'cup', cupMl: 300 }).cupMl, 300)
    migrated.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
