import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let gardenWindow: BrowserWindow | null = null
let isQuitting = false

export const GARDEN_SHORTCUT = 'CommandOrControl+Alt+Shift+H'

export function getGardenWindow(): BrowserWindow | null {
  return gardenWindow
}

app.on('before-quit', () => {
  isQuitting = true
})

// 메뉴의 종료·Cmd+Q처럼 앱을 끄는 중인지 알려준다. 그 외의 창 닫기는 숨기기로 처리한다.
export function isAppQuitting(): boolean {
  return isQuitting
}

export function hideGardenWindow(): void {
  gardenWindow?.hide()
}

export function toggleGardenWindow(): void {
  if (gardenWindow?.isVisible()) hideGardenWindow()
  else showGardenWindow()
}

// 정원 창의 투명한 부분은 아래의 앱을 클릭할 수 있게 한다.
ipcMain.on('garden:set-mouse-passthrough', (event, ignore: unknown) => {
  if (
    !gardenWindow ||
    event.sender !== gardenWindow.webContents ||
    event.senderFrame !== event.sender.mainFrame ||
    typeof ignore !== 'boolean' ||
    (process.platform !== 'darwin' && process.platform !== 'win32')
  ) {
    return
  }

  gardenWindow.setIgnoreMouseEvents(ignore, { forward: true })
})

export function showGardenWindow(): void {
  if (gardenWindow && !gardenWindow.isDestroyed()) {
    // 다른 앱에서 입력하던 키보드 포커스는 그대로 둔다.
    gardenWindow.showInactive()
    return
  }

  // 작업 영역은 메뉴 막대와 Dock을 제외한 화면이다.
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea
  const windowWidth = 160
  const windowHeight = 220

  gardenWindow = new BrowserWindow({
    x: Math.round(x + Math.max(0, width - windowWidth - 8)),
    y: Math.round(y + Math.max(0, height - windowHeight)),
    width: windowWidth,
    height: windowHeight,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: '한잔해 정원',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const window = gardenWindow
  // 일반 앱 위에 두되, Dock 아이콘과 앱 이름은 정원보다 앞에 표시한다.
  window.setAlwaysOnTop(true, 'floating')
  if (process.platform === 'darwin') {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
  // 마우스 움직임은 화면에 전달해 화분에 올렸을 때 다시 클릭을 받을 수 있다.
  if (process.platform === 'darwin' || process.platform === 'win32') {
    window.setIgnoreMouseEvents(true, { forward: true })
  }
  window.on('ready-to-show', () => window.showInactive())
  window.webContents.on('context-menu', () => {
    Menu.buildFromTemplate([{ label: '정원 숨기기', click: hideGardenWindow }]).popup({ window })
  })
  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      hideGardenWindow()
    }
  })

  // Dock 설정이나 연결 화면이 바뀌면 작업 영역에 다시 맞춘다.
  // 숨긴 창을 다시 띄우지는 않으며, Dock의 확대 애니메이션을 추적하지 않는다.
  const reposition = (): void => {
    const { workArea } = screen.getDisplayMatching(window.getBounds())
    window.setPosition(
      Math.round(workArea.x + Math.max(0, workArea.width - windowWidth - 8)),
      Math.round(workArea.y + Math.max(0, workArea.height - windowHeight))
    )
  }
  screen.on('display-metrics-changed', reposition)
  screen.on('display-removed', reposition)
  window.on('closed', () => {
    screen.removeListener('display-metrics-changed', reposition)
    screen.removeListener('display-removed', reposition)
    if (gardenWindow === window) gardenWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    url.searchParams.set('view', 'garden')
    void window.loadURL(url.toString())
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { view: 'garden' }
    })
  }
}
