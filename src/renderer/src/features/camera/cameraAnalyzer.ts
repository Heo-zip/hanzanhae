import {
  FaceLandmarker,
  ObjectDetector,
  PoseLandmarker,
  type Detection
} from '@mediapipe/tasks-vision'
import {
  ContainerHold,
  FaceCover,
  SipDetector,
  handZoomRegions,
  mouthShape,
  MouthShapeMeter,
  countsAsContainer,
  distanceToBox,
  CARRY_MEMORY_MS,
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

// 영상 한 장을 받아 얼굴·자세·용기 모델을 돌리고 마시는 동작을 판정한다.
// 배포 앱에서는 Worker 안에서 돌아 화면 애니메이션을 막지 않는다. DOM에 의존하지 않는다.

export type DetectionStatus = {
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

/** 마지막 분석 결과. 미리보기는 매 화면마다 영상 위에 이것을 겹쳐 그린다. */
export type Overlay = {
  face: Box | null
  objects: (Detection & { zoomed?: boolean })[]
  handPoints: Point[]
  mouth: Point | null
  zoomRegions: Box[]
}
export const EMPTY_OVERLAY: Overlay = {
  face: null,
  objects: [],
  handPoints: [],
  mouth: null,
  zoomRegions: []
}

/** active: 손을 들었거나 용기를 잡는 등 마시는 낌새가 있어 촘촘히 봐야 하는지 */
export type AnalysisResult = {
  overlay: Overlay
  status: DetectionStatus
  fired: boolean
  active: boolean
}

/** 앱 전용 프로토콜로 바꾼 실행 파일·모델 주소 */
export type AnalyzerAssets = {
  wasmLoaderPath: string
  wasmBinaryPath: string
  objectModel: string
  faceMeshModel: string
  poseModel: string
}

export type Analyzer = {
  analyze: (image: TexImageSource, width: number, height: number) => AnalysisResult
  close: () => void
}

// 손 주변 확대 이미지 크기. EfficientDet-Lite0 입력 크기와 같다.
const ZOOM_INPUT = 320

function roundShape(shape: MouthShape | null): MouthShape | null {
  return shape
    ? { pucker: Math.round(shape.pucker * 100) / 100, funnel: Math.round(shape.funnel * 100) / 100 }
    : null
}

export async function createAnalyzer(
  assets: AnalyzerAssets,
  isCancelled: () => boolean = () => false
): Promise<Analyzer | null> {
  const fileset = { wasmLoaderPath: assets.wasmLoaderPath, wasmBinaryPath: assets.wasmBinaryPath }
  const created: { close: () => void }[] = []
  const closeAll = (): void => created.forEach((item) => item.close())
  try {
    const objects = await ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: assets.objectModel, delegate: 'CPU' },
      runningMode: 'VIDEO',
      scoreThreshold: 0.2,
      categoryAllowlist: ['cup', 'bottle', 'wine glass'],
      maxResults: 5
    })
    created.push(objects)
    if (isCancelled()) return (closeAll(), null)
    // 손 주변을 잘라 크게 키운 이미지를 한 장씩 보는 검출기다. 영상 모드 검출기와 시간 기록이 섞이지 않게 따로 둔다.
    const zoomObjects = await ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: assets.objectModel, delegate: 'CPU' },
      runningMode: 'IMAGE',
      scoreThreshold: 0.2,
      categoryAllowlist: ['cup', 'bottle', 'wine glass'],
      maxResults: 3
    })
    created.push(zoomObjects)
    if (isCancelled()) return (closeAll(), null)
    const faceMesh = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: assets.faceMeshModel, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      // 고개를 돌리거나 일부가 가려져도 추적이 덜 끊기도록 기본값 0.5보다 낮춘다.
      minFacePresenceConfidence: 0.3,
      minTrackingConfidence: 0.3,
      outputFacialTransformationMatrixes: true,
      // 빨대 음용 측정을 위해 입술 오므리기 등 표정 값을 함께 받는다.
      outputFaceBlendshapes: true
    })
    created.push(faceMesh)
    if (isCancelled()) return (closeAll(), null)
    const pose = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: assets.poseModel, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numPoses: 1
    })
    created.push(pose)
    if (isCancelled()) return (closeAll(), null)

    const zoomCanvas = new OffscreenCanvas(ZOOM_INPUT, ZOOM_INPUT)
    const zoomContext = zoomCanvas.getContext('2d')
    const sipDetector = new SipDetector()
    const mouthMeter = new MouthShapeMeter()
    const containerHold = new ContainerHold()
    const faceCover = new FaceCover()
    let lastNow = 0
    // 마지막으로 손 옆에 용기(점수 무관)가 보인 시각
    let carriedAt = -Infinity

    const analyze = (image: TexImageSource, width: number, height: number): AnalysisResult => {
      // 영상 모드 모델은 시각이 계속 늘어나야 한다.
      const now = Math.max(performance.now(), lastNow + 1)
      lastNow = now
      const aspect = width / height
      const containers = objects.detectForVideo(image, now).detections
      const boxes: Box[] = containers.flatMap((item) =>
        item.boundingBox && countsAsContainer(item.categories[0], false)
          ? [
              {
                x: item.boundingBox.originX / width,
                y: item.boundingBox.originY / height,
                width: item.boundingBox.width / width,
                height: item.boundingBox.height / height
              }
            ]
          : []
      )

      // 얼굴 모델: 고개 각도, 입, 얼굴 크기와 영역
      const meshResult = faceMesh.detectForVideo(image, now)
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
      const poseMarks = pose.detectForVideo(image, now).landmarks[0] ?? []
      const head = poseHead(poseMarks, aspect)
      const handPoints = poseMarks.slice(15, 23).filter((point) => (point.visibility ?? 0) >= 0.5)

      // 손 옆에 용기가 보이면(낮은 점수 포함) 집어 드는 중일 수 있어 기억하고 촘촘히 본다.
      const allBoxes: Box[] = containers.flatMap((item) =>
        item.boundingBox
          ? [
              {
                x: item.boundingBox.originX / width,
                y: item.boundingBox.originY / height,
                width: item.boundingBox.width / width,
                height: item.boundingBox.height / height
              }
            ]
          : []
      )
      const containerNearHand = handPoints.some((point) =>
        allBoxes.some((box) => distanceToBox(point, box) <= 0.08)
      )
      if (containerNearHand) carriedAt = now
      const carried = now - carriedAt <= CARRY_MEMORY_MS

      // 손 주변을 잘라 320×320으로 키워 다시 찾는다. 손이 가슴 위로 올라왔을 때만 돈다.
      const zoomRegions = zoomContext ? handZoomRegions(poseMarks, aspect) : []
      const zoomed: (Detection & { zoomed: boolean })[] = []
      const zoomBoxes: Box[] = []
      for (const region of zoomRegions) {
        const sx = region.x * width
        const sy = region.y * height
        const sw = region.width * width
        const sh = region.height * height
        zoomContext!.drawImage(
          image as CanvasImageSource,
          sx,
          sy,
          sw,
          sh,
          0,
          0,
          ZOOM_INPUT,
          ZOOM_INPUT
        )
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
          if (!countsAsContainer(item.categories[0], true, carried)) continue
          zoomBoxes.push({
            x: originX / width,
            y: originY / height,
            width: boxWidth / width,
            height: boxHeight / height
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
      const covered = faceCover.observe(faceBox, handPoints, [...boxes, ...zoomBoxes], now) && held
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

      return {
        fired: sip.fired,
        active:
          containerNearHand ||
          zoomRegions.length > 0 ||
          held ||
          covered ||
          handAtMouth === true ||
          sip.phase !== 'idle',
        status: {
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
        },
        overlay: {
          face: faceBox,
          objects: [...containers, ...zoomed],
          handPoints,
          mouth: meshMouth ?? head?.mouth ?? null,
          zoomRegions
        }
      }
    }
    return { analyze, close: closeAll }
  } catch (error) {
    closeAll()
    throw error
  }
}
