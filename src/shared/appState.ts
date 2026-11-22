export type PlantStage = 'seedling' | 'young' | 'leafy' | 'flower'
/** 각 성장 단계가 시작되는 누적 성장점. 텀블러 1ml당 1점, 마신 횟수 1회당 100점. */
export const STAGE_POINTS: Record<PlantStage, number> = {
  seedling: 0,
  young: 3000,
  leafy: 7000,
  flower: 14000
}
export type PlantStatus = { plantStage: PlantStage; plantVitality: number; growthPoints: number }

export type AppState =
  | { status: 'setup-required' }
  | ({
      status: 'ready'
      goalId: number
      goalCount: number
      todayCount: number
      latestDrinkId: number | null
      todayDrinks: DrinkRecord[]
      cupMl: number
      todayMl: number
      todayRecords: WaterRecord[]
      day: string
    } & PlantStatus)
  | ({
      status: 'goal-stopped'
      todayCount: number
      latestDrinkId: number | null
      todayDrinks: DrinkRecord[]
      cupMl: number
      todayMl: number
      todayRecords: WaterRecord[]
      day: string
    } & PlantStatus)

export type WaterRecord = { id: number; goalId: number; amountMl: number; recordedAt: string }
/** 오늘 마신 횟수 한 번. 최신 순으로 담는다. */
export type DrinkRecord = { id: number; recordedAt: string; source: 'button' | 'camera' }
export type DrinkActionInput = {
  requestId: string
  expectedGoalId: number
  day: string
  kind: 'add' | 'undo'
  recordId?: number
  /** 추가할 때만 쓴다. 없으면 버튼으로 본다. */
  source?: 'button' | 'camera'
  /** 수동 추가 확인창에서 본 최신 기록이다. */
  confirmedLatestDrinkId?: number
}
export type DrinkConfirmation = { reason: 'rapid' | 'camera'; latestDrinkId: number }
export type DrinkActionResult =
  AppResult | { ok: false; code: 'CONFIRM_DRINK'; confirmation: DrinkConfirmation }
export type RecordCupInput = { requestId: string; expectedGoalId: number; day: string }
export type RecordCupResult =
  | { ok: true; state: AppState; created: boolean; record: WaterRecord }
  | { ok: false; code: 'VALIDATION_ERROR' | 'STALE_STATE' | 'STORAGE_ERROR' }

export type CancelWaterInput =
  | { requestId: string; kind: 'latest'; expectedGoalId: number; day: string; recordId: number }
  | {
      requestId: string
      kind: 'today'
      expectedGoalId: number
      day: string
      expectedRecordIds: number[]
      /** 화면에서 확인한 오늘 마신 횟수와 그 마지막 기록. 전체 취소는 횟수도 함께 취소한다. */
      expectedDrinkCount: number
      expectedLatestDrinkId: number | null
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

export type SetupInput = { requestId: string; goalCount: number; cupMl: number }
export type SettingsInput =
  | { requestId: string; kind: 'cup'; cupMl: number }
  | { requestId: string; kind: 'stop'; expectedGoalId: number }
  | {
      requestId: string
      kind: 'goal'
      expectedGoalId: number | null
      day: string
      expectedTodayMl: number
      goalCount: number
      todayMl: number
    }

export type DailyStatistics = {
  day: string
  totalMl: number
  goalMl: number | null
  goalCount: number | null
  drinkCount: number
  achieved: boolean
}
export type WaterStatistics = {
  days: DailyStatistics[]
  averageCount: number | null
  achievedDays: number
  trackedDays: number
  bestDay: DailyStatistics | null
  streak: number
}
export type StatisticsResult =
  | { ok: true; statistics: WaterStatistics }
  | { ok: false; code: 'VALIDATION_ERROR' | 'STORAGE_ERROR' }
/** saved가 false면 사용자가 저장 창을 닫은 것이다. */
export type ExportRecordsResult =
  { ok: true; saved: boolean } | { ok: false; code: 'VALIDATION_ERROR' | 'STORAGE_ERROR' }

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

// 로그인 시 자동 실행. needsApproval은 macOS 시스템 설정에서 사용자의 허용이 필요한 상태다.
export type LoginItemResult =
  | { ok: true; openAtLogin: boolean; available: boolean; needsApproval?: boolean }
  | { ok: false; code: 'VALIDATION_ERROR' | 'LOGIN_ITEM_ERROR' }

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
