import type {
  AppResult,
  SetupInput,
  SettingsInput,
  RecordCupInput,
  RecordCupResult
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
      onWaterRecorded: (callback: () => void) => () => void
      onStateChanged: (callback: () => void) => () => void
    }
  }
}

export {}
