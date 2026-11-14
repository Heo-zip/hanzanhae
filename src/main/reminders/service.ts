import { app, BrowserWindow, ipcMain, Notification, powerMonitor } from 'electron'
import type {
  ReminderSettings,
  ReminderSettingsResult,
  ReminderTestResult
} from '../../shared/appState'
import { getDatabase, trusted } from '../storage/ipc'
import { InvalidSetupError } from '../storage/database'
import { reminderBody, shouldRemind } from './policy'

const openNotifications = new Set<Notification>()
const RETRY_DELAY = 5 * 60_000

export function initializeReminders(
  getDashboard: () => BrowserWindow | null,
  showDashboard: () => void
): void {
  let pending = false
  let lastAttempt = 0
  let pendingShownAt: Date | null = null

  const fromDashboard = (event: Electron.IpcMainInvokeEvent): boolean =>
    trusted(event) && event.sender === getDashboard()?.webContents

  function showNotification(body: string): Promise<ReminderTestResult> {
    if (!Notification.isSupported()) return Promise.resolve({ ok: false, code: 'UNSUPPORTED' })
    const failureCode =
      process.platform === 'darwin' && !app.isPackaged
        ? 'DEV_NOTIFICATION_ERROR'
        : 'NOTIFICATION_ERROR'
    return new Promise((resolve) => {
      let notification: Notification
      try {
        notification = new Notification({ title: '한잔해 🌱', body })
      } catch {
        resolve({ ok: false, code: failureCode })
        return
      }
      openNotifications.add(notification)
      // macOS가 close 이벤트를 항상 주지 않으므로 오래된 참조 수를 제한한다.
      if (openNotifications.size > 50) {
        const oldest = openNotifications.values().next().value
        if (oldest) openNotifications.delete(oldest)
      }
      let settled = false
      const finish = (result: ReminderTestResult): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (!result.ok) openNotifications.delete(notification)
        resolve(result)
      }
      const timeout = setTimeout(() => finish({ ok: false, code: failureCode }), 60_000)
      notification.once('show', () => finish({ ok: true }))
      notification.once('failed', () => finish({ ok: false, code: failureCode }))
      notification.once('close', () => openNotifications.delete(notification))
      notification.on('click', showDashboard)
      try {
        notification.show()
      } catch {
        finish({ ok: false, code: failureCode })
      }
    })
  }

  async function check(): Promise<void> {
    if (pending) return
    try {
      // 표시 후 저장이 잠시 실패하면 다시 알리는 대신 성공 시각 저장을 재시도한다.
      if (pendingShownAt) {
        getDatabase().recordReminderShown(pendingShownAt)
        pendingShownAt = null
      }
      const now = new Date()
      if (now.getTime() - lastAttempt < RETRY_DELAY) return
      const context = getDatabase().readReminderContext()
      if (!shouldRemind({ ...context, now })) return
      pending = true
      lastAttempt = now.getTime()
      const result = await showNotification(reminderBody(context.vitality))
      if (result.ok) {
        pendingShownAt = new Date()
        getDatabase().recordReminderShown(pendingShownAt)
        pendingShownAt = null
      }
    } catch {
      // 알림이나 저장 실패가 물 기록을 막지 않으며 다음 검사에서 복구한다.
    } finally {
      pending = false
    }
  }

  ipcMain.handle('reminder:get-settings', (event): ReminderSettingsResult => {
    if (!fromDashboard(event)) return { ok: false, code: 'VALIDATION_ERROR' }
    try {
      return { ok: true, settings: getDatabase().readReminderSettings() }
    } catch {
      return { ok: false, code: 'STORAGE_ERROR' }
    }
  })
  ipcMain.handle(
    'reminder:update-settings',
    async (event, settings: ReminderSettings): Promise<ReminderSettingsResult> => {
      if (!fromDashboard(event)) return { ok: false, code: 'VALIDATION_ERROR' }
      try {
        const database = getDatabase()
        const previous = database.readReminderSettings()
        const saved = database.saveReminderSettings(settings)
        if (saved.enabled && !previous.enabled) {
          if (pending) return { ok: true, settings: saved, activation: 'pending' }
          // 사용자가 알림을 켠 순간 macOS 권한을 요청하고 결과를 바로 안내한다.
          pending = true
          lastAttempt = Date.now()
          try {
            const result = await showNotification('알림이 켜졌어요. 물 마실 때를 알려드릴게요.')
            if (!result.ok)
              return {
                ok: true,
                settings: saved,
                activation:
                  result.code === 'UNSUPPORTED'
                    ? 'unsupported'
                    : result.code === 'DEV_NOTIFICATION_ERROR'
                      ? 'development-failed'
                      : 'failed'
              }
            try {
              pendingShownAt = new Date()
              database.recordReminderShown(pendingShownAt)
              pendingShownAt = null
            } catch {
              // 다음 검사에서 성공 시각 저장을 재시도한다.
            }
            return { ok: true, settings: saved, activation: 'shown' }
          } finally {
            pending = false
          }
        }
        void check()
        return { ok: true, settings: saved }
      } catch (error) {
        return {
          ok: false,
          code: error instanceof InvalidSetupError ? 'VALIDATION_ERROR' : 'STORAGE_ERROR'
        }
      }
    }
  )
  ipcMain.handle('reminder:test', (event): Promise<ReminderTestResult> => {
    if (!fromDashboard(event)) return Promise.resolve({ ok: false, code: 'VALIDATION_ERROR' })
    return showNotification('물을 마실 때가 되면 이렇게 알려드릴게요.')
  })

  const timer = setInterval(() => void check(), 60_000)
  powerMonitor.on('resume', check)
  void check()
  app.once('will-quit', () => {
    clearInterval(timer)
    powerMonitor.removeListener('resume', check)
  })
}
