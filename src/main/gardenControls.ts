import { app, globalShortcut, Menu, nativeImage, Tray } from 'electron'
import trayIcon from '../../resources/trayTemplate.png?asset'
import appIcon from '../../resources/icon.png?asset'
import {
  GARDEN_SHORTCUT,
  hideGardenWindow,
  showGardenWindow,
  toggleGardenWindow
} from './windows/gardenWindow'

export function initializeGardenControls(
  showDashboard: () => void,
  checkForUpdates: () => void,
  stopCamera: () => void
): (active: boolean) => void {
  const shortcutRegistered = globalShortcut.register(GARDEN_SHORTCUT, toggleGardenWindow)
  const shortcutLabel = process.platform === 'darwin' ? '⌘ + ⌥ + ⇧ + H' : 'Ctrl + Alt + Shift + H'

  // macOS는 밝은·어두운 메뉴 막대에 모두 맞는 단색 템플릿 아이콘을 쓴다.
  // Windows·Linux는 템플릿 색 반전이 없어 검은 아이콘이 어두운 작업 표시줄에서 보이지 않으므로 앱 아이콘을 쓴다.
  const image =
    process.platform === 'darwin'
      ? nativeImage.createFromPath(trayIcon)
      : nativeImage.createFromPath(appIcon).resize({ width: 32, height: 32 })
  if (process.platform === 'darwin') image.setTemplateImage(true)
  const tray = new Tray(image)
  let cameraActive = false
  // Windows는 트레이 아이콘을 왼쪽 클릭해도 메뉴가 열리지 않으므로 대시보드를 연다.
  if (process.platform === 'win32') tray.on('click', showDashboard)
  function updateMenu(): void {
    tray.setToolTip(cameraActive ? '한잔해 · 카메라 사용 중' : '한잔해')
    if (process.platform === 'darwin') tray.setTitle(cameraActive ? '카메라 사용 중' : '')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '정원 보이기', click: showGardenWindow },
        { label: '정원 숨기기', click: hideGardenWindow },
        {
          label: shortcutRegistered
            ? `정원 전환: ${shortcutLabel}`
            : `단축키 등록 실패: ${shortcutLabel} (다른 앱과 충돌할 수 있어요)`,
          enabled: false
        },
        { type: 'separator' },
        { label: '대시보드 열기', click: showDashboard },
        { label: '카메라 끄기', visible: cameraActive, click: stopCamera },
        { label: '업데이트 확인', click: checkForUpdates },
        { type: 'separator' },
        { label: '한잔해 종료', click: () => app.quit() }
      ])
    )
  }
  updateMenu()

  app.once('will-quit', () => {
    if (shortcutRegistered) globalShortcut.unregister(GARDEN_SHORTCUT)
    tray.destroy()
  })
  return (active) => {
    if (tray.isDestroyed() || active === cameraActive) return
    cameraActive = active
    updateMenu()
  }
}
