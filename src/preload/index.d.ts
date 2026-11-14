import type {
  AppResult,
  SetupInput,
  SettingsInput,
  RecordCupInput,
  RecordCupResult,
  CancelWaterInput,
  CancelWaterResult,
  StatisticsResult,
  GardenSettingsChange,
  GardenSettingsResult,
  ReminderSettings,
  ReminderSettingsResult,
  ReminderTestResult
} from '../shared/appState'

declare global {
  interface Window {
    gardenWindow?: {
      setMousePassthrough: (ignore: boolean) => void
      onDragCancelled: (callback: () => void) => () => void
      cancelDrag: () => void
      beginDrag: (point: { x: number; y: number }) => void
      moveDrag: (point: { x: number; y: number }) => void
      endDrag: (point: { x: number; y: number }) => Promise<{ ok: boolean }>
    }
    hanzanhae: {
      getState: () => Promise<AppResult>
      getGardenSettings: () => Promise<GardenSettingsResult>
      updateGardenSettings: (change: GardenSettingsChange) => Promise<GardenSettingsResult>
      onGardenSettingsChanged: (callback: () => void) => () => void
      getStatistics: () => Promise<StatisticsResult>
      getReminderSettings: () => Promise<ReminderSettingsResult>
      updateReminderSettings: (settings: ReminderSettings) => Promise<ReminderSettingsResult>
      testReminder: () => Promise<ReminderTestResult>
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
