import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

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

// Electron 초기화가 끝나고 창을 생성할 준비가 되면 실행한다.
// 일부 API는 이 시점 이후에만 사용할 수 있다.
app.whenReady().then(() => {
  // Windows에서 앱을 식별할 ID를 설정한다.
  electronApp.setAppUserModelId('com.heozip.hanzanhae')

  // 개발 중에는 F12로 개발자 도구를 열고 닫을 수 있도록 한다.
  // 배포 환경에서는 Command 또는 Control + R 새로고침을 무시한다.
  // 참고: https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // macOS에서 열린 창이 없을 때 Dock 아이콘을 누르면 창을 다시 연다.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
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
