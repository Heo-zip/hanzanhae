import { useCallback, useEffect, useRef, useState } from 'react'
import { permissionSettingsHint } from '../../../../shared/platform'
import wasmLoader from '../../../../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js?url'
import wasmBinary from '../../../../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm?url'
import objectModel from '../../assets/models/efficientdet_lite0.tflite?url'
import faceMeshModel from '../../assets/models/face_landmarker.task?url'
import poseModel from '../../assets/models/pose_landmarker_lite.task?url'
import { countsAsContainer } from './drinkDetection'
import {
  EMPTY_OVERLAY,
  type AnalysisResult,
  type AnalyzerAssets,
  type DetectionStatus,
  type Overlay
} from './cameraAnalyzer'
import type { WorkerRequest, WorkerResponse } from './cameraWorker'
import CameraWorker from './cameraWorker?worker&inline'

export type CameraStatus = 'off' | 'starting' | 'on'
export type CameraControl = {
  status: CameraStatus
  message: string
  sipCount: number
  detectionStatus: DetectionStatus | null
  start: () => Promise<void>
  stop: () => void
  setPreview: (canvas: HTMLCanvasElement | null) => void
}

/** 영상 한 장을 분석한다. 이전 분석이 끝나기 전에는 새 장을 받지 않는다(null). */
type Runner = {
  analyze: (video: HTMLVideoElement) => Promise<AnalysisResult | null>
  close: () => void
}

type Resources = {
  stream?: MediaStream
  runner?: Runner
  timer?: number
  frame?: number
  video?: HTMLVideoElement
}

/** 미리보기에 얼굴(초록)·용기(파랑)·손목과 손끝(보라)·입(빨강)을 거울처럼 그린다. */
function drawPreview(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  { face, objects, handPoints, mouth, zoomRegions }: Overlay
): void {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) return
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const context = canvas.getContext('2d')
  if (!context) return
  context.save()
  context.translate(width, 0)
  context.scale(-1, 1)
  context.drawImage(video, 0, 0, width, height)
  context.restore()
  context.lineWidth = 3
  context.font = 'bold 16px sans-serif'

  if (face) {
    context.strokeStyle = '#61d790'
    context.strokeRect(
      (1 - face.x - face.width) * width,
      face.y * height,
      face.width * width,
      face.height * height
    )
  }
  // 손 주변 확대 영역(점선)
  context.save()
  context.setLineDash([6, 6])
  context.lineWidth = 2
  context.strokeStyle = '#b98cff'
  for (const region of zoomRegions)
    context.strokeRect(
      (1 - region.x - region.width) * width,
      region.y * height,
      region.width * width,
      region.height * height
    )
  context.restore()
  for (const object of objects) {
    const box = object.boundingBox
    if (!box) continue
    const x = width - box.originX - box.width
    const category = object.categories[0]
    // 점수가 낮아 판정에 쓰지 않는 상자는 회색으로 그린다.
    const ignored = !countsAsContainer(category, Boolean(object.zoomed))
    context.strokeStyle = ignored ? '#9aa5ad' : '#77c7ff'
    context.strokeRect(x, box.originY, box.width, box.height)
    const label =
      (category?.categoryName === 'bottle' ? '물병' : '컵') +
      (object.zoomed ? '(확대)' : '') +
      (ignored ? '·무시' : '')
    const score = Math.round((category?.score ?? 0) * 100)
    const text = `${label} ${score}%`
    context.fillStyle = '#0d2935'
    context.fillRect(x, Math.max(0, box.originY - 25), context.measureText(text).width + 12, 25)
    context.fillStyle = ignored ? '#c7cfd4' : '#fff'
    context.fillText(text, x + 6, Math.max(18, box.originY - 7))
  }
  for (const [color, points] of [
    ['#b98cff', handPoints],
    ['#ff6b6b', mouth ? [mouth] : []]
  ] as const) {
    context.fillStyle = color
    for (const point of points) {
      context.beginPath()
      context.arc((1 - point.x) * width, point.y * height, 6, 0, Math.PI * 2)
      context.fill()
    }
  }
}

function localAsset(asset: string): string {
  const url = new URL(asset, window.location.href)
  if (url.protocol !== 'file:') return url.href
  return `hanzanhae-assets://app/${url.pathname.split('/').at(-1)}`
}

function release(resources: Resources): void {
  if (resources.timer !== undefined) window.clearInterval(resources.timer)
  if (resources.frame !== undefined) cancelAnimationFrame(resources.frame)
  resources.stream?.getTracks().forEach((track) => track.stop())
  if (resources.video) resources.video.srcObject = null
  resources.runner?.close()
}

/** 배포 앱: Worker에서 분석한다. 화면 쪽은 영상 한 장을 복사해 넘기기만 한다. */
async function workerRunner(assets: AnalyzerAssets): Promise<Runner> {
  const worker = new CameraWorker()
  let pending: ((response: WorkerResponse) => void) | null = null
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const resolve = pending
    pending = null
    resolve?.(event.data)
  }
  const request = (
    message: WorkerRequest,
    transfer: Transferable[] = []
  ): Promise<WorkerResponse> =>
    new Promise((resolve, reject) => {
      pending = resolve
      worker.onerror = (event) => reject(new Error(event.message))
      worker.postMessage(message, transfer)
    })
  try {
    const ready = await request({ type: 'init', assets })
    if (ready.type === 'error') throw new Error(ready.message)
  } catch (error) {
    worker.terminate()
    throw error
  }
  let busy = false
  return {
    analyze: async (video) => {
      if (busy) return null
      busy = true
      try {
        const image = await createImageBitmap(video)
        const response = await request({ type: 'frame', image }, [image])
        if (response.type === 'error') throw new Error(response.message)
        return response.type === 'result' ? response.result : null
      } finally {
        busy = false
      }
    },
    close: () => worker.terminate()
  }
}

/** 개발 모드: Vite 개발 서버의 Worker는 모듈 방식이라 MediaPipe를 불러올 수 없어 화면 쪽에서 분석한다. */
async function inlineRunner(
  assets: AnalyzerAssets,
  isCancelled: () => boolean
): Promise<Runner | null> {
  const { createAnalyzer } = await import('./cameraAnalyzer')
  const analyzer = await createAnalyzer(assets, isCancelled)
  if (!analyzer) return null
  return {
    analyze: async (video) => analyzer.analyze(video, video.videoWidth, video.videoHeight),
    close: analyzer.close
  }
}

export function useCameraDetection(hasGoal: boolean, onSip: () => void): CameraControl {
  const [status, setStatus] = useState<CameraStatus>('off')
  const [message, setMessage] = useState('')
  const [sipCount, setSipCount] = useState(0)
  const [detectionStatus, setDetectionStatus] = useState<DetectionStatus | null>(null)
  const resources = useRef<Resources>({})
  const generation = useRef(0)
  const starting = useRef(false)
  const active = useRef(false)
  const preview = useRef<HTMLCanvasElement | null>(null)
  // 감지 타이머는 시작할 때 한 번 만들어지므로 최신 콜백을 ref로 읽는다.
  const sipHandler = useRef(onSip)
  useEffect(() => {
    sipHandler.current = onSip
  }, [onSip])
  const setPreview = useCallback((canvas: HTMLCanvasElement | null): void => {
    preview.current = canvas
  }, [])

  const stop = useCallback((): void => {
    generation.current += 1
    active.current = false
    starting.current = false
    const previous = resources.current
    resources.current = {}
    release(previous)
    setStatus('off')
    setDetectionStatus(null)
    setSipCount(0)
    setMessage('')
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!hasGoal) void Promise.resolve().then(() => !cancelled && stop())
    return () => {
      cancelled = true
    }
  }, [hasGoal, stop])

  // 카메라가 켜진 동안만 창이 숨겨져도 분석이 느려지지 않게 메인 프로세스에 알린다.
  useEffect(() => {
    window.hanzanhae.setCameraActive(status === 'on')
    return () => window.hanzanhae.setCameraActive(false)
  }, [status])

  useEffect(() => {
    return () => {
      generation.current += 1
      active.current = false
      release(resources.current)
      resources.current = {}
    }
  }, [])

  const start = useCallback(async (): Promise<void> => {
    if (!hasGoal || active.current || starting.current) return
    starting.current = true
    const current = ++generation.current
    const local: Resources = {}
    setStatus('starting')
    setSipCount(0)
    setMessage('')
    const isCancelled = (): boolean => current !== generation.current
    try {
      // 모델과 실행 파일은 앱 안에서 불러오며 카메라 영상을 저장하거나 전송하지 않는다.
      const assets: AnalyzerAssets = {
        wasmLoaderPath: localAsset(wasmLoader),
        wasmBinaryPath: localAsset(wasmBinary),
        objectModel: localAsset(objectModel),
        faceMeshModel: localAsset(faceMeshModel),
        poseModel: localAsset(poseModel)
      }
      const runner = import.meta.env.DEV
        ? await inlineRunner(assets, isCancelled)
        : await workerRunner(assets)
      if (!runner) return
      local.runner = runner
      if (isCancelled()) return
      local.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }
      })
      if (isCancelled()) return
      local.video = document.createElement('video')
      local.video.muted = true
      local.video.playsInline = true
      local.video.srcObject = local.stream
      await local.video.play()
      if (isCancelled()) return
      const video = local.video
      let lastTime = -1
      let overlay = EMPTY_OVERLAY
      local.stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (current !== generation.current) return
          stop()
          setMessage('카메라가 연결 해제됐어요. 다시 켜 주세요.')
        })
      })
      const fail = (): void => {
        if (current !== generation.current) return
        stop()
        setMessage('카메라를 분석하지 못했어요. 다시 켜 주세요.')
      }
      local.timer = window.setInterval(() => {
        if (video.readyState < 2 || video.currentTime === lastTime) return
        lastTime = video.currentTime
        runner
          .analyze(video)
          .then((result) => {
            if (!result || current !== generation.current) return
            if (preview.current) {
              const next = result.status
              setDetectionStatus((previous) =>
                previous &&
                (Object.keys(next) as (keyof DetectionStatus)[]).every(
                  (key) => JSON.stringify(previous[key]) === JSON.stringify(next[key])
                )
                  ? previous
                  : next
              )
              overlay = result.overlay
            }
            // 감지 결과만 넘기고, 저장·실패 안내는 기록 쪽에서 맡는다. 영상 정보는 넘기지 않는다.
            if (result.fired) {
              setSipCount((count) => count + 1)
              sipHandler.current()
            }
          })
          .catch(fail)
      }, 250)
      // 분석은 0.25초마다 하고, 영상은 화면 갱신마다 그려 부드럽게 보이게 한다. 창이 가려지면 브라우저가 그리기를 멈춘다.
      const paint = (): void => {
        if (preview.current && video.readyState >= 2) drawPreview(preview.current, video, overlay)
        local.frame = requestAnimationFrame(paint)
      }
      local.frame = requestAnimationFrame(paint)
      resources.current = local
      active.current = true
      starting.current = false
      setStatus('on')
    } catch (error) {
      if (isCancelled()) return
      console.error('카메라 시작 실패:', error)
      const name = error instanceof Error ? error.name : ''
      setStatus('off')
      setMessage(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? `카메라 접근이 거부됐어요. ${permissionSettingsHint(window.hanzanhae?.platform ?? 'darwin', '카메라')}에서 한잔해 카메라 권한을 확인해 주세요.`
          : name === 'NotFoundError'
            ? '연결된 카메라를 찾지 못했어요.'
            : '카메라를 시작하지 못했어요. 카메라 연결과 권한을 확인해 주세요.'
      )
    } finally {
      if (isCancelled() || !active.current) release(local)
      if (current === generation.current) starting.current = false
    }
  }, [hasGoal, stop])

  return {
    status,
    message,
    sipCount,
    detectionStatus,
    start,
    stop,
    setPreview
  }
}
