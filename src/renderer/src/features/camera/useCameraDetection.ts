import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FaceLandmarker,
  ObjectDetector,
  PoseLandmarker,
  type Detection
} from '@mediapipe/tasks-vision'
import wasmLoader from '../../../../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js?url'
import wasmBinary from '../../../../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm?url'
import objectModel from '../../assets/models/efficientdet_lite0.tflite?url'
import faceMeshModel from '../../assets/models/face_landmarker.task?url'
import poseModel from '../../assets/models/pose_landmarker_lite.task?url'
import {
  ContainerHold,
  FaceCover,
  SipDetector,
  handZoomRegions,
  mouthShape,
  MouthShapeMeter,
  countsAsContainer,
  headPitchUp,
  isHandAtMouth,
  poseHead,
  type Box,
  type HeadSource,
  type HoldSource,
  type MouthShape,
  type Point,
  type SipPhase
} from './drinkDetection'

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

type DetectionStatus = {
  lift: number | null
  poseLift: number | null
  headSource: HeadSource
  handAtMouth: boolean | null
  held: boolean
  holdSource: HoldSource | null
  sipPhase: SipPhase
  /** 지금 마시는 동작을 빨대(입 오므림)로 판단했는지 */
  straw: boolean
  /** 빨대 판정 기준을 조정할 때 보는 입 모양 측정값(0~1, 소수 둘째 자리) */
  mouth: MouthShape | null
  mouthPeak: MouthShape | null
}

type Resources = {
  stream?: MediaStream
  objects?: ObjectDetector
  zoomObjects?: ObjectDetector
  faceMesh?: FaceLandmarker
  pose?: PoseLandmarker
  timer?: number
  frame?: number
  video?: HTMLVideoElement
}

/** 마지막 분석 결과. 미리보기는 매 화면마다 영상 위에 이것을 겹쳐 그린다. */
type Overlay = {
  face: Box | null
  objects: (Detection & { zoomed?: boolean })[]
  handPoints: Point[]
  mouth: Point | null
  zoomRegions: Box[]
}
const EMPTY_OVERLAY: Overlay = {
  face: null,
  objects: [],
  handPoints: [],
  mouth: null,
  zoomRegions: []
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
    const ignored = !countsAsContainer(category?.score, Boolean(object.zoomed))
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

function roundShape(shape: MouthShape | null): MouthShape | null {
  return shape
    ? { pucker: Math.round(shape.pucker * 100) / 100, funnel: Math.round(shape.funnel * 100) / 100 }
    : null
}

// 손 주변 확대 이미지 크기. EfficientDet-Lite0 입력 크기와 같다.
const ZOOM_INPUT = 320

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
  resources.objects?.close()
  resources.zoomObjects?.close()
  resources.faceMesh?.close()
  resources.pose?.close()
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
      const fileset = {
        wasmLoaderPath: localAsset(wasmLoader),
        wasmBinaryPath: localAsset(wasmBinary)
      }
      local.objects = await ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: localAsset(objectModel), delegate: 'CPU' },
        runningMode: 'VIDEO',
        scoreThreshold: 0.2,
        categoryAllowlist: ['cup', 'bottle', 'wine glass'],
        maxResults: 5
      })
      if (isCancelled()) return
      // 손 주변을 잘라 크게 키운 이미지를 한 장씩 보는 검출기다. 영상 모드 검출기와 시간 기록이 섞이지 않게 따로 둔다.
      local.zoomObjects = await ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: localAsset(objectModel), delegate: 'CPU' },
        runningMode: 'IMAGE',
        scoreThreshold: 0.2,
        categoryAllowlist: ['cup', 'bottle', 'wine glass'],
        maxResults: 3
      })
      if (isCancelled()) return
      local.faceMesh = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: localAsset(faceMeshModel), delegate: 'CPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        // 고개를 돌리거나 일부가 가려져도 추적이 덜 끊기도록 기본값 0.5보다 낮춘다.
        minFacePresenceConfidence: 0.3,
        minTrackingConfidence: 0.3,
        outputFacialTransformationMatrixes: true,
        // 빨대 음용 측정을 위해 입술 오므리기 등 표정 값을 함께 받는다.
        outputFaceBlendshapes: true
      })
      if (isCancelled()) return
      local.pose = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: localAsset(poseModel), delegate: 'CPU' },
        runningMode: 'VIDEO',
        numPoses: 1
      })
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
      const objects = local.objects
      const zoomObjects = local.zoomObjects
      const zoomCanvas = document.createElement('canvas')
      zoomCanvas.width = ZOOM_INPUT
      zoomCanvas.height = ZOOM_INPUT
      const zoomContext = zoomCanvas.getContext('2d')
      const faceMesh = local.faceMesh
      const pose = local.pose
      const sipDetector = new SipDetector()
      const mouthMeter = new MouthShapeMeter()
      const containerHold = new ContainerHold()
      const faceCover = new FaceCover()
      let lastTime = -1
      let overlay = EMPTY_OVERLAY
      local.stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (current !== generation.current) return
          stop()
          setMessage('카메라가 연결 해제됐어요. 다시 켜 주세요.')
        })
      })
      local.timer = window.setInterval(() => {
        if (video.readyState < 2 || video.currentTime === lastTime) return
        lastTime = video.currentTime
        try {
          const now = performance.now()
          const aspect = video.videoWidth / video.videoHeight
          const containers = objects.detectForVideo(video, now).detections
          const boxes: Box[] = containers.flatMap((item) =>
            item.boundingBox && countsAsContainer(item.categories[0]?.score, false)
              ? [
                  {
                    x: item.boundingBox.originX / video.videoWidth,
                    y: item.boundingBox.originY / video.videoHeight,
                    width: item.boundingBox.width / video.videoWidth,
                    height: item.boundingBox.height / video.videoHeight
                  }
                ]
              : []
          )

          // 얼굴 모델: 고개 각도, 입, 얼굴 크기와 영역
          const meshResult = faceMesh.detectForVideo(video, now)
          const mouthReading = mouthMeter.observe(
            mouthShape(meshResult.faceBlendshapes?.[0]?.categories),
            now
          )
          const faceMarks = meshResult.faceLandmarks[0]
          const matrix = meshResult.facialTransformationMatrixes?.[0]?.data
          const pitch = matrix ? headPitchUp(matrix) : null
          const meshMouth =
            faceMarks?.[13] && faceMarks[14]
              ? {
                  x: (faceMarks[13].x + faceMarks[14].x) / 2,
                  y: (faceMarks[13].y + faceMarks[14].y) / 2
                }
              : null
          const faceHeight =
            faceMarks?.[10] && faceMarks[152]
              ? Math.hypot(
                  (faceMarks[152].x - faceMarks[10].x) * aspect,
                  faceMarks[152].y - faceMarks[10].y
                )
              : 0
          const faceBox: Box | null = faceMarks?.length
            ? (() => {
                const xs = faceMarks.map((mark) => mark.x)
                const ys = faceMarks.map((mark) => mark.y)
                const x = Math.min(...xs)
                const y = Math.min(...ys)
                return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
              })()
            : null

          // 자세 모델: 얼굴을 놓쳤을 때의 머리 정보와 15~22번 손목·새끼·검지·엄지
          const poseMarks = pose.detectForVideo(video, now).landmarks[0] ?? []
          const head = poseHead(poseMarks, aspect)
          const handPoints = poseMarks
            .slice(15, 23)
            .filter((point) => (point.visibility ?? 0) >= 0.5)

          // 손 주변을 잘라 320×320으로 키워 다시 찾는다. 손이 가슴 위로 올라왔을 때만 돈다.
          const zoomRegions = zoomContext ? handZoomRegions(poseMarks, aspect) : []
          const zoomed: (Detection & { zoomed: boolean })[] = []
          const zoomBoxes: Box[] = []
          for (const region of zoomRegions) {
            const sx = region.x * video.videoWidth
            const sy = region.y * video.videoHeight
            const sw = region.width * video.videoWidth
            const sh = region.height * video.videoHeight
            zoomContext!.drawImage(video, sx, sy, sw, sh, 0, 0, ZOOM_INPUT, ZOOM_INPUT)
            for (const item of zoomObjects.detect(zoomCanvas).detections) {
              const box = item.boundingBox
              if (!box) continue
              const originX = sx + (box.originX / ZOOM_INPUT) * sw
              const originY = sy + (box.originY / ZOOM_INPUT) * sh
              const boxWidth = (box.width / ZOOM_INPUT) * sw
              const boxHeight = (box.height / ZOOM_INPUT) * sh
              zoomed.push({
                ...item,
                zoomed: true,
                boundingBox: { ...box, originX, originY, width: boxWidth, height: boxHeight }
              })
              if (!countsAsContainer(item.categories[0]?.score, true)) continue
              zoomBoxes.push({
                x: originX / video.videoWidth,
                y: originY / video.videoHeight,
                width: boxWidth / video.videoWidth,
                height: boxHeight / video.videoHeight
              })
            }
          }

          const held = containerHold.observe(
            handPoints,
            boxes,
            now,
            meshMouth ?? head?.mouth ?? null,
            zoomBoxes,
            zoomRegions.length > 0
          )
          const covered =
            faceCover.observe(faceBox, handPoints, [...boxes, ...zoomBoxes], now) && held
          // 얼굴이 보이면 얼굴 모델의 입을, 놓치면 자세 모델의 입과 어깨 너비를 쓴다.
          const handAtMouth = covered
            ? true
            : meshMouth
              ? isHandAtMouth(meshMouth, faceHeight, handPoints, aspect)
              : isHandAtMouth(head?.mouth ?? null, (head?.scale ?? 0) * 0.6, handPoints, aspect)
          const sip = sipDetector.observe(
            {
              pitch,
              posePitch: head?.pitch ?? null,
              covered,
              handAtMouth,
              containerHeld: held,
              mouth: mouthReading.current
            },
            now
          )

          if (preview.current) {
            const next: DetectionStatus = {
              lift: sip.lift === null ? null : Math.round(sip.lift),
              poseLift: sip.poseLift === null ? null : Math.round(sip.poseLift * 100) / 100,
              headSource: sip.source,
              handAtMouth,
              held,
              holdSource: containerHold.source,
              sipPhase: sip.phase,
              straw: sip.straw,
              mouth: roundShape(mouthReading.current),
              mouthPeak: roundShape(mouthReading.peak)
            }
            setDetectionStatus((previous) =>
              previous &&
              (Object.keys(next) as (keyof DetectionStatus)[]).every(
                (key) => JSON.stringify(previous[key]) === JSON.stringify(next[key])
              )
                ? previous
                : next
            )
            overlay = {
              face: faceBox,
              objects: [...containers, ...zoomed],
              handPoints,
              mouth: meshMouth ?? head?.mouth ?? null,
              zoomRegions
            }
          }
          // 감지 결과만 넘기고, 저장·실패 안내는 기록 쪽에서 맡는다. 영상 정보는 넘기지 않는다.
          if (sip.fired) {
            setSipCount((count) => count + 1)
            sipHandler.current()
          }
        } catch {
          stop()
          setMessage('카메라를 분석하지 못했어요. 다시 켜 주세요.')
        }
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
          ? '카메라 접근이 거부됐어요. Mac 시스템 설정에서 한잔해 카메라 권한을 확인해 주세요.'
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
