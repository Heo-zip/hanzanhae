export type PlantStage = 'seedling' | 'young' | 'leafy' | 'flower'
export type PlantStatus = { plantStage: PlantStage; plantVitality: number; growthPoints: number }

export type AppState =
  | { status: 'setup-required' }
  | ({
      status: 'ready'
      goalId: number
      goalMl: number
      cupMl: number
      todayMl: number
      todayRecords: WaterRecord[]
      day: string
    } & PlantStatus)
  | ({
      status: 'goal-stopped'
      cupMl: number
      todayMl: number
      todayRecords: WaterRecord[]
      day: string
    } & PlantStatus)

export type WaterRecord = { id: number; goalId: number; amountMl: number; recordedAt: string }
export type RecordCupInput = { requestId: string; expectedGoalId: number; day: string }
export type RecordCupResult =
  | { ok: true; state: AppState; created: boolean }
  | { ok: false; code: 'VALIDATION_ERROR' | 'STALE_STATE' | 'STORAGE_ERROR' }

export type CancelWaterInput =
  | { requestId: string; kind: 'latest'; expectedGoalId: number; day: string; recordId: number }
  | {
      requestId: string
      kind: 'today'
      expectedGoalId: number
      day: string
      expectedRecordIds: number[]
    }
export type CancelWaterResult =
  | { ok: true; state: AppState; cancelledCount: number; created: boolean }
  | {
      ok: false
      code: 'VALIDATION_ERROR' | 'STALE_STATE' | 'NO_RECORDS' | 'TOTAL_BELOW_ZERO' | 'STORAGE_ERROR'
    }

export type AppResult =
  | { ok: true; state: AppState }
  | { ok: false; code: 'VALIDATION_ERROR' | 'ALREADY_CONFIGURED' | 'STALE_STATE' | 'STORAGE_ERROR' }

export type SetupInput = { requestId: string; goalMl: number; cupMl: number }
export type SettingsInput =
  | { requestId: string; kind: 'cup'; cupMl: number }
  | { requestId: string; kind: 'stop'; expectedGoalId: number }
  | {
      requestId: string
      kind: 'goal'
      expectedGoalId: number | null
      day: string
      expectedTodayMl: number
      goalMl: number
      todayMl: number
    }

export type DailyStatistics = {
  day: string
  totalMl: number
  goalMl: number | null
  achieved: boolean
}
export type WaterStatistics = {
  days: DailyStatistics[]
  averageMl: number | null
  achievedDays: number
  trackedDays: number
  bestDay: DailyStatistics | null
  streak: number
}
export type StatisticsResult =
  | { ok: true; statistics: WaterStatistics }
  | { ok: false; code: 'VALIDATION_ERROR' | 'STORAGE_ERROR' }

export type GardenPlacement = 'dock' | 'floor' | 'custom'
export type GardenPreset = Exclude<GardenPlacement, 'custom'>
export type GardenSettings = {
  placement: GardenPlacement
  alwaysOnTop: boolean
  x: number | null
  y: number | null
}
export type GardenSettingsChange =
  { kind: 'placement'; placement: GardenPreset } | { kind: 'alwaysOnTop'; alwaysOnTop: boolean }
export type GardenSettingsResult =
  { ok: true; settings: GardenSettings } | { ok: false; code: 'VALIDATION_ERROR' | 'STORAGE_ERROR' }

export type ReminderSettings = {
  enabled: boolean
  intervalMinutes: number
  startTime: string
  endTime: string
}
export type ReminderSettingsResult =
  | {
      ok: true
      settings: ReminderSettings
      activation?: 'shown' | 'failed' | 'development-failed' | 'unsupported' | 'pending'
    }
  | { ok: false; code: 'VALIDATION_ERROR' | 'STORAGE_ERROR' }
export type ReminderTestResult =
  | { ok: true }
  | {
      ok: false
      code: 'VALIDATION_ERROR' | 'UNSUPPORTED' | 'NOTIFICATION_ERROR' | 'DEV_NOTIFICATION_ERROR'
    }
