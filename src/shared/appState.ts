export type AppState =
  | { status: 'setup-required' }
  | {
      status: 'ready'
      goalId: number
      goalMl: number
      cupMl: number
      todayMl: number
      day: string
      plantStage: 'seedling'
    }
  | { status: 'goal-stopped'; cupMl: number; todayMl: number; day: string }

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
