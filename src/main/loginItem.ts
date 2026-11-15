import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import type { LoginItemResult } from '../shared/appState'
import { trusted as fromAppDocument } from './storage/ipc'

// 로그인 항목은 macOS가 직접 관리하므로 DB에 따로 저장하지 않고 매번 시스템에서 읽는다.
// 개발 실행은 Electron 바이너리가 등록되므로 배포 앱(macOS)에서만 사용한다.
function available(): boolean {
  return process.platform === 'darwin' && app.isPackaged
}

function current(): LoginItemResult {
  if (!available()) return { ok: true, openAtLogin: false, available: false }
  const settings = app.getLoginItemSettings()
  return {
    ok: true,
    openAtLogin: settings.openAtLogin,
    available: true,
    needsApproval: settings.status === 'requires-approval'
  }
}

export function initializeLoginItemIpc(getDashboard: () => BrowserWindow | null): void {
  // 다른 IPC와 같은 검사(메인 프레임 + 앱 문서 주소)에 대시보드 창인지까지 확인한다.
  const trusted = (event: IpcMainInvokeEvent): boolean =>
    fromAppDocument(event) && event.sender === getDashboard()?.webContents

  ipcMain.handle('app:get-login-item', (event): LoginItemResult => {
    if (!trusted(event)) return { ok: false, code: 'VALIDATION_ERROR' }
    try {
      return current()
    } catch {
      return { ok: false, code: 'LOGIN_ITEM_ERROR' }
    }
  })

  ipcMain.handle('app:set-login-item', (event, openAtLogin: unknown): LoginItemResult => {
    if (!trusted(event) || typeof openAtLogin !== 'boolean' || !available())
      return { ok: false, code: 'VALIDATION_ERROR' }
    try {
      app.setLoginItemSettings({ openAtLogin })
      const result = current()
      // 시스템이 요청을 반영하지 않았으면 성공으로 알리지 않는다.
      if (result.ok && result.openAtLogin !== openAtLogin && !result.needsApproval)
        return { ok: false, code: 'LOGIN_ITEM_ERROR' }
      return result
    } catch {
      return { ok: false, code: 'LOGIN_ITEM_ERROR' }
    }
  })
}
