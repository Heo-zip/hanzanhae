import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  AppState,
  SetupInput,
  SettingsInput,
  RecordCupInput,
  WaterRecord,
  CancelWaterInput,
  PlantStatus,
  WaterStatistics,
  DailyStatistics,
  GardenSettings,
  ReminderSettings,
  DrinkActionInput
} from '../../shared/appState'
import { validReminderSettings } from '../reminders/policy'

export class AlreadyConfiguredError extends Error {}
export class InvalidSetupError extends Error {}
export class StaleStateError extends Error {}
export class NoRecordsError extends Error {}
export class TotalBelowZeroError extends Error {}

const SCHEMA_VERSION = 9

// 앱의 하루 기준인 한국 날짜를 YYYY-MM-DD로 만든다.
const seoulDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})
const today = (date: Date): string => seoulDay.format(date)
const positive = (value: number): boolean => Number.isSafeInteger(value) && value > 0
const nonnegative = (value: number): boolean => Number.isSafeInteger(value) && value >= 0

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
      if (version > SCHEMA_VERSION) throw new Error('지원하지 않는 데이터베이스 버전')
      const existingTables = Number(
        this.db
          .prepare(
            "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
          )
          .get()?.count
      )
      if (version < SCHEMA_VERSION && existingTables > 0 && path !== ':memory:') {
        // 마이그레이션에 실패하거나 앱을 되돌릴 때 이전 데이터를 복구할 수 있게 원본을 보관한다.
        const backupDirectory = join(dirname(path), 'backups')
        mkdirSync(backupDirectory, { recursive: true, mode: 0o700 })
        const backupPath = join(
          backupDirectory,
          `hanzanhae-before-v${version}-${randomUUID()}.sqlite`
        )
        this.db.prepare('VACUUM INTO ?').run(backupPath)
      }
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
      if (version < 6) {
        this.db.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE garden_settings (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            placement TEXT NOT NULL CHECK(placement IN ('dock', 'floor')),
            always_on_top INTEGER NOT NULL CHECK(always_on_top IN (0, 1)),
            x INTEGER, y INTEGER,
            CHECK((x IS NULL AND y IS NULL) OR (x IS NOT NULL AND y IS NOT NULL))
          );
          INSERT INTO garden_settings VALUES (1, 'dock', 1, NULL, NULL);
          PRAGMA user_version = 6;
          COMMIT;
        `)
      }
      if (version < 7) {
        this.db.exec(`
          BEGIN IMMEDIATE;
          ALTER TABLE garden_settings RENAME TO previous_garden_settings;
          CREATE TABLE garden_settings (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            placement TEXT NOT NULL CHECK(placement IN ('dock', 'floor', 'custom')),
            always_on_top INTEGER NOT NULL CHECK(always_on_top IN (0, 1)),
            x INTEGER, y INTEGER,
            CHECK((x IS NULL AND y IS NULL) OR (x IS NOT NULL AND y IS NOT NULL))
          );
          INSERT INTO garden_settings SELECT * FROM previous_garden_settings;
          DROP TABLE previous_garden_settings;
          PRAGMA user_version = 7;
          COMMIT;
        `)
      }
      if (version < 8) {
        this.db.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE reminder_settings (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
            interval_minutes INTEGER NOT NULL CHECK(interval_minutes BETWEEN 60 AND 480 AND interval_minutes % 60 = 0),
            start_time TEXT NOT NULL, end_time TEXT NOT NULL,
            last_notified_at TEXT
          );
          INSERT INTO reminder_settings VALUES (1, 0, 120, '09:00', '21:00', NULL);
          PRAGMA user_version = 8;
          COMMIT;
        `)
      }
      if (version < 9) {
        this.db.exec(`
          BEGIN IMMEDIATE;
          ALTER TABLE goal_sessions ADD COLUMN target_count INTEGER CHECK(target_count IS NULL OR target_count > 0);
          CREATE TABLE drink_actions (
            id INTEGER PRIMARY KEY,
            request_id TEXT NOT NULL UNIQUE,
            goal_id INTEGER NOT NULL REFERENCES goal_sessions(id),
            day TEXT NOT NULL,
            recorded_at TEXT NOT NULL,
            cancelled_at TEXT
          );
          CREATE INDEX drink_actions_by_day ON drink_actions(day, cancelled_at);
          CREATE TABLE drink_action_receipts (request_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
          PRAGMA user_version = 9;
          COMMIT;
        `)
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
      .prepare('SELECT id, target_ml, target_count FROM goal_sessions WHERE stopped_at IS NULL')
      .get()
    const plant = this.db.prepare('SELECT stage FROM plant_state WHERE id = 1').get()
    const goalSessionCount = Number(
      this.db.prepare('SELECT COUNT(*) AS n FROM goal_sessions').get()?.n
    )
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
        goalSessionCount !== 0 ||
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
      goalSessionCount < 1
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
    const actions = this.db
      .prepare(
        'SELECT id FROM drink_actions WHERE day = ? AND cancelled_at IS NULL ORDER BY recorded_at DESC, id DESC'
      )
      .all(day)
    const todayCount = actions.length
    const latestDrinkId = actions.length ? Number(actions[0].id) : null
    if (!goal || goal.target_count === null)
      return {
        status: 'goal-stopped',
        cupMl,
        todayMl,
        todayRecords,
        day,
        todayCount,
        latestDrinkId,
        ...plantStatus
      }
    const goalMl = Number(goal.target_ml)
    const goalCount = Number(goal.target_count)
    if (!Number.isSafeInteger(goalMl) || goalMl <= 0 || !positive(goalCount))
      throw new Error('유효하지 않은 목표')
    return {
      status: 'ready',
      goalId: Number(goal.id),
      goalCount,
      todayCount,
      latestDrinkId,
      cupMl,
      todayMl,
      todayRecords,
      day,
      ...plantStatus
    }
  }

  readGardenSettings(): GardenSettings {
    const row = this.db
      .prepare('SELECT placement, always_on_top, x, y FROM garden_settings WHERE id = 1')
      .get()
    if (
      !row ||
      (row.placement !== 'dock' && row.placement !== 'floor' && row.placement !== 'custom') ||
      (row.always_on_top !== 0 && row.always_on_top !== 1)
    )
      throw new Error('유효하지 않은 정원 설정')
    const x = row.x === null ? null : Number(row.x)
    const y = row.y === null ? null : Number(row.y)
    if (
      (x === null) !== (y === null) ||
      (x !== null && (!Number.isSafeInteger(x) || Math.abs(x) > 10_000_000)) ||
      (y !== null && (!Number.isSafeInteger(y) || Math.abs(y) > 10_000_000))
    )
      throw new Error('유효하지 않은 정원 위치')
    return { placement: row.placement, alwaysOnTop: row.always_on_top === 1, x, y }
  }

  readReminderSettings(): ReminderSettings {
    const row = this.db
      .prepare(
        'SELECT enabled, interval_minutes, start_time, end_time FROM reminder_settings WHERE id = 1'
      )
      .get()
    if (!row || (row.enabled !== 0 && row.enabled !== 1)) throw new Error('유효하지 않은 알림 설정')
    const settings = {
      enabled: row.enabled === 1,
      intervalMinutes: Number(row.interval_minutes),
      startTime: String(row.start_time),
      endTime: String(row.end_time)
    }
    if (!validReminderSettings(settings)) throw new Error('유효하지 않은 알림 설정')
    return settings
  }

  saveReminderSettings(settings: ReminderSettings): ReminderSettings {
    if (!validReminderSettings(settings)) throw new InvalidSetupError()
    const result = this.db
      .prepare(
        'UPDATE reminder_settings SET enabled = ?, interval_minutes = ?, start_time = ?, end_time = ? WHERE id = 1'
      )
      .run(settings.enabled ? 1 : 0, settings.intervalMinutes, settings.startTime, settings.endTime)
    if (result.changes !== 1) throw new Error('알림 설정이 없어요')
    return this.readReminderSettings()
  }

  readReminderContext(): {
    settings: ReminderSettings
    goalStartedAt: string | null
    latestRecordAt: string | null
    lastNotifiedAt: string | null
    todayCount: number
    goalCount: number | null
    vitality: number
  } {
    const settings = this.readReminderSettings()
    const state = this.readState()
    const notification = this.db
      .prepare('SELECT last_notified_at FROM reminder_settings WHERE id = 1')
      .get()
    const lastNotifiedAt =
      notification?.last_notified_at == null ? null : String(notification.last_notified_at)
    if (state.status !== 'ready')
      return {
        settings,
        goalStartedAt: null,
        latestRecordAt: null,
        lastNotifiedAt,
        todayCount: 0,
        goalCount: null,
        vitality: 100
      }
    const goal = this.db
      .prepare('SELECT started_at FROM goal_sessions WHERE id = ?')
      .get(state.goalId)
    if (!goal || typeof goal.started_at !== 'string') throw new Error('활성 목표가 없어요')
    const latest = this.db
      .prepare('SELECT MAX(recorded_at) AS latest FROM drink_actions WHERE cancelled_at IS NULL')
      .get()
    return {
      settings,
      goalStartedAt: goal.started_at,
      latestRecordAt: latest?.latest == null ? null : String(latest.latest),
      lastNotifiedAt,
      todayCount: state.todayCount,
      goalCount: state.goalCount,
      vitality: state.plantVitality
    }
  }

  recordReminderShown(at: Date): void {
    if (!Number.isFinite(at.getTime())) throw new InvalidSetupError()
    const result = this.db
      .prepare('UPDATE reminder_settings SET last_notified_at = ? WHERE id = 1')
      .run(at.toISOString())
    if (result.changes !== 1) throw new Error('알림 설정이 없어요')
  }

  saveGardenSettings(settings: GardenSettings): GardenSettings {
    const validCoordinate = (n: number | null): boolean =>
      n === null || (Number.isSafeInteger(n) && Math.abs(n) <= 10_000_000)
    if (
      !settings ||
      (settings.placement !== 'dock' &&
        settings.placement !== 'floor' &&
        settings.placement !== 'custom') ||
      typeof settings.alwaysOnTop !== 'boolean' ||
      !validCoordinate(settings.x) ||
      !validCoordinate(settings.y) ||
      (settings.x === null) !== (settings.y === null)
    )
      throw new InvalidSetupError()
    const result = this.db
      .prepare(
        'UPDATE garden_settings SET placement = ?, always_on_top = ?, x = ?, y = ? WHERE id = 1'
      )
      .run(settings.placement, settings.alwaysOnTop ? 1 : 0, settings.x, settings.y)
    if (result.changes !== 1) throw new Error('정원 설정이 없어요')
    return this.readGardenSettings()
  }

  readStatistics(): WaterStatistics {
    this.db.exec('BEGIN')
    try {
      const statistics = this.calculateStatistics()
      this.db.exec('COMMIT')
      return statistics
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private calculateStatistics(): WaterStatistics {
    if (this.readState().status === 'setup-required') throw new StaleStateError()
    const currentDay = today(this.now())
    const goals = this.db
      .prepare(
        'SELECT id, target_ml, target_count, started_at, stopped_at FROM goal_sessions ORDER BY started_at DESC, id DESC'
      )
      .all()
      .map((row) => {
        const target = Number(row.target_ml)
        const start = new Date(String(row.started_at))
        const end = row.stopped_at === null ? null : new Date(String(row.stopped_at))
        if (
          !Number.isSafeInteger(target) ||
          target <= 0 ||
          !Number.isFinite(start.getTime()) ||
          (end && !Number.isFinite(end.getTime()))
        )
          throw new Error('유효하지 않은 목표 이력')
        return {
          target,
          targetCount: row.target_count === null ? null : Number(row.target_count),
          start: today(start),
          end: end ? today(end) : null
        }
      })
    const totals = new Map<string, number>()
    const rows = this.db
      .prepare(
        `
      SELECT day, SUM(amount_ml) AS total FROM (
        SELECT day, amount_ml FROM water_records WHERE cancelled_at IS NULL
        UNION ALL
        SELECT day, amount_ml FROM daily_adjustments
      ) GROUP BY day
    `
      )
      .all()
    for (const row of rows) {
      const total = Number(row.total)
      if (!Number.isSafeInteger(total) || total < 0) throw new Error('유효하지 않은 통계 총량')
      totals.set(String(row.day), total)
    }
    const counts = new Map<string, number>()
    for (const row of this.db
      .prepare(
        'SELECT day, COUNT(*) AS total FROM drink_actions WHERE cancelled_at IS NULL GROUP BY day'
      )
      .all())
      counts.set(String(row.day), Number(row.total))
    const offset = (day: string, amount: number): string => {
      const date = new Date(`${day}T00:00:00.000Z`)
      date.setUTCDate(date.getUTCDate() + amount)
      return date.toISOString().slice(0, 10)
    }
    const daily = (day: string): DailyStatistics => {
      const goal = goals.find((item) => item.start <= day && (item.end === null || item.end >= day))
      const totalMl = totals.get(day) ?? 0
      const drinkCount = counts.get(day) ?? 0
      return {
        day,
        totalMl,
        goalMl: goal?.targetCount === null ? goal.target : null,
        goalCount: goal?.targetCount ?? null,
        drinkCount,
        achieved:
          goal?.targetCount != null
            ? drinkCount >= goal.targetCount
            : goal
              ? totalMl >= goal.target
              : false
      }
    }
    const days = Array.from({ length: 7 }, (_, index) => daily(offset(currentDay, index - 6)))
    const tracked = days.filter((day) => day.goalMl !== null || day.goalCount !== null)
    const averageMl = tracked.length
      ? Math.round(tracked.reduce((sum, day) => sum + day.totalMl / tracked.length, 0))
      : null
    const bestDay = days.reduce<DailyStatistics | null>(
      (best, day) => (day.totalMl > 0 && (!best || day.totalMl >= best.totalMl) ? day : best),
      null
    )
    let cursor = daily(currentDay).achieved ? currentDay : offset(currentDay, -1)
    let streak = 0
    while (daily(cursor).achieved) {
      streak++
      cursor = offset(cursor, -1)
    }
    return {
      days,
      averageMl,
      achievedDays: tracked.filter((day) => day.achieved).length,
      trackedDays: tracked.length,
      bestDay,
      streak
    }
  }

  completeSetup(input: SetupInput): AppState {
    const { requestId, goalCount, cupMl } = input
    if (
      typeof requestId !== 'string' ||
      requestId.length < 1 ||
      requestId.length > 128 ||
      !positive(goalCount) ||
      !positive(cupMl)
    )
      throw new InvalidSetupError()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.db
        .prepare('SELECT goal_ml, cup_ml FROM mutation_receipts WHERE request_id = ?')
        .get(requestId)
      if (previous) {
        if (Number(previous.goal_ml) !== goalCount || Number(previous.cup_ml) !== cupMl)
          throw new InvalidSetupError()
      } else {
        if (this.readState().status !== 'setup-required') throw new AlreadyConfiguredError()
        this.db.prepare('INSERT INTO app_settings VALUES (1, ?, 1)').run(cupMl)
        this.db
          .prepare(
            'INSERT INTO goal_sessions (target_ml, target_count, started_at) VALUES (?, ?, ?)'
          )
          .run(cupMl, goalCount, this.now().toISOString())
        this.db.prepare("INSERT INTO plant_state VALUES (1, 'seedling')").run()
        this.db
          .prepare('INSERT INTO plant_vitality VALUES (1, 80, ?)')
          .run(this.now().toISOString())
        this.db
          .prepare('INSERT INTO mutation_receipts VALUES (?, ?, ?)')
          .run(requestId, goalCount, cupMl)
      }
      const currentState = this.readState()
      // 같은 요청의 재전송은 최초 성공 결과를 돌려주며 현재 상태를 덮어쓰지 않는다.
      const state: AppState = previous
        ? {
            status: 'ready',
            goalId: Number(
              this.db.prepare('SELECT id FROM goal_sessions ORDER BY id LIMIT 1').get()?.id
            ),
            goalCount,
            todayCount: 0,
            latestDrinkId: null,
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
      !positive(input.expectedGoalId) ||
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
        // 임시 기준: 기록한 1ml당 성장 1점. 횟수 목표와는 독립적이다.
        const points = Math.min(1_000_000, state.cupMl)
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

  recordDrinkAction(input: DrinkActionInput): { state: AppState; created: boolean } {
    if (
      !input ||
      typeof input.requestId !== 'string' ||
      input.requestId.length < 1 ||
      input.requestId.length > 128 ||
      !positive(input.expectedGoalId) ||
      typeof input.day !== 'string' ||
      (input.kind !== 'add' && input.kind !== 'undo') ||
      (input.kind === 'undo' && !positive(input.recordId ?? 0))
    )
      throw new InvalidSetupError()
    const payload = JSON.stringify([
      input.kind,
      input.expectedGoalId,
      input.day,
      input.recordId ?? null
    ])
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const receipt = this.db
        .prepare('SELECT payload FROM drink_action_receipts WHERE request_id = ?')
        .get(input.requestId)
      let created = false
      if (receipt) {
        if (receipt.payload !== payload) throw new InvalidSetupError()
      } else {
        const state = this.readState()
        if (
          state.status !== 'ready' ||
          state.goalId !== input.expectedGoalId ||
          state.day !== input.day ||
          today(this.now()) !== input.day
        )
          throw new StaleStateError()
        if (input.kind === 'add') {
          this.db
            .prepare(
              'INSERT INTO drink_actions (request_id, goal_id, day, recorded_at) VALUES (?, ?, ?, ?)'
            )
            .run(input.requestId, state.goalId, state.day, this.now().toISOString())
        } else {
          if (state.latestDrinkId !== input.recordId) throw new StaleStateError()
          const changed = this.db
            .prepare(
              'UPDATE drink_actions SET cancelled_at = ? WHERE id = ? AND day = ? AND cancelled_at IS NULL'
            )
            .run(this.now().toISOString(), input.recordId!, state.day)
          if (changed.changes !== 1) throw new StaleStateError()
        }
        this.db
          .prepare('INSERT INTO drink_action_receipts VALUES (?, ?)')
          .run(input.requestId, payload)
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
    if (
      input.kind === 'cup'
        ? !positive(input.cupMl)
        : input.kind === 'stop'
          ? !positive(input.expectedGoalId)
          : input.kind === 'goal'
            ? !(
                positive(input.goalCount) &&
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
          // 기존 ml 목표도 함께 종료하되 과거 기록과 성장 이력은 그대로 둔다.
          this.db
            .prepare('UPDATE goal_sessions SET stopped_at = ? WHERE stopped_at IS NULL')
            .run(now)
          const result = this.db
            .prepare(
              'INSERT INTO goal_sessions (target_ml, target_count, started_at) VALUES (?, ?, ?)'
            )
            .run(state.cupMl, input.goalCount, now)
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
