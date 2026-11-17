/* eslint-disable @typescript-eslint/no-require-imports -- Electron 진입점은 CommonJS로 빌드된 앱을 불러온다. */
// 측정 전용 진입점: 기록 폴더를 임시 폴더로 바꾸고 가짜 카메라를 쓴 뒤 빌드된 앱을 불러온다.
const { app } = require('electron')
if (!process.env.PERF_USERDATA) throw new Error('PERF_USERDATA 필요')
app.setPath('userData', process.env.PERF_USERDATA)
app.commandLine.appendSwitch('use-fake-device-for-media-stream')
app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
require(process.env.PERF_APP_MAIN)
