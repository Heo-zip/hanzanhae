import { app, globalShortcut, Menu, nativeImage, Tray } from 'electron'
import trayIcon from '../../resources/trayTemplate.png?asset'
import {
  GARDEN_SHORTCUT,
  hideGardenWindow,
  showGardenWindow,
  toggleGardenWindow
} from './windows/gardenWindow'

let tray: Tray | null = null

export function initializeGardenControls(
  showDashboard: () => void,
  checkForUpdates: () => void
): void {
  const shortcutRegistered = globalShortcut.register(GARDEN_SHORTCUT, toggleGardenWindow)
  const shortcutLabel = process.platform === 'darwin' ? '⌘ + ⌥ + ⇧ + H' : 'Ctrl + Alt + Shift + H'

  // 밝은 메뉴 막대와 어두운 메뉴 막대에 모두 맞는 단색 새싹 아이콘이다.
  const image = nativeImage.createFromPath(trayIcon)
  image.setTemplateImage(true)
  tray = new Tray(image)
  tray.setToolTip('한잔해')
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
      { label: '업데이트 확인', click: checkForUpdates },
      { type: 'separator' },
      { label: '한잔해 종료', click: () => app.quit() }
    ])
  )

  app.once('will-quit', () => {
    if (shortcutRegistered) globalShortcut.unregister(GARDEN_SHORTCUT)
    tray?.destroy()
    tray = null
  })
}
