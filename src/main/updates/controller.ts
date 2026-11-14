type CheckResult = { isUpdateAvailable: boolean; updateInfo: { version: string } } | null

type UpdateEngine = {
  checkForUpdates: () => Promise<CheckResult>
  downloadUpdate: () => Promise<unknown>
  quitAndInstall: () => void
}

type UpdateDialogs = {
  unavailable: () => Promise<void>
  busy: () => Promise<void>
  upToDate: () => Promise<void>
  confirmDownload: (version: string) => Promise<boolean>
  downloading: () => Promise<void>
  confirmInstall: (version: string) => Promise<boolean>
  failed: () => Promise<void>
  installFailed: () => Promise<void>
  storageFailed: () => Promise<void>
}

export function createUpdateController(
  updater: UpdateEngine,
  dialogs: UpdateDialogs,
  isAvailable: () => boolean,
  checkpointStorage: () => void
): { check: (manual?: boolean) => Promise<void>; handleInstallError: () => void } {
  let busy = false
  let installing = false
  let retryAfterRestart = false
  let downloadedVersion: string | null = null
  let postponedVersion: string | null = null

  async function offerInstall(): Promise<void> {
    if (!downloadedVersion || !(await dialogs.confirmInstall(downloadedVersion))) return
    try {
      // 앱이 닫히기 전 생기와 기록의 저장 상태를 먼저 확인한다.
      checkpointStorage()
    } catch {
      await dialogs.storageFailed()
      return
    }
    installing = true
    try {
      updater.quitAndInstall()
    } catch {
      installing = false
      retryAfterRestart = true
      await dialogs.installFailed()
    }
  }

  async function check(manual = false): Promise<void> {
    if (!isAvailable()) {
      if (manual) await dialogs.unavailable()
      return
    }
    if (retryAfterRestart) {
      if (manual) await dialogs.installFailed()
      return
    }
    if (busy || installing) {
      if (manual) await dialogs.busy()
      return
    }
    busy = true
    let acceptedDownload = false
    try {
      if (downloadedVersion) {
        if (manual) await offerInstall()
        return
      }
      const result = await updater.checkForUpdates()
      if (!result) {
        if (manual) await dialogs.unavailable()
        return
      }
      if (!result.isUpdateAvailable) {
        if (manual) await dialogs.upToDate()
        return
      }
      const version = result.updateInfo.version
      if (!manual && postponedVersion === version) return
      if (!(await dialogs.confirmDownload(version))) {
        postponedVersion = version
        return
      }
      acceptedDownload = true
      await dialogs.downloading()
      await updater.downloadUpdate()
      downloadedVersion = version
      postponedVersion = null
      await offerInstall()
    } catch {
      if (manual || acceptedDownload) await dialogs.failed()
    } finally {
      busy = false
    }
  }

  function handleInstallError(): void {
    if (!installing) return
    installing = false
    retryAfterRestart = true
    downloadedVersion = null
    // 앱이 종료되는 중이면 대화상자를 열 수 없으므로 실패를 무시한다.
    void dialogs.installFailed().catch(() => undefined)
  }

  return { check, handleInstallError }
}
