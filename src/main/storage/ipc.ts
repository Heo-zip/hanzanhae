import { app, BrowserWindow, ipcMain } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type { AppResult, SetupInput, SettingsInput } from '../../shared/appState'
import { AlreadyConfiguredError, AppDatabase, InvalidSetupError, StaleStateError } from './database'

let database: AppDatabase | undefined

function getDatabase(): AppDatabase {
  if (!database) database = new AppDatabase(join(app.getPath('userData'), 'hanzanhae.sqlite'))
  return database
}

function trusted(event: Electron.IpcMainInvokeEvent): boolean {
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

export function initializeStorageIpc(getDashboard: () => BrowserWindow | null): void {
  ipcMain.handle('app:get-state', (event): AppResult => {
    if (!trusted(event)) return { ok: false, code: 'VALIDATION_ERROR' }
    try {
      return { ok: true, state: getDatabase().readState() }
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
      for (const window of BrowserWindow.getAllWindows())
        window.webContents.send('app:state-changed')
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
      for (const window of BrowserWindow.getAllWindows())
        window.webContents.send('app:state-changed')
      return { ok: true, state }
    } catch (error) {
      if (error instanceof InvalidSetupError) return { ok: false, code: 'VALIDATION_ERROR' }
      if (error instanceof StaleStateError) return { ok: false, code: 'STALE_STATE' }
      return { ok: false, code: 'STORAGE_ERROR' }
    }
  })
  app.once('will-quit', () => {
    database?.close()
    database = undefined
  })
}
