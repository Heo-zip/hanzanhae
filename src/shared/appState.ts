export type AppState =
  | { status: 'setup-required' }
  | {
      status: 'ready'
      goalId: number
      goalMl: number
      cupMl: number
      todayMl: number
      todayRecords: WaterRecord[]
      day: string
      plantStage: 'seedling'
    }
  | {
      status: 'goal-stopped'
      cupMl: number
      todayMl: number
      todayRecords: WaterRecord[]
      day: string
    }

export type WaterRecord = { id: number; amountMl: number; recordedAt: string }
export type RecordCupInput = { requestId: string; expectedGoalId: number; day: string }
export type RecordCupResult =
  | { ok: true; state: AppState; created: boolean }
  | { ok: false; code: 'VALIDATION_ERROR' | 'STALE_STATE' | 'STORAGE_ERROR' }

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
