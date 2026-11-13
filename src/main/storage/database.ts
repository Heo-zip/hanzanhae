import { DatabaseSync } from 'node:sqlite'
import type { AppState, SetupInput, SettingsInput } from '../../shared/appState'

export class AlreadyConfiguredError extends Error {}
export class InvalidSetupError extends Error {}
export class StaleStateError extends Error {}

function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}

export class AppDatabase {
  private readonly db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    try {
      this.db.exec('PRAGMA foreign_keys = ON')
      const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version)
      if (version > 2) throw new Error('지원하지 않는 데이터베이스 버전')
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
    } catch (error) {
      this.db.close()
      throw error
    }
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
      if (goalCount !== 0 || plant || receipts !== 0 || changes !== 0 || adjustments !== 0)
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
    const day = today()
    const todayMl = Number(
      this.db
        .prepare('SELECT COALESCE(SUM(amount_ml), 0) AS total FROM daily_adjustments WHERE day = ?')
        .get(day)?.total
    )
    if (!Number.isSafeInteger(todayMl) || todayMl < 0) throw new Error('유효하지 않은 오늘 총량')
    if (!goal) return { status: 'goal-stopped', cupMl, todayMl, day }
    const goalMl = Number(goal.target_ml)
    if (!Number.isSafeInteger(goalMl) || goalMl <= 0) throw new Error('유효하지 않은 목표')
    return {
      status: 'ready',
      goalId: Number(goal.id),
      goalMl,
      cupMl,
      todayMl,
      day,
      plantStage: 'seedling'
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
          .run(goalMl, new Date().toISOString())
        this.db.prepare("INSERT INTO plant_state VALUES (1, 'seedling')").run()
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
            day: today(),
            plantStage: 'seedling'
          }
        : currentState
      this.db.exec('COMMIT')
      return state
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
            .run(new Date().toISOString(), state.goalId)
        } else {
          if (
            state.day !== input.day ||
            state.todayMl !== input.expectedTodayMl ||
            (state.status === 'ready' ? state.goalId : null) !== input.expectedGoalId
          )
            throw new StaleStateError()
          const now = new Date().toISOString()
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
    this.db.close()
  }
}
