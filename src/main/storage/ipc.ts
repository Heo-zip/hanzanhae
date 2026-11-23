import { app, BrowserWindow, dialog, ipcMain, powerMonitor } from 'electron'
import { mkdirSync, writeFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { randomUUID } from 'crypto'
import type {
  AppResult,
  SetupInput,
  SettingsInput,
  RecordCupInput,
  RecordCupResult,
  CancelWaterInput,
  CancelWaterResult,
  StatisticsResult,
  DrinkActionInput,
  DrinkActionResult,
  ExportRecordsResult
} from '../../shared/appState'
import {
  AlreadyConfiguredError,
  AppDatabase,
  InvalidSetupError,
  resetDatabaseFile,
  StaleStateError,
  DrinkConfirmationRequiredError,
  NoRecordsError,
  TotalBelowZeroError
} from './database'

let database: AppDatabase | undefined
// 대시보드의 카메라 감지가 켜져 있는지. 카메라 기록 주장과 텀블러 생기 보상을 앱 본체가 판단한다.
let cameraActive = false

export function setCameraActive(active: boolean): void {
  cameraActive = active
}

const databasePath = (): string => join(app.getPath('userData'), 'hanzanhae.sqlite')

export function getDatabase(): AppDatabase {
  if (!database) database = new AppDatabase(databasePath())
  return database
}

function resetDatabase(): void {
  const directory = join(app.getPath('userData'), 'backups')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const current = getDatabase()
  try {
    database = resetDatabaseFile(
      current,
      databasePath(),
      join(directory, `hanzanhae-before-reset-${randomUUID()}.sqlite`),
      (path) => new AppDatabase(path)
    )
  } catch (error) {
    // 사본 단계에서 실패하면 기존 연결이 그대로 열려 있어 계속 쓴다. 닫혔으면 다음 조회가 되돌린 파일을 연다.
    if (!current.isOpen()) database = undefined
    throw error
  }
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
    // file: 주소는 origin이 모두 'null'이라 프로토콜·호스트·경로를 직접 비교한다.
    return (
      current.protocol === expected.protocol &&
      current.host === expected.host &&
      current.pathname === expected.pathname
    )
  } catch {
    return false
  }
}

function sendToGarden(garden: BrowserWindow | null, channel: string, value: number): void {
  if (!garden || garden.isDestroyed() || garden.webContents.isDestroyed()) return
  try {
    garden.webContents.send(channel, value)
  } catch {
    // 정원은 다음 상태 조회에서 기록을 반영한다. 알림만 놓친다.
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
      const result = getDatabase().recordCup(input, { cameraActive })
      if (result.created) broadcast('app:state-changed', 'app:water-recorded')
      return { ok: true, ...result }
    } catch (error) {
      if (error instanceof InvalidSetupError) return { ok: false, code: 'VALIDATION_ERROR' }
      if (error instanceof StaleStateError) return { ok: false, code: 'STALE_STATE' }
      return { ok: false, code: 'STORAGE_ERROR' }
    }
  })
  ipcMain.handle('app:record-drink-action', (event, input: DrinkActionInput): DrinkActionResult => {
    const fromDashboard = event.sender === getDashboard()?.webContents
    const fromGarden = event.sender === getGarden()?.webContents
    if (
      !trusted(event) ||
      (!fromDashboard && !fromGarden) ||
      !input ||
      typeof input !== 'object' ||
      // 정원은 방금 카메라가 저장한 기록을 되돌리는 것만 할 수 있다.
      (fromGarden && input.kind !== 'undo') ||
      (input.kind === 'add' && input.source === 'camera' && !cameraActive)
    )
      return { ok: false, code: 'VALIDATION_ERROR' }
    try {
      const result = getDatabase().recordDrinkAction(input, { recentCameraOnly: fromGarden })
      if (result.created) broadcast('app:state-changed')
      const detected = result.state.status === 'ready' ? result.state.latestDrinkId : null
      if (result.created && input.kind === 'add' && input.source === 'camera' && detected !== null)
        sendToGarden(getGarden(), 'app:drink-detected', detected)
      return { ok: true, state: result.state }
    } catch (error) {
      if (error instanceof DrinkConfirmationRequiredError)
        return { ok: false, code: 'CONFIRM_DRINK', confirmation: error.confirmation }
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
  ipcMain.handle('app:export-records', async (event): Promise<ExportRecordsResult> => {
    const dashboard = getDashboard()
    if (!trusted(event) || !dashboard || event.sender !== dashboard.webContents)
      return { ok: false, code: 'VALIDATION_ERROR' }
    try {
      const csv = getDatabase().exportCsv()
      const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
      const { canceled, filePath } = await dialog.showSaveDialog(dashboard, {
        defaultPath: join(app.getPath('documents'), `한잔해-기록-${day}.csv`),
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (canceled || !filePath) return { ok: true, saved: false }
      writeFileSync(filePath, csv)
      return { ok: true, saved: true }
    } catch {
      return { ok: false, code: 'STORAGE_ERROR' }
    }
  })
  ipcMain.handle('app:reset-data', (event): AppResult => {
    if (!trusted(event) || event.sender !== getDashboard()?.webContents)
      return { ok: false, code: 'VALIDATION_ERROR' }
    try {
      resetDatabase()
      setCameraActive(false)
      broadcast('app:state-changed', 'garden:settings-changed')
      return { ok: true, state: getDatabase().readState() }
    } catch {
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
  // 화면 잠금·잠자기 동안은 자리를 비운 것으로 보고 생기를 천천히 줄인다.
  const setPresence = (presence: 'active' | 'away') => (): void => {
    try {
      database?.setPresence(presence)
    } catch {
      // 다음 저장에서 다시 계산한다.
    }
  }
  const away = setPresence('away')
  const active = setPresence('active')
  powerMonitor.on('lock-screen', away)
  powerMonitor.on('suspend', away)
  powerMonitor.on('unlock-screen', active)
  powerMonitor.on('resume', active)
  app.once('will-quit', () => {
    powerMonitor.off('lock-screen', away)
    powerMonitor.off('suspend', away)
    powerMonitor.off('unlock-screen', active)
    powerMonitor.off('resume', active)
    clearInterval(plantTimer)
    database?.close()
    database = undefined
  })
}
