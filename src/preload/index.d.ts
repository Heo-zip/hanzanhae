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
  ReminderTestResult,
  DrinkActionInput,
  DrinkActionResult,
  LoginItemResult,
  ExportRecordsResult
} from '../shared/appState'

declare global {
  interface Window {
    gardenWindow?: {
      setMousePassthrough: (ignore: boolean) => void
      onMouseCaptureReady: (callback: () => void) => () => void
      onDragCancelled: (callback: () => void) => () => void
      cancelDrag: () => void
      beginDrag: (point: { x: number; y: number }) => void
      moveDrag: (point: { x: number; y: number }) => void
      endDrag: (point: { x: number; y: number }) => Promise<{ ok: boolean }>
    }
    hanzanhae: {
      platform: string
      getState: () => Promise<AppResult>
      getGardenSettings: () => Promise<GardenSettingsResult>
      updateGardenSettings: (change: GardenSettingsChange) => Promise<GardenSettingsResult>
      onGardenSettingsChanged: (callback: () => void) => () => void
      getStatistics: () => Promise<StatisticsResult>
      setCameraActive: (active: boolean) => void
      getLoginItem: () => Promise<LoginItemResult>
      setLoginItem: (openAtLogin: boolean) => Promise<LoginItemResult>
      getReminderSettings: () => Promise<ReminderSettingsResult>
      updateReminderSettings: (settings: ReminderSettings) => Promise<ReminderSettingsResult>
      testReminder: () => Promise<ReminderTestResult>
      completeSetup: (input: SetupInput) => Promise<AppResult>
      updateSettings: (input: SettingsInput) => Promise<AppResult>
      recordCup: (input: RecordCupInput) => Promise<RecordCupResult>
      recordDrinkAction: (input: DrinkActionInput) => Promise<DrinkActionResult>
      cancelWater: (input: CancelWaterInput) => Promise<CancelWaterResult>
      exportRecords: () => Promise<ExportRecordsResult>
      resetData: () => Promise<AppResult>
      onWaterRecorded: (callback: () => void) => () => void
      onDrinkDetected: (callback: (recordId: number) => void) => () => void
      onStateChanged: (callback: () => void) => () => void
    }
  }
}

export {}
