import type { AppResult, SetupInput, SettingsInput } from '../shared/appState'

declare global {
  interface Window {
    gardenWindow?: {
      setMousePassthrough: (ignore: boolean) => void
    }
    hanzanhae: {
      getState: () => Promise<AppResult>
      completeSetup: (input: SetupInput) => Promise<AppResult>
      updateSettings: (input: SettingsInput) => Promise<AppResult>
      onStateChanged: (callback: () => void) => () => void
    }
  }
}

export {}
