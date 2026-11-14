import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  getGardenWindow,
  initializeGardenWindowIpc,
  isAppQuitting,
  showGardenWindow
} from './windows/gardenWindow'
import { initializeGardenControls } from './gardenControls'
import { initializeStorageIpc } from './storage/ipc'
import { initializeReminders } from './reminders/service'
import { initializeUpdates } from './updates'

let dashboardWindow: BrowserWindow | null = null

// 두 번째 실행은 같은 SQLite 파일·메뉴 막대·단축키를 겹쳐 쓰지 않도록 바로 종료하고,
// 이미 실행 중인 앱이 대시보드를 앞으로 가져온다.
const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) app.quit()
app.on('second-instance', () => showDashboard())

function createWindow(): void {
  // 앱 화면을 표시할 창을 생성한다.
  const mainWindow = new BrowserWindow({
    // 기본 1280×800(16:10). 최소 1024×700은 13인치 Mac(1440×900)에서 메뉴 막대·Dock을 빼고도 들어가는 크기다.
    // 1180px 미만에서는 대시보드가 한 열로 바뀌어 세로로 스크롤된다.
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: '한잔해',
    // macOS 기본 창 버튼은 유지하고, 제목 표시줄을 숨겨 시안의 사이드바와 맞춘다.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 24, y: 20 } }
      : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  dashboardWindow = mainWindow
  // 창을 닫으면 숨기고 메뉴 막대·Dock 아이콘으로 다시 연다. 다시 열 때 화면을 새로 불러오지 않는다.
  mainWindow.on('close', (event) => {
    if (isAppQuitting()) return
    event.preventDefault()
    // macOS 전체 화면에서 바로 숨기면 빈 검은 화면이 남으므로 전체 화면을 끝낸 뒤 숨긴다.
    if (!mainWindow.isFullScreen()) return mainWindow.hide()
    mainWindow.once('leave-full-screen', () => mainWindow.hide())
    mainWindow.setFullScreen(false)
  })
  mainWindow.on('closed', () => {
    if (dashboardWindow === mainWindow) dashboardWindow = null
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 개발 중에는 변경 사항이 바로 반영되는 개발 서버를 불러온다.
  // 배포 환경에서는 앱에 포함된 HTML 파일을 불러온다.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function showDashboard(): void {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) return createWindow()
  if (dashboardWindow.isMinimized()) dashboardWindow.restore()
  dashboardWindow.show()
  dashboardWindow.focus()
}

// Electron 초기화가 끝나고 창을 생성할 준비가 되면 실행한다.
// 일부 API는 이 시점 이후에만 사용할 수 있다.
app.whenReady().then(() => {
  if (!isPrimaryInstance) return

  // Windows에서 앱을 식별할 ID를 설정한다.
  electronApp.setAppUserModelId('com.heozip.hanzanhae')

  // 개발 중에는 F12로 개발자 도구를 열고 닫을 수 있도록 한다.
  // 배포 환경에서는 Command 또는 Control + R 새로고침을 무시한다.
  // 참고: https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initializeStorageIpc(() => dashboardWindow, getGardenWindow)
  initializeGardenWindowIpc(() => dashboardWindow)
  createWindow()
  showGardenWindow()
  initializeGardenControls(showDashboard, initializeUpdates())
  initializeReminders(() => dashboardWindow, showDashboard)

  app.on('activate', function () {
    // 정원 창이 남아 있어도 Dock 아이콘으로 닫힌 대시보드를 다시 연다.
    showDashboard()
    showGardenWindow()
  })
})

// macOS를 제외한 운영체제에서는 모든 창이 닫히면 앱을 종료한다.
// macOS에서는 사용자가 Cmd + Q로 종료할 때까지 앱을 유지한다.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 앱에 필요한 메인 프로세스 코드를 이곳에 추가하거나 별도 파일로 분리할 수 있다.
