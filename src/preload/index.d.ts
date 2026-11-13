import type {
  AppResult,
  SetupInput,
  SettingsInput,
  RecordCupInput,
  RecordCupResult,
  CancelWaterInput,
  CancelWaterResult
} from '../shared/appState'

declare global {
  interface Window {
    gardenWindow?: {
      setMousePassthrough: (ignore: boolean) => void
    }
    hanzanhae: {
      getState: () => Promise<AppResult>
      completeSetup: (input: SetupInput) => Promise<AppResult>
      updateSettings: (input: SettingsInput) => Promise<AppResult>
      recordCup: (input: RecordCupInput) => Promise<RecordCupResult>
      cancelWater: (input: CancelWaterInput) => Promise<CancelWaterResult>
      onWaterRecorded: (callback: () => void) => () => void
      onStateChanged: (callback: () => void) => () => void
    }
  }
}

export {}
