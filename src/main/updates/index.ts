import { app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { platformName, platformSupport } from '../../shared/platform'
import { getDatabase } from '../storage/ipc'
import { createUpdateController } from './controller'

const CHECK_DELAY = 30_000
const CHECK_INTERVAL = 6 * 60 * 60_000

export function initializeUpdates(): () => void {
  // 사용자가 확인하기 전에는 다운로드하거나 앱 종료 시 자동 설치하지 않는다.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false

  const message = async (title: string, detail: string): Promise<void> => {
    await dialog.showMessageBox({ type: 'info', title, message: title, detail, buttons: ['확인'] })
  }
  const controller = createUpdateController(
    autoUpdater,
    {
      unavailable: () =>
        message(
          '업데이트를 확인할 수 없어요',
          platformSupport(process.platform).autoUpdate
            ? '업데이트 확인은 설치한 앱에서 사용할 수 있어요.'
            : `${platformName(process.platform)}에서는 자동 업데이트를 아직 지원하지 않아요. 새 버전은 배포 페이지에서 직접 받아 설치해 주세요.`
        ),
      busy: () =>
        message('업데이트를 확인하고 있어요', '진행 중인 작업이 끝날 때까지 잠시 기다려 주세요.'),
      upToDate: () =>
        message('최신 버전이에요', `현재 한잔해 ${app.getVersion()} 버전을 사용 중이에요.`),
      confirmDownload: async (version) => {
        const result = await dialog.showMessageBox({
          type: 'question',
          title: '새로운 한잔해가 있어요',
          message: `한잔해 ${version} 버전이 나왔어요.`,
          detail: '새 버전을 다운로드할까요? 물 기록과 설정은 그대로 유지돼요.',
          buttons: ['다운로드', '나중에'],
          defaultId: 0,
          cancelId: 1,
          noLink: true
        })
        return result.response === 0
      },
      downloading: () =>
        message(
          '업데이트를 다운로드할게요',
          '다운로드가 끝나면 다시 알려드릴게요. 그동안 앱을 계속 사용할 수 있어요.'
        ),
      confirmInstall: async (version) => {
        const result = await dialog.showMessageBox({
          type: 'question',
          title: '업데이트를 준비했어요',
          message: `한잔해 ${version} 버전이 준비됐어요.`,
          detail: '지금 재시작해서 업데이트할까요? 물 기록과 설정은 그대로 유지돼요.',
          buttons: ['재시작하고 업데이트', '나중에'],
          defaultId: 0,
          cancelId: 1,
          noLink: true
        })
        return result.response === 0
      },
      failed: () =>
        message(
          '업데이트를 완료하지 못했어요',
          '인터넷 연결을 확인하고 나중에 다시 시도해 주세요. 기존 기록은 유지돼요.'
        ),
      installFailed: () =>
        message(
          '업데이트 설치를 완료하지 못했어요',
          '한잔해를 종료하고 다시 실행한 뒤 업데이트를 확인해 주세요.'
        ),
      storageFailed: () =>
        message(
          '기록을 확인하지 못했어요',
          '안전하게 업데이트를 멈췄어요. 앱을 다시 실행한 뒤 시도해 주세요.'
        )
    },
    () => platformSupport(process.platform).autoUpdate && app.isPackaged,
    () => getDatabase().checkpointPlant()
  )

  // Mac의 설치 준비 오류는 quitAndInstall이 반환된 뒤에 도착할 수도 있다.
  autoUpdater.on('error', controller.handleInstallError)
  const check = (manual = false): void => {
    // 종료 도중 시스템 대화상자가 닫혀도 미처리 오류가 남지 않게 한다.
    void controller.check(manual).catch(() => undefined)
  }
  const firstCheck = setTimeout(check, CHECK_DELAY)
  const interval = setInterval(check, CHECK_INTERVAL)
  app.once('will-quit', () => {
    clearTimeout(firstCheck)
    clearInterval(interval)
    autoUpdater.removeListener('error', controller.handleInstallError)
  })
  return () => check(true)
}
