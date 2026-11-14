import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type {
  GardenSettings,
  GardenSettingsChange,
  GardenSettingsResult
} from '../../shared/appState'
import { getDatabase, trusted } from '../storage/ipc'
import { GARDEN_SIZE, presetPosition, restorePosition, type Point } from './gardenPosition'

let gardenWindow: BrowserWindow | null = null
let isQuitting = false
let drag: { start: Point; original: Point; moved: boolean } | null = null

function screenLayout(): { displays: ReturnType<typeof screen.getAllDisplays>; primaryId: number } {
  return { displays: screen.getAllDisplays(), primaryId: screen.getPrimaryDisplay().id }
}

function getPosition(window: BrowserWindow): Point {
  const [x, y] = window.getPosition()
  return { x, y }
}

function applyPosition(window: BrowserWindow, point: Point): void {
  window.setPosition(Math.round(point.x), Math.round(point.y))
}

function fromGarden(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  return (
    !!gardenWindow &&
    !gardenWindow.isDestroyed() &&
    event.sender === gardenWindow.webContents &&
    trusted(event)
  )
}

function validPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false
  const point = value as Point
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Math.abs(point.x) <= 10_000_000 &&
    Math.abs(point.y) <= 10_000_000
  )
}

function moveDrag(point: Point): void {
  if (!drag || !gardenWindow || gardenWindow.isDestroyed()) return
  const { displays, primaryId } = screenLayout()
  const next = {
    x: drag.original.x + point.x - drag.start.x,
    y: drag.original.y + point.y - drag.start.y
  }
  applyPosition(gardenWindow, restorePosition(next, 'dock', displays, primaryId))
  drag.moved = true
}

function defaultSettings(): GardenSettings {
  return { placement: 'dock', alwaysOnTop: true, x: null, y: null }
}

export function initializeGardenWindowIpc(getDashboard: () => BrowserWindow | null): void {
  ipcMain.handle('garden:get-settings', (event): GardenSettingsResult => {
    if (!trusted(event) || event.sender !== getDashboard()?.webContents)
      return { ok: false, code: 'VALIDATION_ERROR' }
    try {
      return { ok: true, settings: getDatabase().readGardenSettings() }
    } catch {
      return { ok: false, code: 'STORAGE_ERROR' }
    }
  })
  ipcMain.handle(
    'garden:update-settings',
    (event, change: GardenSettingsChange): GardenSettingsResult => {
      if (
        !trusted(event) ||
        event.sender !== getDashboard()?.webContents ||
        !change ||
        typeof change !== 'object' ||
        (change.kind === 'placement'
          ? !['dock', 'floor'].includes(change.placement)
          : change.kind === 'alwaysOnTop'
            ? typeof change.alwaysOnTop !== 'boolean'
            : true)
      )
        return { ok: false, code: 'VALIDATION_ERROR' }
      const window = gardenWindow
      if (!window || window.isDestroyed() || drag) return { ok: false, code: 'STORAGE_ERROR' }
      const originalPosition = getPosition(window)
      const originalTop = window.isAlwaysOnTop()
      try {
        const previous = getDatabase().readGardenSettings()
        const next: GardenSettings = { ...previous }
        if (change.kind === 'placement') {
          const { displays, primaryId } = screenLayout()
          const point = presetPosition(originalPosition, change.placement, displays, primaryId)
          applyPosition(window, point)
          const actual = getPosition(window)
          Object.assign(next, { placement: change.placement, ...actual })
        } else {
          window.setAlwaysOnTop(change.alwaysOnTop, change.alwaysOnTop ? 'floating' : undefined)
          next.alwaysOnTop = change.alwaysOnTop
        }
        return { ok: true, settings: getDatabase().saveGardenSettings(next) }
      } catch {
        try {
          applyPosition(window, originalPosition)
          window.setAlwaysOnTop(originalTop, originalTop ? 'floating' : undefined)
        } catch {
          /* 창이 닫혔을 수 있다. */
        }
        return { ok: false, code: 'STORAGE_ERROR' }
      }
    }
  )
  ipcMain.on('garden:drag-start', (event, point: unknown) => {
    if (!fromGarden(event) || !validPoint(point) || !gardenWindow || drag) return
    drag = { start: point, original: getPosition(gardenWindow), moved: false }
  })
  ipcMain.on('garden:drag-move', (event, point: unknown) => {
    if (!fromGarden(event) || !validPoint(point)) return
    try {
      moveDrag(point)
    } catch {
      // 화면 구성이 바뀌는 중이면 다음 포인터 이벤트에서 다시 계산한다.
    }
  })
  ipcMain.on('garden:drag-cancel', (event) => {
    if (!fromGarden(event) || !drag || !gardenWindow || gardenWindow.isDestroyed()) return
    const original = drag.original
    drag = null
    try {
      applyPosition(gardenWindow, original)
    } catch {
      /* 창이 닫혔을 수 있다. */
    }
  })
  ipcMain.handle('garden:drag-end', (event, point: unknown): { ok: boolean } => {
    if (
      !fromGarden(event) ||
      !validPoint(point) ||
      !drag ||
      !gardenWindow ||
      gardenWindow.isDestroyed()
    )
      return { ok: false }
    const original = drag.original
    try {
      if (drag.moved) {
        moveDrag(point)
        const settings = getDatabase().readGardenSettings()
        const position = getPosition(gardenWindow)
        if (position.x !== original.x || position.y !== original.y) {
          getDatabase().saveGardenSettings({ ...settings, ...position, placement: 'custom' })
          const dashboard = getDashboard()
          if (dashboard && !dashboard.isDestroyed() && !dashboard.webContents.isDestroyed()) {
            try {
              dashboard.webContents.send('garden:settings-changed')
            } catch {
              /* 다음 조회에서 확인한다. */
            }
          }
        }
      }
      return { ok: true }
    } catch {
      try {
        applyPosition(gardenWindow, original)
      } catch {
        /* 창이 닫혔을 수 있다. */
      }
      return { ok: false }
    } finally {
      drag = null
    }
  })
}

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
    // 다른 앱의 입력 포커스와 사용자가 선택한 위치를 그대로 둔다.
    const position = getPosition(gardenWindow)
    gardenWindow.showInactive()
    // macOS가 숨긴 창을 다시 표시하며 Dock 위로 옮길 수 있다.
    applyPosition(gardenWindow, position)
    return
  }

  let settings = defaultSettings()
  try {
    settings = getDatabase().readGardenSettings()
  } catch {
    /* 저장 오류는 설정 화면에서 안내한다. */
  }
  const { displays, primaryId } = screenLayout()
  const saved = settings.x === null || settings.y === null ? null : { x: settings.x, y: settings.y }
  const initial = restorePosition(saved, settings.placement, displays, primaryId)
  const windowWidth = GARDEN_SIZE.width
  const windowHeight = GARDEN_SIZE.height

  gardenWindow = new BrowserWindow({
    x: initial.x,
    y: initial.y,
    width: windowWidth,
    height: windowHeight,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    // macOS 패널은 전체 화면 작업 공간에서도 보조 창으로 동작한다.
    type: process.platform === 'darwin' ? 'panel' : undefined,
    fullscreenable: false,
    alwaysOnTop: settings.alwaysOnTop,
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
  if (settings.alwaysOnTop) window.setAlwaysOnTop(true, 'floating')
  if (process.platform === 'darwin') {
    // 패널의 작업 공간 설정만 바꾸고 앱 전체의 Dock 표시 상태는 유지한다.
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    })
  }
  // 마우스 움직임은 화면에 전달해 화분에 올렸을 때 다시 클릭을 받을 수 있다.
  if (process.platform === 'darwin' || process.platform === 'win32') {
    window.setIgnoreMouseEvents(true, { forward: true })
  }
  // 숨기기나 렌더러 종료로 포인터 업을 받지 못하면 진행 중인 이동을 취소한다.
  const cancelActiveDrag = (): void => {
    if (!drag || window.isDestroyed()) return
    const original = drag.original
    drag = null
    try {
      applyPosition(window, original)
      if (!window.webContents.isDestroyed()) window.webContents.send('garden:drag-cancelled')
    } catch {
      /* 창이 닫혔을 수 있다. */
    }
  }
  window.on('hide', cancelActiveDrag)
  window.webContents.on('render-process-gone', cancelActiveDrag)
  window.on('ready-to-show', () => {
    window.showInactive()
    // macOS가 생성 시 Dock을 피해 좌표를 바꿀 수 있어 표시 직후 저장 위치를 다시 적용한다.
    let restored = initial
    try {
      const latest = getDatabase().readGardenSettings()
      const position = latest.x === null || latest.y === null ? null : { x: latest.x, y: latest.y }
      const layout = screenLayout()
      restored = restorePosition(position, latest.placement, layout.displays, layout.primaryId)
    } catch {
      /* 저장 오류일 때는 초기 안전 위치를 사용한다. */
    }
    applyPosition(window, restored)
  })
  window.webContents.on('context-menu', () => {
    Menu.buildFromTemplate([{ label: '정원 숨기기', click: hideGardenWindow }]).popup({ window })
  })
  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      hideGardenWindow()
    }
  })

  // 화면이 바뀌어도 사용자가 고른 위치는 유지하고 화면 밖으로 벗어날 때만 보정한다.
  const reposition = (): void => {
    if (drag || window.isDestroyed()) return
    try {
      const { displays, primaryId } = screenLayout()
      const current = getPosition(window)
      const next = restorePosition(current, settings.placement, displays, primaryId)
      if (next.x === current.x && next.y === current.y) return
      applyPosition(window, next)
      try {
        getDatabase().saveGardenSettings({
          ...getDatabase().readGardenSettings(),
          ...getPosition(window)
        })
      } catch {
        // 저장 실패 시 다음 실행에서도 화면 안으로 보정한다.
      }
    } catch {
      // 화면이 전환 중이면 다음 화면 변경이나 앱 시작 시 다시 보정한다.
    }
  }
  screen.on('display-metrics-changed', reposition)
  screen.on('display-removed', reposition)
  window.on('closed', () => {
    screen.removeListener('display-metrics-changed', reposition)
    screen.removeListener('display-removed', reposition)
    drag = null
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
