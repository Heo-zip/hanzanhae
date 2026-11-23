/* eslint-disable @typescript-eslint/explicit-function-return-type -- 측정 스크립트는 JavaScript다. */
// 한잔해 애니메이션 성능 측정. 임시 기록 폴더·가짜 카메라로 빌드된 앱을 띄우고 CDP로 프레임을 잰다.
// 실제 기록 폴더와 카메라는 쓰지 않으며, 끝나면 임시 폴더를 지운다.
// 사용: npm run build && npm run perf:animations [-- 이름]   (PERF_MS=측정 ms, 기본 20000)
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repo = process.cwd()
const label = process.argv[2] ?? 'run'
const MS = Number(process.env.PERF_MS ?? 20000)
const PORT = 9339
const electron = join(repo, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
const userData = mkdtempSync(join(tmpdir(), 'hanzanhae-perf-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const child = spawn(
  electron,
  [join(import.meta.dirname, 'main.cjs'), `--remote-debugging-port=${PORT}`],
  {
    env: {
      ...process.env,
      PERF_USERDATA: userData,
      PERF_APP_MAIN: join(repo, 'out/main/index.js')
    },
    stdio: 'ignore'
  }
)

async function targets() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const pages = list.filter((t) => t.type === 'page')
      if (
        pages.some((t) => t.url.includes('view=garden')) &&
        pages.some((t) => !t.url.includes('view=garden'))
      )
        return pages
    } catch {
      // 앱이 아직 디버깅 포트를 열지 않았다.
    }
    await sleep(500)
  }
  throw new Error('창을 찾지 못했어요')
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const waiting = new Map()
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg)
      waiting.delete(msg.id)
    }
  }
  const ready = new Promise((r) => (ws.onopen = r))
  const evaluate = async (expression) => {
    await ready
    const msgId = ++id
    ws.send(
      JSON.stringify({
        id: msgId,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true }
      })
    )
    const msg = await new Promise((r) => waiting.set(msgId, r))
    if (msg.result?.exceptionDetails)
      throw new Error(JSON.stringify(msg.result.exceptionDetails).slice(0, 300))
    return msg.result?.result?.value
  }
  const send = async (method, params = {}) => {
    await ready
    const msgId = ++id
    ws.send(JSON.stringify({ id: msgId, method, params }))
    return new Promise((r) => waiting.set(msgId, r))
  }
  return { evaluate, send, close: () => ws.close() }
}

// 화면 갱신(rAF) 간격과 50ms 넘는 긴 작업을 함께 잰다.
const measure = (ms) => `(async () => {
  const d = []; const lt = [];
  const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) lt.push(e.duration) });
  po.observe({ type: 'longtask', buffered: false });
  let last = performance.now(); const end = last + ${ms};
  await new Promise((res) => { const f = (t) => { d.push(t - last); last = t; t < end ? requestAnimationFrame(f) : res() }; requestAnimationFrame(f) });
  po.disconnect();
  d.shift();
  // 창이 가려져 한 장도 그리지 않으면 통계를 낼 수 없다.
  if (!d.length) return { fps: 0, median: 0, p95: 0, max: Infinity, jank50: 0, jank100: 0, dropped: 0, droppedPct: 100, longTasks: lt.length, longTaskAvg: 0, longTaskMax: 0 };
  const s = [...d].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  const base = q(0.5);
  const dropped = d.reduce((n, x) => n + Math.max(0, Math.round(x / base) - 1), 0);
  return { fps: +(d.length / (${ms} / 1000)).toFixed(1), median: +base.toFixed(1), p95: +q(0.95).toFixed(1), max: +s.at(-1).toFixed(1),
    jank50: d.filter((x) => x > 50).length, jank100: d.filter((x) => x > 100).length, dropped,
    droppedPct: +(100 * dropped / (d.length + dropped)).toFixed(1),
    longTasks: lt.length, longTaskAvg: lt.length ? +(lt.reduce((a, b) => a + b, 0) / lt.length).toFixed(0) : 0,
    longTaskMax: lt.length ? +Math.max(...lt).toFixed(0) : 0 };
})()`

// 측정 구간 동안 앱 프로세스들이 쓴 CPU 시간으로 평균 사용률을 구한다(코어 1개 = 100%).
function cpuTimes() {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss=,time=,command='])
    .toString()
    .trim()
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .map(([pid, ppid, rss, time, ...cmd]) => {
      const parts = time.split(':').map(Number)
      const seconds = parts.reduce((total, part) => total * 60 + part, 0)
      return { pid: +pid, ppid: +ppid, rss: +rss, seconds, cmd: cmd.join(' ') }
    })
  const ids = new Set([child.pid])
  let grew = true
  while (grew) {
    grew = false
    for (const r of rows)
      if (!ids.has(r.pid) && ids.has(r.ppid)) {
        ids.add(r.pid)
        grew = true
      }
  }
  const mine = rows.filter((r) => ids.has(r.pid))
  const sum = (re) => mine.filter((r) => re.test(r.cmd)).reduce((a, r) => a + r.seconds, 0)
  return {
    at: Date.now(),
    total: mine.reduce((a, r) => a + r.seconds, 0),
    renderer: sum(/--type=renderer/),
    gpu: sum(/--type=gpu-process/),
    memMB: Math.round(mine.reduce((a, r) => a + r.rss, 0) / 1024)
  }
}
function cpuBetween(start, end) {
  const seconds = (end.at - start.at) / 1000
  const pct = (key) => +((100 * (end[key] - start[key])) / seconds).toFixed(1)
  return { total: pct('total'), renderer: pct('renderer'), gpu: pct('gpu'), memMB: end.memMB }
}
async function measureBoth(dash, garden) {
  const start = cpuTimes()
  const [dashboard, gardenResult] = await Promise.all([
    dash.evaluate(measure(MS)),
    garden.evaluate(measure(MS))
  ])
  return { dashboard, garden: gardenResult, cpu: cpuBetween(start, cpuTimes()) }
}

const results = {}
try {
  let pages = await targets()
  let dash = connect(pages.find((t) => !t.url.includes('view=garden')).webSocketDebuggerUrl)
  let garden = connect(pages.find((t) => t.url.includes('view=garden')).webSocketDebuggerUrl)
  // 첫 설정: 목표 8회, 텀블러 500ml
  await dash.evaluate(
    `window.hanzanhae.completeSetup({ requestId: crypto.randomUUID(), goalCount: 8, cupMl: 500 }).then(r => r.ok)`
  )
  await dash.evaluate('location.reload(); true')
  await sleep(3000)
  pages = await targets()
  dash.close()
  dash = connect(pages.find((t) => !t.url.includes('view=garden')).webSocketDebuggerUrl)
  await dash.evaluate(
    `document.querySelector('[aria-label="오늘로 이동"]')?.click(); !!document.querySelector('.hero')`
  )
  await sleep(2000)

  // 창이 가려져 화면 갱신이 멈춘 상태를 재지 않도록 앞으로 가져오고 안정될 때까지 기다린다.
  const warm = async () => {
    await dash.send('Page.bringToFront')
    for (let i = 0; i < 10; i++) {
      const w = await dash.evaluate(measure(1000))
      if (w.max < 200 && w.fps > 30) return true
      await dash.send('Page.bringToFront')
    }
    return false
  }
  results.warmOff = await warm()
  // 1) 카메라 끔: 대시보드와 정원을 동시에 잰다.
  results.cameraOff = await measureBoth(dash, garden)

  // 2) 카메라 켬: 설정에서 켜고 모델이 준비될 때까지 기다린 뒤 오늘 화면에서 잰다.
  await dash.evaluate(
    `[...document.querySelectorAll('nav button')].find(b => b.textContent.includes('설정')).click(); true`
  )
  await sleep(800)
  const toggled = await dash.evaluate(
    `(() => { const s = document.querySelector('[aria-label="카메라 감지"]'); s?.click(); return !!s })()`
  )
  let on = false
  for (let i = 0; i < 60 && !on; i++) {
    await sleep(500)
    on = await dash.evaluate(
      `!!document.querySelector('.camera-active') && !document.querySelector('.camera-active').textContent.includes('준비')`
    )
  }
  results.cameraStarted = { toggled, on }
  await dash.evaluate(`document.querySelector('[aria-label="오늘로 이동"]').click(); true`)
  await sleep(3000)
  results.warmOn = await warm()
  results.cameraOn = await measureBoth(dash, garden)
  results.cameraAfter = await dash.evaluate(
    `({ active: document.querySelector('.camera-active')?.textContent ?? null, error: [...document.querySelectorAll('[role=alert], .camera-toast.error')].map(e => e.textContent).join(' | ') })`
  )
  dash.close()
  garden.close()
} catch (error) {
  results.error = String(error)
} finally {
  child.kill('SIGTERM')
  await sleep(1500)
  if (!child.killed) child.kill('SIGKILL')
  const files = existsSync(userData) ? readdirSync(userData).length : 0
  rmSync(userData, { recursive: true, force: true })
  results.cleanup = { userDataFiles: files, removed: !existsSync(userData) }
  console.log(JSON.stringify({ label, ms: MS, ...results }, null, 1))
  // 배포 빌드의 카메라 분석(Worker)이 실제로 돌았는지 확인한다. 실패하면 종료 코드 1.
  const cameraBroken =
    results.error ||
    // 맥이 바쁘면 준비가 30초를 넘길 수 있어, 측정을 마친 시점에 카메라가 돌고 있는지로 판단한다.
    !results.cameraAfter?.active?.includes('사용 중') ||
    results.cameraAfter?.error
  if (cameraBroken) {
    console.error(
      '카메라 분석 확인 실패: 위 결과의 cameraStarted·cameraAfter·error를 확인해 주세요.'
    )
    process.exitCode = 1
  }
}
