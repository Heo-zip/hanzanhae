import { contextBridge, ipcRenderer } from 'electron'
import type {
  SetupInput,
  SettingsInput,
  RecordCupInput,
  CancelWaterInput,
  GardenSettingsChange
} from '../shared/appState'

// 정원 창에 필요한 클릭 통과와 드래그 기능만 공개한다. 원시 IPC는 노출하지 않는다.
contextBridge.exposeInMainWorld('gardenWindow', {
  setMousePassthrough(ignore: boolean): void {
    if (typeof ignore === 'boolean') ipcRenderer.send('garden:set-mouse-passthrough', ignore)
  },
  onDragCancelled: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('garden:drag-cancelled', listener)
    return () => ipcRenderer.removeListener('garden:drag-cancelled', listener)
  },
  cancelDrag: () => ipcRenderer.send('garden:drag-cancel'),
  beginDrag: (point: { x: number; y: number }) => ipcRenderer.send('garden:drag-start', point),
  moveDrag: (point: { x: number; y: number }) => ipcRenderer.send('garden:drag-move', point),
  endDrag: (point: { x: number; y: number }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('garden:drag-end', point)
})

contextBridge.exposeInMainWorld('hanzanhae', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  getGardenSettings: () => ipcRenderer.invoke('garden:get-settings'),
  onGardenSettingsChanged: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('garden:settings-changed', listener)
    return () => ipcRenderer.removeListener('garden:settings-changed', listener)
  },
  updateGardenSettings: (change: GardenSettingsChange) =>
    ipcRenderer.invoke('garden:update-settings', change),
  getStatistics: () => ipcRenderer.invoke('app:get-statistics'),
  completeSetup: (input: SetupInput) => ipcRenderer.invoke('app:complete-setup', input),
  updateSettings: (input: SettingsInput) => ipcRenderer.invoke('app:update-settings', input),
  recordCup: (input: RecordCupInput) => ipcRenderer.invoke('app:record-cup', input),
  cancelWater: (input: CancelWaterInput) => ipcRenderer.invoke('app:cancel-water', input),
  onWaterRecorded: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('app:water-recorded', listener)
    return () => ipcRenderer.removeListener('app:water-recorded', listener)
  },
  onStateChanged: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('app:state-changed', listener)
    return () => ipcRenderer.removeListener('app:state-changed', listener)
  }
})
