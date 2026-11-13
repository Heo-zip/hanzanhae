import { DatabaseSync } from 'node:sqlite'
import type {
  AppState,
  SetupInput,
  SettingsInput,
  RecordCupInput,
  WaterRecord,
  CancelWaterInput,
  PlantStatus
} from '../../shared/appState'

export class AlreadyConfiguredError extends Error {}
export class InvalidSetupError extends Error {}
export class StaleStateError extends Error {}
export class NoRecordsError extends Error {}
export class TotalBelowZeroError extends Error {}

function today(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

export class AppDatabase {
  private readonly db: DatabaseSync

  constructor(
    path: string,
    private readonly now: () => Date = () => new Date()
  ) {
    this.db = new DatabaseSync(path)
    try {
      this.db.exec('PRAGMA foreign_keys = ON')
      const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version)
      if (version > 5) throw new Error('지원하지 않는 데이터베이스 버전')
      if (version === 0) {
        this.db.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE app_settings (id INTEGER PRIMARY KEY CHECK(id = 1), cup_ml INTEGER NOT NULL CHECK(cup_ml > 0), onboarding_complete INTEGER NOT NULL CHECK(onboarding_complete = 1));
          CREATE TABLE goal_sessions (id INTEGER PRIMARY KEY, target_ml INTEGER NOT NULL CHECK(target_ml > 0), started_at TEXT NOT NULL, stopped_at TEXT);
          CREATE UNIQUE INDEX one_active_goal ON goal_sessions ((1)) WHERE stopped_at IS NULL;
          CREATE TABLE plant_state (id INTEGER PRIMARY KEY CHECK(id = 1), stage TEXT NOT NULL CHECK(stage = 'seedling'));
          CREATE TABLE mutation_receipts (request_id TEXT PRIMARY KEY, goal_ml INTEGER NOT NULL, cup_ml INTEGER NOT NULL);
          PRAGMA user_version = 1;
          COMMIT;
        `)
      }
      if (version < 2) {
        this.db.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE daily_adjustments (id INTEGER PRIMARY KEY, goal_id INTEGER NOT NULL REFERENCES goal_sessions(id), day TEXT NOT NULL, amount_ml INTEGER NOT NULL, created_at TEXT NOT NULL);
          CREATE TABLE settings_receipts (request_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
          PRAGMA user_version = 2;
          COMMIT;
        `)
      }
      if (version < 3) {
        this.db.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE water_records (id INTEGER PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, goal_id INTEGER NOT NULL REFERENCES goal_sessions(id), amount_ml INTEGER NOT NULL CHECK(amount_ml > 0), recorded_at TEXT NOT NULL, day TEXT NOT NULL, cancelled_at TEXT);
          CREATE INDEX water_records_by_day ON water_records(day, cancelled_at);
          PRAGMA user_version = 3;
          COMMIT;
        `)
      }
      if (version < 4) {
        this.db.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE cancel_receipts (request_id TEXT PRIMARY KEY, payload TEXT NOT NULL, cancelled_count INTEGER NOT NULL CHECK(cancelled_count > 0));
          PRAGMA user_version = 4;
          COMMIT;
        `)
      }
      if (version < 5) {
        this.db.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE growth_events (water_record_id INTEGER PRIMARY KEY REFERENCES water_records(id), points INTEGER NOT NULL CHECK(points > 0));
          CREATE TABLE plant_vitality (id INTEGER PRIMARY KEY CHECK(id = 1), value REAL NOT NULL CHECK(value >= 20 AND value <= 100), updated_at TEXT NOT NULL);
        `)
        this.db
          .prepare('INSERT INTO plant_vitality SELECT id, 80, ? FROM plant_state')
          .run(this.now().toISOString())
        this.db.exec('PRAGMA user_version = 5; COMMIT;')
      }
      // 마지막 저장 이후는 앱이 꺼져 있던 시간으로 보수적으로 계산한다.
      this.settleVitality('offline')
    } catch (error) {
      this.db.close()
      throw error
    }
  }

  private vitalityAt(value: number, updatedAt: string, mode: 'online' | 'offline'): number {
    const elapsed = Math.max(0, this.now().getTime() - Date.parse(updatedAt))
    if (!Number.isFinite(elapsed) || !Number.isFinite(value)) throw new Error('유효하지 않은 생기')
    const hourly = mode === 'online' ? 2 : 0.25
    return Math.max(20, Math.min(100, value - (elapsed / 3_600_000) * hourly))
  }

  private settleVitality(mode: 'online' | 'offline'): void {
    const row = this.db.prepare('SELECT value, updated_at FROM plant_vitality WHERE id = 1').get()
    if (!row) return
    const value = this.vitalityAt(Number(row.value), String(row.updated_at), mode)
    // 시계가 뒤로 움직여도 이전 시각을 보존해 같은 시간을 중복 계산하지 않는다.
    const timestamp = new Date(Math.max(this.now().getTime(), Date.parse(String(row.updated_at))))
    this.db
      .prepare('UPDATE plant_vitality SET value = ?, updated_at = ? WHERE id = 1')
      .run(value, timestamp.toISOString())
  }

  checkpointPlant(): void {
    this.settleVitality('online')
  }

  private readPlant(): PlantStatus {
    const row = this.db.prepare('SELECT value, updated_at FROM plant_vitality WHERE id = 1').get()
    if (!row) throw new Error('식물 생기 데이터가 없어요')
    const vitality = this.vitalityAt(Number(row.value), String(row.updated_at), 'online')
    const growthPoints = Number(
      this.db
        .prepare(
          `
      SELECT COALESCE(SUM(g.points), 0) AS total
      FROM growth_events g JOIN water_records w ON w.id = g.water_record_id
      WHERE w.cancelled_at IS NULL
    `
        )
        .get()?.total
    )
    if (!Number.isSafeInteger(growthPoints) || growthPoints < 0)
      throw new Error('유효하지 않은 성장량')
    const plantStage =
      growthPoints >= 14000
        ? 'flower'
        : growthPoints >= 7000
          ? 'leafy'
          : growthPoints >= 3000
            ? 'young'
            : 'seedling'
    return { plantStage, plantVitality: Math.round(vitality), growthPoints }
  }

  readState(): AppState {
    const settings = this.db.prepare('SELECT cup_ml FROM app_settings WHERE id = 1').get()
    const goal = this.db
      .prepare('SELECT id, target_ml FROM goal_sessions WHERE stopped_at IS NULL')
      .get()
    const plant = this.db.prepare('SELECT stage FROM plant_state WHERE id = 1').get()
    const goalCount = Number(this.db.prepare('SELECT COUNT(*) AS n FROM goal_sessions').get()?.n)
    if (!settings) {
      const receipts = Number(
        this.db.prepare('SELECT COUNT(*) AS n FROM mutation_receipts').get()?.n
      )
      const changes = Number(
        this.db.prepare('SELECT COUNT(*) AS n FROM settings_receipts').get()?.n
      )
      const adjustments = Number(
        this.db.prepare('SELECT COUNT(*) AS n FROM daily_adjustments').get()?.n
      )
      const records = Number(this.db.prepare('SELECT COUNT(*) AS n FROM water_records').get()?.n)
      const cancellations = Number(
        this.db.prepare('SELECT COUNT(*) AS n FROM cancel_receipts').get()?.n
      )
      const growth = Number(this.db.prepare('SELECT COUNT(*) AS n FROM growth_events').get()?.n)
      const vitality = Number(this.db.prepare('SELECT COUNT(*) AS n FROM plant_vitality').get()?.n)
      if (
        goalCount !== 0 ||
        plant ||
        receipts !== 0 ||
        changes !== 0 ||
        adjustments !== 0 ||
        records !== 0 ||
        cancellations !== 0 ||
        growth !== 0 ||
        vitality !== 0
      )
        throw new Error('불완전한 설정 데이터')
      return { status: 'setup-required' }
    }
    const cupMl = Number(settings.cup_ml)
    if (
      !Number.isSafeInteger(cupMl) ||
      cupMl <= 0 ||
      !plant ||
      plant.stage !== 'seedling' ||
      goalCount < 1
    ) {
      throw new Error('유효하지 않은 설정 데이터')
    }
    const day = today(this.now())
    const adjustment = Number(
      this.db
        .prepare('SELECT COALESCE(SUM(amount_ml), 0) AS total FROM daily_adjustments WHERE day = ?')
        .get(day)?.total
    )
    const todayRecords: WaterRecord[] = this.db
      .prepare(
        'SELECT id, goal_id, amount_ml, recorded_at FROM water_records WHERE day = ? AND cancelled_at IS NULL ORDER BY recorded_at DESC, id DESC'
      )
      .all(day)
      .map((record) => ({
        id: Number(record.id),
        goalId: Number(record.goal_id),
        amountMl: Number(record.amount_ml),
        recordedAt: String(record.recorded_at)
      }))
    const todayMl = adjustment + todayRecords.reduce((total, record) => total + record.amountMl, 0)
    if (!Number.isSafeInteger(todayMl) || todayMl < 0) throw new Error('유효하지 않은 오늘 총량')
    const plantStatus = this.readPlant()
    if (!goal) return { status: 'goal-stopped', cupMl, todayMl, todayRecords, day, ...plantStatus }
    const goalMl = Number(goal.target_ml)
    if (!Number.isSafeInteger(goalMl) || goalMl <= 0) throw new Error('유효하지 않은 목표')
    return {
      status: 'ready',
      goalId: Number(goal.id),
      goalMl,
      cupMl,
      todayMl,
      todayRecords,
      day,
      ...plantStatus
    }
  }

  completeSetup(input: SetupInput): AppState {
    const { requestId, goalMl, cupMl } = input
    if (
      typeof requestId !== 'string' ||
      requestId.length < 1 ||
      requestId.length > 128 ||
      !Number.isSafeInteger(goalMl) ||
      goalMl <= 0 ||
      !Number.isSafeInteger(cupMl) ||
      cupMl <= 0
    )
      throw new InvalidSetupError()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.db
        .prepare('SELECT goal_ml, cup_ml FROM mutation_receipts WHERE request_id = ?')
        .get(requestId)
      if (previous) {
        if (Number(previous.goal_ml) !== goalMl || Number(previous.cup_ml) !== cupMl)
          throw new InvalidSetupError()
      } else {
        if (this.readState().status !== 'setup-required') throw new AlreadyConfiguredError()
        this.db.prepare('INSERT INTO app_settings VALUES (1, ?, 1)').run(cupMl)
        this.db
          .prepare('INSERT INTO goal_sessions (target_ml, started_at) VALUES (?, ?)')
          .run(goalMl, this.now().toISOString())
        this.db.prepare("INSERT INTO plant_state VALUES (1, 'seedling')").run()
        this.db
          .prepare('INSERT INTO plant_vitality VALUES (1, 80, ?)')
          .run(this.now().toISOString())
        this.db
          .prepare('INSERT INTO mutation_receipts VALUES (?, ?, ?)')
          .run(requestId, goalMl, cupMl)
      }
      const currentState = this.readState()
      // 같은 요청의 재전송은 최초 성공 결과를 돌려주며 현재 상태를 덮어쓰지 않는다.
      const state: AppState = previous
        ? {
            status: 'ready',
            goalId: Number(
              this.db.prepare('SELECT id FROM goal_sessions ORDER BY id LIMIT 1').get()?.id
            ),
            goalMl,
            cupMl,
            todayMl: 0,
            todayRecords: [],
            day: today(this.now()),
            plantStage: 'seedling',
            plantVitality: 80,
            growthPoints: 0
          }
        : currentState
      this.db.exec('COMMIT')
      return state
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  recordCup(input: RecordCupInput): { state: AppState; created: boolean } {
    if (
      !input ||
      typeof input.requestId !== 'string' ||
      input.requestId.length < 1 ||
      input.requestId.length > 128 ||
      !Number.isSafeInteger(input.expectedGoalId) ||
      input.expectedGoalId <= 0 ||
      typeof input.day !== 'string'
    )
      throw new InvalidSetupError()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.db
        .prepare('SELECT goal_id, day FROM water_records WHERE request_id = ?')
        .get(input.requestId)
      let created = false
      if (previous) {
        if (Number(previous.goal_id) !== input.expectedGoalId || previous.day !== input.day)
          throw new InvalidSetupError()
      } else {
        const state = this.readState()
        const now = this.now()
        const actualDay = today(now)
        if (
          state.status !== 'ready' ||
          state.goalId !== input.expectedGoalId ||
          state.day !== input.day ||
          actualDay !== input.day
        )
          throw new StaleStateError()
        if (!Number.isSafeInteger(state.todayMl + state.cupMl)) throw new InvalidSetupError()
        const inserted = this.db
          .prepare(
            'INSERT INTO water_records (request_id, goal_id, amount_ml, recorded_at, day) VALUES (?, ?, ?, ?, ?)'
          )
          .run(input.requestId, state.goalId, state.cupMl, now.toISOString(), actualDay)
        const after = state.todayMl + state.cupMl
        const reached = state.todayMl < state.goalMl && after >= state.goalMl
        const extraMl = Math.max(0, after - Math.max(state.todayMl, state.goalMl))
        const extraPoints = Math.min(1_000_000, Math.round((extraMl / state.goalMl) * 1000))
        const points = (reached ? 1000 : 0) + extraPoints
        if (points > 0)
          this.db
            .prepare('INSERT INTO growth_events VALUES (?, ?)')
            .run(inserted.lastInsertRowid, points)
        this.settleVitality('online')
        this.db.prepare('UPDATE plant_vitality SET value = MIN(100, value + 15) WHERE id = 1').run()
        created = true
      }
      const state = this.readState()
      this.db.exec('COMMIT')
      return { state, created }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  cancelWater(input: CancelWaterInput): {
    state: AppState
    cancelledCount: number
    created: boolean
  } {
    const positive = (value: number): boolean => Number.isSafeInteger(value) && value > 0
    if (
      !input ||
      typeof input.requestId !== 'string' ||
      input.requestId.length < 1 ||
      input.requestId.length > 128 ||
      !positive(input.expectedGoalId) ||
      typeof input.day !== 'string' ||
      (input.kind === 'latest'
        ? !positive(input.recordId)
        : input.kind === 'today'
          ? !Array.isArray(input.expectedRecordIds) ||
            !input.expectedRecordIds.every(positive) ||
            new Set(input.expectedRecordIds).size !== input.expectedRecordIds.length
          : true)
    )
      throw new InvalidSetupError()
    const payload = JSON.stringify([
      input.kind,
      input.expectedGoalId,
      input.day,
      input.kind === 'latest' ? input.recordId : input.expectedRecordIds
    ])
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.db
        .prepare('SELECT payload, cancelled_count FROM cancel_receipts WHERE request_id = ?')
        .get(input.requestId)
      let cancelledCount: number
      let created = false
      if (previous) {
        if (previous.payload !== payload) throw new InvalidSetupError()
        cancelledCount = Number(previous.cancelled_count)
      } else {
        const state = this.readState()
        const now = this.now()
        if (
          state.status !== 'ready' ||
          state.goalId !== input.expectedGoalId ||
          state.day !== input.day ||
          today(now) !== input.day
        )
          throw new StaleStateError()
        const current = state.todayRecords.filter((record) => record.goalId === state.goalId)
        if (current.length === 0) {
          if (input.kind === 'today' && input.expectedRecordIds.length === 0)
            throw new NoRecordsError()
          throw new StaleStateError()
        }
        let selected: WaterRecord[]
        if (input.kind === 'latest') {
          if (current[0].id !== input.recordId) throw new StaleStateError()
          selected = [current[0]]
        } else {
          if (
            input.expectedRecordIds.length !== current.length ||
            current.some((record, index) => record.id !== input.expectedRecordIds[index])
          )
            throw new StaleStateError()
          selected = current
        }
        const amount = selected.reduce((sum, record) => sum + record.amountMl, 0)
        if (state.todayMl - amount < 0) throw new TotalBelowZeroError()
        const update = this.db.prepare(
          'UPDATE water_records SET cancelled_at = ? WHERE id = ? AND cancelled_at IS NULL'
        )
        for (const record of selected) update.run(now.toISOString(), record.id)
        cancelledCount = selected.length
        this.db
          .prepare('INSERT INTO cancel_receipts VALUES (?, ?, ?)')
          .run(input.requestId, payload, cancelledCount)
        created = true
      }
      const state = this.readState()
      this.db.exec('COMMIT')
      return { state, cancelledCount, created }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  updateSettings(input: SettingsInput): AppState {
    if (
      !input ||
      typeof input.requestId !== 'string' ||
      input.requestId.length < 1 ||
      input.requestId.length > 128
    )
      throw new InvalidSetupError()
    const positive = (n: number): boolean => Number.isSafeInteger(n) && n > 0
    const nonnegative = (n: number): boolean => Number.isSafeInteger(n) && n >= 0
    if (
      input.kind === 'cup'
        ? !positive(input.cupMl)
        : input.kind === 'stop'
          ? !positive(input.expectedGoalId)
          : input.kind === 'goal'
            ? !(
                positive(input.goalMl) &&
                nonnegative(input.todayMl) &&
                nonnegative(input.expectedTodayMl) &&
                (input.expectedGoalId === null || positive(input.expectedGoalId)) &&
                typeof input.day === 'string'
              )
            : true
    )
      throw new InvalidSetupError()
    const payload = JSON.stringify(input)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const receipt = this.db
        .prepare('SELECT payload FROM settings_receipts WHERE request_id = ?')
        .get(input.requestId)
      if (receipt) {
        if (receipt.payload !== payload) throw new InvalidSetupError()
      } else {
        const state = this.readState()
        if (state.status === 'setup-required') throw new StaleStateError()
        if (input.kind === 'cup') {
          this.db.prepare('UPDATE app_settings SET cup_ml = ? WHERE id = 1').run(input.cupMl)
        } else if (input.kind === 'stop') {
          if (state.status !== 'ready' || state.goalId !== input.expectedGoalId)
            throw new StaleStateError()
          this.db
            .prepare('UPDATE goal_sessions SET stopped_at = ? WHERE id = ?')
            .run(this.now().toISOString(), state.goalId)
        } else {
          if (
            state.day !== input.day ||
            state.todayMl !== input.expectedTodayMl ||
            (state.status === 'ready' ? state.goalId : null) !== input.expectedGoalId
          )
            throw new StaleStateError()
          const now = this.now().toISOString()
          if (state.status === 'ready')
            this.db
              .prepare('UPDATE goal_sessions SET stopped_at = ? WHERE id = ?')
              .run(now, state.goalId)
          const result = this.db
            .prepare('INSERT INTO goal_sessions (target_ml, started_at) VALUES (?, ?)')
            .run(input.goalMl, now)
          this.db
            .prepare(
              'INSERT INTO daily_adjustments (goal_id, day, amount_ml, created_at) VALUES (?, ?, ?, ?)'
            )
            .run(result.lastInsertRowid, input.day, input.todayMl - state.todayMl, now)
        }
        this.db.prepare('INSERT INTO settings_receipts VALUES (?, ?)').run(input.requestId, payload)
      }
      const state = this.readState()
      this.db.exec('COMMIT')
      return state
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  close(): void {
    try {
      this.checkpointPlant()
    } finally {
      this.db.close()
    }
  }
}
