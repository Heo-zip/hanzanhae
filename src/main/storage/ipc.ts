import { app, BrowserWindow, ipcMain } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type {
  AppResult,
  SetupInput,
  SettingsInput,
  RecordCupInput,
  RecordCupResult,
  CancelWaterInput,
  CancelWaterResult,
  StatisticsResult,
  DrinkActionInput
} from '../../shared/appState'
import {
  AlreadyConfiguredError,
  AppDatabase,
  InvalidSetupError,
  StaleStateError,
  NoRecordsError,
  TotalBelowZeroError
} from './database'

let database: AppDatabase | undefined

export function getDatabase(): AppDatabase {
  if (!database) database = new AppDatabase(join(app.getPath('userData'), 'hanzanhae.sqlite'))
  return database
}

export function trusted(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  if (!BrowserWindow.fromWebContents(event.sender) || event.senderFrame !== event.sender.mainFrame)
    return false
  try {
    const current = new URL(event.sender.getURL())
    const expected = new URL(
      is.dev && process.env['ELECTRON_RENDERER_URL']
        ? process.env['ELECTRON_RENDERER_URL']
        : pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
    )
    return current.origin === expected.origin && current.pathname === expected.pathname
  } catch {
    return false
  }
}

// 저장이 끝난 뒤 보내는 알림이다. 닫히는 창에 보내다 생긴 오류가 저장 결과를 실패로 바꾸지 않게 한다.
function broadcast(...channels: string[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue
    try {
      for (const channel of channels) window.webContents.send(channel)
    } catch {
      // 다음 상태 조회에서 창이 최신 값을 다시 불러온다.
    }
  }
}

export function initializeStorageIpc(
  getDashboard: () => BrowserWindow | null,
  getGarden: () => BrowserWindow | null
): void {
  ipcMain.handle('app:get-state', (event): AppResult => {
    if (!trusted(event)) return { ok: false, code: 'VALIDATION_ERROR' }
    try {
      return { ok: true, state: getDatabase().readState() }
    } catch {
      return { ok: false, code: 'STORAGE_ERROR' }
    }
  })
  ipcMain.handle('app:get-statistics', (event): StatisticsResult => {
    if (!trusted(event) || event.sender !== getDashboard()?.webContents)
      return { ok: false, code: 'VALIDATION_ERROR' }
    try {
      return { ok: true, statistics: getDatabase().readStatistics() }
    } catch {
      return { ok: false, code: 'STORAGE_ERROR' }
    }
  })
  ipcMain.handle('app:complete-setup', (event, input: SetupInput): AppResult => {
    if (
      !trusted(event) ||
      event.sender !== getDashboard()?.webContents ||
      !input ||
      typeof input !== 'object'
    ) {
      return { ok: false, code: 'VALIDATION_ERROR' }
    }
    try {
      const state = getDatabase().completeSetup(input)
      broadcast('app:state-changed')
      return { ok: true, state }
    } catch (error) {
      if (error instanceof InvalidSetupError) return { ok: false, code: 'VALIDATION_ERROR' }
      if (error instanceof AlreadyConfiguredError) return { ok: false, code: 'ALREADY_CONFIGURED' }
      return { ok: false, code: 'STORAGE_ERROR' }
    }
  })
  ipcMain.handle('app:update-settings', (event, input: SettingsInput): AppResult => {
    if (
      !trusted(event) ||
      event.sender !== getDashboard()?.webContents ||
      !input ||
      typeof input !== 'object'
    )
      return { ok: false, code: 'VALIDATION_ERROR' }
    try {
      const state = getDatabase().updateSettings(input)
      broadcast('app:state-changed')
      return { ok: true, state }
    } catch (error) {
      if (error instanceof InvalidSetupError) return { ok: false, code: 'VALIDATION_ERROR' }
      if (error instanceof StaleStateError) return { ok: false, code: 'STALE_STATE' }
      return { ok: false, code: 'STORAGE_ERROR' }
    }
  })
  ipcMain.handle('app:record-cup', (event, input: RecordCupInput): RecordCupResult => {
    if (
      !trusted(event) ||
      (event.sender !== getDashboard()?.webContents && event.sender !== getGarden()?.webContents) ||
      !input ||
      typeof input !== 'object'
    )
      return { ok: false, code: 'VALIDATION_ERROR' }
    try {
      const result = getDatabase().recordCup(input)
      if (result.created) broadcast('app:state-changed', 'app:water-recorded')
      return { ok: true, ...result }
    } catch (error) {
      if (error instanceof InvalidSetupError) return { ok: false, code: 'VALIDATION_ERROR' }
      if (error instanceof StaleStateError) return { ok: false, code: 'STALE_STATE' }
      return { ok: false, code: 'STORAGE_ERROR' }
    }
  })
  ipcMain.handle('app:record-drink-action', (event, input: DrinkActionInput): AppResult => {
    if (
      !trusted(event) ||
      event.sender !== getDashboard()?.webContents ||
      !input ||
      typeof input !== 'object'
    )
      return { ok: false, code: 'VALIDATION_ERROR' }
    try {
      const result = getDatabase().recordDrinkAction(input)
      if (result.created) broadcast('app:state-changed')
      return { ok: true, state: result.state }
    } catch (error) {
      if (error instanceof InvalidSetupError) return { ok: false, code: 'VALIDATION_ERROR' }
      if (error instanceof StaleStateError) return { ok: false, code: 'STALE_STATE' }
      return { ok: false, code: 'STORAGE_ERROR' }
    }
  })
  ipcMain.handle('app:cancel-water', (event, input: CancelWaterInput): CancelWaterResult => {
    const fromDashboard = event.sender === getDashboard()?.webContents
    const fromGarden = event.sender === getGarden()?.webContents
    if (
      !trusted(event) ||
      (!fromDashboard && !fromGarden) ||
      !input ||
      typeof input !== 'object' ||
      (fromGarden && input.kind !== 'latest')
    )
      return { ok: false, code: 'VALIDATION_ERROR' }
    try {
      const result = getDatabase().cancelWater(input)
      if (result.created) broadcast('app:state-changed')
      return { ok: true, ...result }
    } catch (error) {
      if (error instanceof InvalidSetupError) return { ok: false, code: 'VALIDATION_ERROR' }
      if (error instanceof StaleStateError) return { ok: false, code: 'STALE_STATE' }
      if (error instanceof NoRecordsError) return { ok: false, code: 'NO_RECORDS' }
      if (error instanceof TotalBelowZeroError) return { ok: false, code: 'TOTAL_BELOW_ZERO' }
      return { ok: false, code: 'STORAGE_ERROR' }
    }
  })
  // 강제 종료 시에도 마지막 1분 이내의 실행 시간만 종료 중 속도로 계산한다.
  const plantTimer = setInterval(() => {
    try {
      database?.checkpointPlant()
    } catch {
      // 다음 조회나 저장에서 오류를 안내한다.
    }
  }, 60_000)
  app.once('will-quit', () => {
    clearInterval(plantTimer)
    database?.close()
    database = undefined
  })
}
