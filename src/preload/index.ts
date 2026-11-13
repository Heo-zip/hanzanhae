import { contextBridge, ipcRenderer } from 'electron'
import type { SetupInput, SettingsInput, RecordCupInput } from '../shared/appState'

// 투명한 정원 창의 클릭 통과 여부만 요청한다. 원시 IPC는 화면에 노출하지 않는다.
contextBridge.exposeInMainWorld('gardenWindow', {
  setMousePassthrough(ignore: boolean): void {
    if (typeof ignore === 'boolean') ipcRenderer.send('garden:set-mouse-passthrough', ignore)
  }
})

contextBridge.exposeInMainWorld('hanzanhae', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  completeSetup: (input: SetupInput) => ipcRenderer.invoke('app:complete-setup', input),
  updateSettings: (input: SettingsInput) => ipcRenderer.invoke('app:update-settings', input),
  recordCup: (input: RecordCupInput) => ipcRenderer.invoke('app:record-cup', input),
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
