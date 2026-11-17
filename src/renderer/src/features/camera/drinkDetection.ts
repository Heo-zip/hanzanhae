export type Point = { x: number; y: number }
export type Box = { x: number; y: number; width: number; height: number }

export function distanceToBox(point: Point, box: Box): number {
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width))
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height))
  return Math.hypot(dx, dy)
}

// ── 고개·손목 단계 판정 ──
// 마시는 순간 병과 손이 가려져도 고개를 젖히는 움직임은 보인다는 가정을 시험한다.
// 아래 값은 모두 실측 전 임시값이며 후보 수만 보여주고 기록하지 않는다.
// 빠르게 마실 때도 잡히도록 12°·600ms에서 낮췄다(2026-11-16 사용자 확인).
const SIP_LIFT_DEGREES = 8
// 자세 모델의 (귀 높이 − 코 높이) ÷ 어깨 너비가 평소보다 이만큼 커지면 젖힌 것으로 본다.
const POSE_LIFT = 0.06
const FACE_MEMORY_MS = 3000
const SIP_HOLD_MS = 300
const SIP_AWAY_MS = 400
const SIP_LOST_MS = 1500
const SIP_MAX_MS = 20000
const SIP_COOLDOWN_MS = 5000
const HOLD_MEMORY_MS = 6000
// 빠르게 들어 마시면 드는 순간 용기를 놓치므로, 내린 뒤 이 시간 안에 용기가 보여도 인정한다.
const CONTAINER_GRACE_MS = 1500
// 손이 닿지 않은 채 보인 상자를 '제자리 용기'로 기억하는 시간과, 같은 자리로 볼 겹침 비율(IoU).
const REST_MEMORY_MS = 10000
const REST_OVERLAP = 0.3
// 제자리 용기를 잡은 뒤 손을 든 동안 그 자리가 이만큼 비어 있어야 집어 든 것으로 본다.
const PICKUP_EMPTY_MS = 600
// 잡은 뒤 이 시간 안에 자리가 비지 않으면 집기 후보를 버린다.
const PICKUP_WINDOW_MS = 4000
// 입 모양 측정값의 최고값을 보여줄 최근 시간
const MOUTH_PEAK_MS = 3000
// 빨대로 마실 때: 손이 입 근처인 채 입술을 이만큼 오므린 상태가 이 시간 이어지면 마시는 중으로 본다.
// 고개를 젖히지 않아도 된다. 실측 전 임시값이며 측정 줄의 '입 오므림' 값과 비교해 조정한다.
const STRAW_PUCKER = 0.45
const STRAW_HOLD_MS = 500
// 손 주변 확대 영역의 한 변(어깨 너비의 배수)과, 어깨 아래 얼마까지를 '든 손'으로 볼지(어깨 너비의 배수).
const ZOOM_SIZE = 1.2
const RAISED_BELOW_SHOULDER = 1
// 용기로 판정에 쓰는 최소 점수. 화면에는 0.2부터 보여 준다.
// 손 주변 확대 이미지에서는 입에 댄 빈손을 컵 30% 안팎으로 잡는 일이 있어 더 높게 둔다(2026-11-16 사용자 확인). 실측 전 임시값이다.
const HOLD_SCORE = 0.3
const ZOOM_HOLD_SCORE = 0.5
// 물병은 따로 낮춘다. 텀블러는 모델이 배운 종류가 아니라 손에 들면 '물병(확대)' 26% 안팎으로 잡힌다
// (2026-11-17 사용자 확인). 빈손 오감지는 '컵'으로 잡혀 물병 기준과 무관하다. 실측 전 임시값이다.
const BOTTLE_HOLD_SCORE = 0.22
// 방금 손 옆에 용기가 보였다면(점수 무관) 입에 댄 확대 컵은 0.3만 넘어도 인정한다.
// 빈손 오감지는 손 옆에 용기가 없던 상황이라 막힌 채로 남는다. 실측 전 임시값이다.
export const CARRY_MEMORY_MS = 4000
const CARRIED_ZOOM_SCORE = 0.3

/** 검출 결과가 '용기를 들었다' 판정에 쓸 만큼 확실한지 본다. */
export function countsAsContainer(
  category: { categoryName?: string; score: number } | undefined,
  zoomed: boolean,
  carried = false
): boolean {
  if (!category) return false
  const minimum =
    category.categoryName === 'bottle'
      ? BOTTLE_HOLD_SCORE
      : zoomed
        ? carried
          ? CARRIED_ZOOM_SCORE
          : ZOOM_HOLD_SCORE
        : HOLD_SCORE
  return category.score >= minimum
}

/** Face Landmarker 변환 행렬(4×4, 열 우선)에서 얼굴 정면 방향의 위아래 각도(도)를 구한다. */
export function headPitchUp(matrix: ArrayLike<number>): number | null {
  const y = matrix[9]
  if (y === undefined || !Number.isFinite(y)) return null
  return (Math.asin(Math.max(-1, Math.min(1, y))) * 180) / Math.PI
}

/** 손 끝·손목 중 입에 가장 가까운 거리를 얼굴 높이 단위로 바꿔 입 근처인지 본다. 모르면 null이다. */
export function isHandAtMouth(
  mouth: Point | null,
  faceHeight: number,
  handPoints: Point[],
  frameAspect: number
): boolean | null {
  if (!mouth || faceHeight <= 0 || !handPoints.length) return null
  const nearest = Math.min(
    ...handPoints.map((point) => Math.hypot((point.x - mouth.x) * frameAspect, point.y - mouth.y))
  )
  return nearest / faceHeight <= 1
}

/** 들었다고 본 근거. 화면 전체에서 닿음 / 손 주변 확대에서 찾음 / 가려지기 직전 상자 / 입에 닿음 */
export type HoldSource = 'touch' | 'zoom' | 'pickup' | 'mouth'

function overlap(a: Box, b: Box): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  if (width <= 0 || height <= 0) return 0
  const shared = width * height
  return shared / (a.width * a.height + b.width * b.height - shared)
}

/**
 * 손이 용기를 들었는지 본다. 들고 난 뒤 가려져도 잠시 기억한다.
 *
 * "손 근처에 상자가 있다"만으로는 들었다고 보지 않는다. 책상에 놓인 병 옆을 손이 스치거나,
 * 입에 손을 댈 때 병이 같은 화면 영역에 있기만 해도 통과되는 오감지가 있었기 때문이다.
 * 손이 닿지 않은 채 보인 상자는 '제자리 용기'로 기억하고, 그 자리에 있는 상자는
 * 자리를 떠나야(손이 가슴 위로 든 동안 그 자리가 비어야) 들었다고 인정한다.
 *
 * - touch: 제자리 용기가 아닌 상자에 손 점이 닿음(손과 함께 움직이는 용기)
 * - zoom: 손 주변을 확대해 찾은, 제자리 용기가 아닌 상자에 손 점이 닿음
 * - pickup: 손이 제자리 용기를 잡은 뒤, 손을 든 동안 그 자리가 비어 있음
 * - mouth: 제자리 용기가 아닌 상자가 입에 닿음
 */
export class ContainerHold {
  private heldAt = -Infinity
  private lastSource: HoldSource | null = null
  private rest: { box: Box; at: number }[] = []
  private grab: { box: Box; at: number; emptySince: number | null } | null = null

  get source(): HoldSource | null {
    return this.lastSource
  }

  observe(
    handPoints: Point[],
    boxes: Box[],
    now: number,
    mouth: Point | null = null,
    zoomBoxes: Box[] = [],
    handRaised = false
  ): boolean {
    const near = (box: Box): boolean =>
      handPoints.some((point) => distanceToBox(point, box) <= 0.05)
    this.rest = this.rest.filter((item) => now - item.at <= REST_MEMORY_MS)
    const restSpot = (box: Box): { box: Box; at: number } | undefined =>
      this.rest.find((item) => overlap(item.box, box) >= REST_OVERLAP)
    const moving = (box: Box): boolean => restSpot(box) === undefined

    let found: HoldSource | null = boxes.some((box) => near(box) && moving(box))
      ? 'touch'
      : zoomBoxes.some((box) => near(box) && moving(box))
        ? 'zoom'
        : mouth !== null &&
            [...boxes, ...zoomBoxes].some((box) => distanceToBox(mouth, box) <= 0.05 && moving(box))
          ? 'mouth'
          : null

    // 제자리 용기에 손이 닿으면 집으려는 것일 수 있으니 그 자리를 지켜본다.
    const touchedSpot = [...boxes, ...zoomBoxes].map(restSpot).find((spot, index) => {
      const box = [...boxes, ...zoomBoxes][index]
      return spot !== undefined && near(box)
    })
    if (touchedSpot && !this.grab) this.grab = { box: touchedSpot.box, at: now, emptySince: null }
    if (this.grab) {
      const stillThere = [...boxes, ...zoomBoxes].some(
        (box) => overlap(box, this.grab!.box) >= REST_OVERLAP
      )
      const handOnSpot = near(this.grab.box)
      if (stillThere && !handOnSpot) {
        // 손이 떠났는데 용기가 그대로 있으면 들지 않은 것이다.
        this.grab = null
      } else if (!stillThere && handRaised) {
        this.grab.emptySince ??= now
        if (now - this.grab.emptySince >= PICKUP_EMPTY_MS) {
          found ??= 'pickup'
          this.rest = this.rest.filter((item) => item.box !== this.grab!.box)
          this.grab = null
        }
      } else this.grab.emptySince = null
      if (this.grab && now - this.grab.at > PICKUP_WINDOW_MS) this.grab = null
    }

    // 손이 닿지 않은 상자는 제자리 용기로 기억한다. 같은 자리면 위치·시각만 갱신한다.
    for (const box of [...boxes, ...zoomBoxes]) {
      if (near(box) || (mouth !== null && distanceToBox(mouth, box) <= 0.05)) continue
      const spot = restSpot(box)
      if (spot) {
        spot.box = box
        spot.at = now
      } else this.rest.push({ box, at: now })
    }
    this.rest = this.rest.slice(-10)

    if (found) {
      this.heldAt = now
      this.lastSource = found
    }
    const held = now - this.heldAt <= HOLD_MEMORY_MS
    if (!held) this.lastSource = null
    return held
  }
}

/**
 * 가슴 높이 이상으로 올라온 손마다 주변을 정사각형(화면 비율 반영)으로 잡는다.
 * 작고 가려진 용기를 크게 보고 다시 찾기 위한 영역이며, 어깨가 둘 다 보여야 만든다.
 */
export function handZoomRegions(marks: PoseMark[], frameAspect: number): Box[] {
  const seen = (index: number): PoseMark | null => {
    const mark = marks[index]
    return mark && (mark.visibility ?? 0) >= 0.5 ? mark : null
  }
  const left = seen(11)
  const right = seen(12)
  if (!left || !right) return []
  const scale = Math.hypot((left.x - right.x) * frameAspect, left.y - right.y)
  if (scale <= 0) return []
  const shoulderY = (left.y + right.y) / 2
  // 높이 기준 한 변. 너비는 화면 비율만큼 줄여 실제 정사각형이 되게 한다.
  const height = Math.min(1, scale * ZOOM_SIZE)
  const width = Math.min(1, height / frameAspect)
  const regions: Box[] = []
  // 왼손 15·17·19·21, 오른손 16·18·20·22
  for (const indexes of [
    [15, 17, 19, 21],
    [16, 18, 20, 22]
  ]) {
    const points = indexes.map(seen).filter((mark): mark is PoseMark => mark !== null)
    if (!points.length) continue
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length
    if (y > shoulderY + scale * RAISED_BELOW_SHOULDER) continue
    regions.push({
      x: Math.min(Math.max(0, x - width / 2), 1 - width),
      y: Math.min(Math.max(0, y - height / 2), 1 - height),
      width,
      height
    })
  }
  return regions
}

export type PoseMark = Point & { visibility?: number }
export type PoseHead = { pitch: number | null; mouth: Point | null; scale: number }

/**
 * 얼굴 모델이 얼굴을 놓쳤을 때 쓰는 자세 모델의 머리 정보다. 어깨가 둘 다 보여야 한다.
 * pitch는 각도가 아니라 (귀 높이 − 코 높이) ÷ 어깨 너비이며 위를 볼수록 커진다.
 */
export function poseHead(marks: PoseMark[], frameAspect: number): PoseHead | null {
  const seen = (index: number): PoseMark | null => {
    const mark = marks[index]
    return mark && (mark.visibility ?? 0) >= 0.5 ? mark : null
  }
  const left = seen(11)
  const right = seen(12)
  if (!left || !right) return null
  const scale = Math.hypot((left.x - right.x) * frameAspect, left.y - right.y)
  if (scale <= 0) return null
  const nose = seen(0)
  const ears = [seen(7), seen(8)].filter((mark): mark is PoseMark => mark !== null)
  const pitch =
    nose && ears.length
      ? (ears.reduce((sum, ear) => sum + ear.y, 0) / ears.length - nose.y) / scale
      : null
  const lip = [seen(9), seen(10)]
  const mouth =
    lip[0] && lip[1] ? { x: (lip[0].x + lip[1].x) / 2, y: (lip[0].y + lip[1].y) / 2 } : null
  return { pitch, mouth, scale }
}

/** 얼굴이 사라진 직후, 손이나 용기가 직전 얼굴 자리를 덮고 있으면 가린 것으로 본다. */
export class FaceCover {
  private last: { box: Box; at: number } | null = null

  observe(face: Box | null, handPoints: Point[], boxes: Box[], now: number): boolean {
    if (face) {
      this.last = { box: face, at: now }
      return false
    }
    if (!this.last || now - this.last.at > FACE_MEMORY_MS) return false
    const area = this.last.box
    return (
      handPoints.some((point) => distanceToBox(point, area) <= area.height * 0.3) ||
      boxes.some(
        (box) =>
          box.x < area.x + area.width &&
          area.x < box.x + box.width &&
          box.y < area.y + area.height &&
          area.y < box.y + box.height
      )
    )
  }
}

export type SipFrame = {
  /** 고개 위아래 각도. 얼굴을 못 찾으면 null */
  pitch: number | null
  /** 자세 모델로 본 고개 젖힘 비율. 얼굴 모델을 못 쓸 때만 판단에 쓴다 */
  posePitch?: number | null
  /** 용기를 든 손이 사라진 얼굴 자리를 덮고 있는지 */
  covered?: boolean
  /** 손이 입 근처인지. 입이나 손을 못 찾으면 null */
  handAtMouth: boolean | null
  /** 최근 몇 초 안에 용기를 잡은 손이 있었는지 */
  containerHeld: boolean
  /** 얼굴 모델의 입 모양. 빨대로 마시는지 볼 때 쓴다. 얼굴을 못 찾으면 null */
  mouth?: MouthShape | null
}

export type SipPhase = 'idle' | 'approach' | 'sipping'

// 쉬는 동안(사람이 없거나 손이 내려가 있을 때)은 0.5초에 한 번만 분석해 CPU를 아낀다.
// 1초로 했더니 빠르게 집어 드는 순간을 놓쳐 인식이 크게 떨어졌다(2026-11-17 사용자 확인).
// 손이 가슴 위로 오르는 등 마시는 낌새가 보이면 그 뒤 4초 동안은 0.25초마다 분석한다.
export const IDLE_ANALYSIS_MS = 500
export const ACTIVE_HOLD_MS = 4000

/** 이번 0.25초 차례에 분석할지 정한다. lastRun은 마지막 분석 시각, activeUntil은 빠르게 볼 마감 시각이다. */
export function analysisDue(now: number, lastRun: number, activeUntil: number): boolean {
  return now < activeUntil || now - lastRun >= IDLE_ANALYSIS_MS
}
export type HeadSource = 'face' | 'pose' | 'covered' | 'none'
export type SipResult = {
  fired: boolean
  phase: SipPhase
  lift: number | null
  poseLift: number | null
  source: HeadSource
  /** 이번 마시기를 빨대(입 오므림)로 판단했는지 */
  straw: boolean
}

/**
 * 손이 입으로 옴 → 평소보다 고개를 젖힌 채 유지 → 손을 내림을 한 번의 후보로 센다.
 * 용기는 그 과정 중 한 번이라도(또는 내린 직후 잠시 안에) 보이면 된다.
 * 평소 각도는 손이 입 근처가 아닐 때의 중앙값이라 카메라 높이에 따라 달라지지 않는다.
 */
export class SipDetector {
  private phase: SipPhase = 'idle'
  private startedAt = 0
  private lastAtMouth = 0
  private awaySince: number | null = null
  private tiltSince: number | null = null
  private lastFired = -Infinity
  private neutral: number[] = []
  private poseNeutral: number[] = []
  private sawContainer = false
  private graceUntil = -Infinity
  private puckerSince: number | null = null
  private byStraw = false

  observe(frame: SipFrame, now: number): SipResult {
    const { pitch, handAtMouth, containerHeld } = frame
    const posePitch = frame.posePitch ?? null
    const covered = frame.covered ?? false
    if (this.phase === 'idle' && handAtMouth !== true) {
      if (pitch !== null) this.neutral = [...this.neutral.slice(-19), pitch]
      if (posePitch !== null) this.poseNeutral = [...this.poseNeutral.slice(-19), posePitch]
    }
    const baseline = this.neutral.length >= 5 ? median(this.neutral) : null
    const poseBaseline = this.poseNeutral.length >= 5 ? median(this.poseNeutral) : null
    const lift = pitch !== null && baseline !== null ? pitch - baseline : null
    const poseLift = posePitch !== null && poseBaseline !== null ? posePitch - poseBaseline : null
    // 얼굴 모델 → 자세 모델 → 가림 순서로 고개를 젖혔는지 본다. 셋 다 모르면 null이다.
    const source: HeadSource =
      lift !== null ? 'face' : covered ? 'covered' : poseLift !== null ? 'pose' : 'none'
    const tilted =
      source === 'face'
        ? lift! >= SIP_LIFT_DEGREES
        : source === 'covered'
          ? true
          : source === 'pose'
            ? poseLift! >= POSE_LIFT
            : null
    let fired = false
    const result = (): SipResult => ({
      fired,
      phase: this.phase,
      lift,
      poseLift,
      source,
      straw: this.phase !== 'idle' && this.byStraw
    })

    const fire = (): boolean => {
      if (now - this.lastFired < SIP_COOLDOWN_MS) return false
      this.lastFired = now
      return true
    }

    if (this.phase === 'idle') {
      // 마신 동작은 끝났지만 용기를 못 봤던 경우, 내린 직후 용기가 보이면 센다.
      if (now <= this.graceUntil && containerHeld) {
        this.graceUntil = -Infinity
        fired = fire()
        return result()
      }
      if (handAtMouth === true && (baseline !== null || poseBaseline !== null)) {
        this.phase = 'approach'
        this.startedAt = now
        this.lastAtMouth = now
        this.awaySince = null
        this.tiltSince = null
        this.sawContainer = containerHeld
        this.graceUntil = -Infinity
        this.puckerSince = null
        this.byStraw = false
      }
      return result()
    }
    if (containerHeld) this.sawContainer = true

    if (tilted === true) {
      this.tiltSince ??= now
      if (now - this.tiltSince >= SIP_HOLD_MS) this.phase = 'sipping'
    } else if (tilted === false) this.tiltSince = null

    // 빨대: 고개를 젖히지 않고 손을 입에 댄 채 입술을 오므리고 있으면 마시는 중으로 본다.
    const puckered = handAtMouth === true && (frame.mouth?.pucker ?? 0) >= STRAW_PUCKER
    if (puckered) {
      this.puckerSince ??= now
      if (now - this.puckerSince >= STRAW_HOLD_MS && this.phase !== 'sipping') {
        this.phase = 'sipping'
        this.byStraw = true
      }
    } else this.puckerSince = null

    if (handAtMouth === true) {
      this.lastAtMouth = now
      this.awaySince = null
    } else if (handAtMouth === false) {
      this.awaySince ??= now
      if (now - this.awaySince >= SIP_AWAY_MS) {
        if (this.phase === 'sipping') {
          if (this.sawContainer) fired = fire()
          else this.graceUntil = now + CONTAINER_GRACE_MS
        }
        this.phase = 'idle'
      }
    } else if (now - this.lastAtMouth > SIP_LOST_MS) this.phase = 'idle'

    if (this.phase !== 'idle' && now - this.startedAt > SIP_MAX_MS) this.phase = 'idle'
    return result()
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export type MouthShape = { pucker: number; funnel: number }
export type MouthShapeReading = {
  current: MouthShape | null
  peak: MouthShape | null
}

/** Face Landmarker 표정 값 목록에서 입술 오므리기(mouthPucker)·입술 모으기(mouthFunnel)를 꺼낸다. */
export function mouthShape(
  categories: { categoryName: string; score: number }[] | undefined
): MouthShape | null {
  if (!categories?.length) return null
  const score = (name: string): number | undefined =>
    categories.find((item) => item.categoryName === name)?.score
  const pucker = score('mouthPucker')
  const funnel = score('mouthFunnel')
  return pucker === undefined || funnel === undefined ? null : { pucker, funnel }
}

/**
 * 빨대 판정 기준(STRAW_PUCKER)을 조정할 때 보는 측정 값이다.
 * 4Hz로 빠르게 바뀌어 읽기 어려우므로 최근 몇 초의 최고값도 함께 돌려준다.
 */
export class MouthShapeMeter {
  private samples: { at: number; shape: MouthShape }[] = []

  observe(shape: MouthShape | null, now: number): MouthShapeReading {
    this.samples = this.samples.filter((item) => now - item.at <= MOUTH_PEAK_MS)
    if (shape) this.samples.push({ at: now, shape })
    const peak = this.samples.length
      ? {
          pucker: Math.max(...this.samples.map((item) => item.shape.pucker)),
          funnel: Math.max(...this.samples.map((item) => item.shape.funnel))
        }
      : null
    return { current: shape, peak }
  }
}
