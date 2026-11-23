export type Point = { x: number; y: number }
export type Box = { x: number; y: number; width: number; height: number }

export function distanceToBox(point: Point, box: Box): number {
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width))
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height))
  return Math.hypot(dx, dy)
}

// ── 고개·손목 단계 판정 ──
// 고개와 손의 움직임을 함께 본다. 임계값은 실제 카메라에서 다시 조정한다.
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
const WRIST_REFERENCE_MS = 1500
const WRIST_TURN_COS = Math.cos((18 * Math.PI) / 180)
// 손이 닿지 않은 채 보인 상자를 '제자리 용기'로 기억하는 시간과, 같은 자리로 볼 겹침 비율(IoU).
const REST_MEMORY_MS = 10000
const REST_OVERLAP = 0.3
// 제자리 용기를 잡은 뒤 손을 든 동안 그 자리가 이만큼 비어 있어야 집어 든 것으로 본다.
const PICKUP_EMPTY_MS = 600
// 잡은 뒤 이 시간 안에 자리가 비지 않으면 집기 후보를 버린다.
const PICKUP_WINDOW_MS = 4000
// 입 모양 측정값의 최고값을 보여줄 최근 시간
const MOUTH_PEAK_MS = 3000
// 입을 다물고 있어도 오므림 점수가 높을 수 있어 입 근처에서 최근 입술 틈이 보여야 한다.
const STRAW_PUCKER = 0.45
const STRAW_HOLD_MS = 500
const STRAW_LIP_GAP = 0.035
const STRAW_LIP_GAP_MEMORY_MS = 1000
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

/** 얼굴 높이를 기준으로 입 근처인지 본다. 손·입의 깊이는 같은 자세 모델 값끼리만 비교한다. */
export function isHandAtMouth(
  mouth: Point | null,
  faceHeight: number,
  handPoints: (Point & { z?: number })[],
  frameAspect: number,
  mouthDepth?: number
): boolean | null {
  if (!mouth || faceHeight <= 0 || !handPoints.length) return null
  return handPoints.some(
    ({ x, y, z }) =>
      y >= mouth.y - faceHeight * 0.35 &&
      (mouthDepth === undefined ||
        z === undefined ||
        (z - mouthDepth) * frameAspect <= faceHeight * 0.3) &&
      Math.hypot((x - mouth.x) * frameAspect, y - mouth.y) <= faceHeight
  )
}

/** 들었다고 본 근거. 화면 전체에서 닿음 / 손 주변 확대에서 찾음 / 가려지기 직전 상자 / 입에 닿음 */
export type HoldSource = 'touch' | 'zoom' | 'pickup' | 'mouth'
export type HandSide = 0 | 1
export type HandPoint = PoseMark & { side: HandSide }
const HAND_MARKS = [
  [15, 17, 19, 21],
  [16, 18, 20, 22]
] as const

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
  private lastHand: HandSide | null = null
  private lastBox: Box | null = null
  private rest: { box: Box; at: number }[] = []
  private grab: { box: Box; hand: HandSide; at: number; emptySince: number | null } | null = null

  get source(): HoldSource | null {
    return this.lastSource
  }

  get hand(): HandSide | null {
    return this.lastHand
  }

  observe(
    handPoints: HandPoint[],
    boxes: Box[],
    now: number,
    mouth: Point | null = null,
    zoomBoxes: Box[] = [],
    raisedHands: HandSide[] = []
  ): boolean {
    const nearestHand = (box: Box, limit = 0.05): HandSide | null => {
      let hand: HandSide | null = null
      let nearest = limit
      for (const point of handPoints) {
        const distance = distanceToBox(point, box)
        if (
          distance > nearest ||
          (distance === nearest && hand !== null && point.side !== this.lastHand)
        )
          continue
        hand = point.side
        nearest = distance
      }
      return hand
    }
    this.rest = this.rest.filter((item) => now - item.at <= REST_MEMORY_MS)
    const restSpot = (box: Box): { box: Box; at: number } | undefined =>
      this.rest.find((item) => overlap(item.box, box) >= REST_OVERLAP)
    const moving = (box: Box): boolean => restSpot(box) === undefined

    const touch = boxes.find((box) => moving(box) && nearestHand(box) !== null)
    const zoom = zoomBoxes.find((box) => moving(box) && nearestHand(box) !== null)
    const atMouth =
      mouth &&
      [...boxes, ...zoomBoxes].find((box) => moving(box) && distanceToBox(mouth, box) <= 0.05)
    const foundBox = touch ?? zoom ?? atMouth ?? null
    let found: HoldSource | null = touch ? 'touch' : zoom ? 'zoom' : atMouth ? 'mouth' : null
    let foundHand = foundBox ? nearestHand(foundBox, found === 'mouth' ? 0.12 : 0.05) : null
    if (
      foundBox &&
      foundHand === null &&
      this.lastBox &&
      overlap(foundBox, this.lastBox) >= REST_OVERLAP
    )
      foundHand = this.lastHand

    // 제자리 용기에 손이 닿으면 집으려는 것일 수 있으니 그 자리를 지켜본다.
    if (!this.grab) {
      for (const box of [...boxes, ...zoomBoxes]) {
        const spot = restSpot(box)
        const hand = nearestHand(box)
        if (spot && hand !== null) {
          this.grab = { box: spot.box, hand, at: now, emptySince: null }
          break
        }
      }
    }
    if (this.grab) {
      const stillThere = [...boxes, ...zoomBoxes].some(
        (box) => overlap(box, this.grab!.box) >= REST_OVERLAP
      )
      const handOnSpot = nearestHand(this.grab.box) === this.grab.hand
      if (stillThere && !handOnSpot) {
        // 손이 떠났는데 용기가 그대로 있으면 들지 않은 것이다.
        this.grab = null
      } else if (!stillThere && raisedHands.includes(this.grab.hand)) {
        this.grab.emptySince ??= now
        if (now - this.grab.emptySince >= PICKUP_EMPTY_MS) {
          if (!found) {
            found = 'pickup'
            foundHand = this.grab.hand
          }
          this.rest = this.rest.filter((item) => item.box !== this.grab!.box)
          this.grab = null
        }
      } else this.grab.emptySince = null
      if (this.grab && now - this.grab.at > PICKUP_WINDOW_MS) this.grab = null
    }

    // 손이 닿지 않은 상자는 제자리 용기로 기억한다. 같은 자리면 위치·시각만 갱신한다.
    for (const box of [...boxes, ...zoomBoxes]) {
      if (nearestHand(box) !== null || (mouth !== null && distanceToBox(mouth, box) <= 0.05))
        continue
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
      this.lastHand = foundHand
      this.lastBox = foundBox
    }
    const held = now - this.heldAt <= HOLD_MEMORY_MS
    if (!held) {
      this.lastSource = null
      this.lastHand = null
      this.lastBox = null
    }
    return held
  }
}

/**
 * 가슴 높이 이상으로 올라온 손마다 주변을 정사각형(화면 비율 반영)으로 잡는다.
 * 작고 가려진 용기를 크게 보고 다시 찾기 위한 영역이며, 어깨가 둘 다 보여야 만든다.
 */
export function handZoomRegions(
  marks: PoseMark[],
  frameAspect: number
): (Box & { side: HandSide })[] {
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
  const regions: (Box & { side: HandSide })[] = []
  for (const side of [0, 1] as const) {
    const points = HAND_MARKS[side].map(seen).filter((mark): mark is PoseMark => mark !== null)
    if (!points.length) continue
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length
    if (y > shoulderY + scale * RAISED_BELOW_SHOULDER) continue
    regions.push({
      side,
      x: Math.min(Math.max(0, x - width / 2), 1 - width),
      y: Math.min(Math.max(0, y - height / 2), 1 - height),
      width,
      height
    })
  }
  return regions
}

export type PoseMark = Point & { visibility?: number; z?: number }
type Direction = Point & { z: number }
export type PoseHead = {
  pitch: number | null
  mouth: (Point & { z?: number }) | null
  scale: number
}

export function poseHands(marks: PoseMark[]): HandPoint[] {
  return ([0, 1] as const).flatMap((side) =>
    HAND_MARKS[side].flatMap((index) => {
      const mark = marks[index]
      return mark && (mark.visibility ?? 0) >= 0.5 ? [{ ...mark, side }] : []
    })
  )
}

/** 추정 3D 좌표에서 손목과 두 손가락 사이의 방향을 구한다. */
export function wristDirection(
  marks: (Direction & { visibility?: number })[],
  side: HandSide
): Direction | null {
  const [wrist, pinky, index] = HAND_MARKS[side].map((id) => marks[id])
  if (
    !wrist ||
    !pinky ||
    !index ||
    [wrist, pinky, index].some((mark) => (mark.visibility ?? 0) < 0.5)
  )
    return null
  const x = (pinky.x + index.x) / 2 - wrist.x
  const y = (pinky.y + index.y) / 2 - wrist.y
  const z = (pinky.z + index.z) / 2 - wrist.z
  const length = Math.hypot(x, y, z)
  if (!Number.isFinite(length) || length < 0.025) return null
  return { x: x / length, y: y / length, z: z / length }
}

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
  const [leftLip, rightLip] = lip
  const mouth =
    leftLip && rightLip
      ? {
          x: (leftLip.x + rightLip.x) / 2,
          y: (leftLip.y + rightLip.y) / 2,
          ...(leftLip.z !== undefined && rightLip.z !== undefined
            ? { z: (leftLip.z + rightLip.z) / 2 }
            : {})
        }
      : null
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
    const box = this.last.box
    const area = { ...box, y: box.y + box.height * 0.45, height: box.height * 0.55 }
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
  /** 최근에 용기를 잡은 손. 특정하지 못하면 null이다. */
  hand: HandSide | null
  wrist?: Direction | null
  lipGap?: number | null
  /** 얼굴 모델의 입 모양. 빨대로 마시는지 볼 때 쓴다. 얼굴을 못 찾으면 null */
  mouth?: MouthShape | null
}

export type SipPhase = 'idle' | 'approach' | 'sipping'

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
 * 용기를 든 손이 입으로 옴 → 음용 자세 유지 → 같은 손을 내림을 한 번으로 센다.
 * 가까이 가기 전에 연결한 손으로 시작해 내리는 순간까지 같은 손만 추적한다.
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
  private hand: HandSide | null = null
  private wristReference: { hand: HandSide; direction: Direction; at: number } | null = null
  private startWrist: Direction | null = null
  private wristTurned = false
  private puckerSince: number | null = null
  private lipGapAt = -Infinity
  private byStraw = false

  observe(frame: SipFrame, now: number): SipResult {
    const { pitch, handAtMouth, hand, wrist } = frame
    const posePitch = frame.posePitch ?? null
    const covered = frame.covered ?? false
    if (this.phase === 'idle' && handAtMouth !== true) {
      if (pitch !== null) this.neutral = [...this.neutral.slice(-19), pitch]
      if (posePitch !== null) this.poseNeutral = [...this.poseNeutral.slice(-19), posePitch]
      if (hand !== null && wrist) this.wristReference = { hand, direction: wrist, at: now }
    }
    const baseline = this.neutral.length >= 5 ? median(this.neutral) : null
    const poseBaseline = this.poseNeutral.length >= 5 ? median(this.poseNeutral) : null
    const lift = pitch !== null && baseline !== null ? pitch - baseline : null
    const poseLift = posePitch !== null && poseBaseline !== null ? posePitch - poseBaseline : null
    // 얼굴 모델이 끊기면 입 주변 가림을 먼저 확인하고 자세 모델의 값으로 보완한다.
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

    if (this.phase === 'idle') {
      if (hand !== null && handAtMouth === true && (baseline !== null || poseBaseline !== null)) {
        this.phase = 'approach'
        this.hand = hand
        this.startedAt = now
        this.lastAtMouth = now
        this.awaySince = null
        this.tiltSince = null
        const reference = this.wristReference
        this.startWrist =
          reference && reference.hand === hand && now - reference.at <= WRIST_REFERENCE_MS
            ? reference.direction
            : (wrist ?? null)
        this.wristTurned = false
        this.puckerSince = null
        this.lipGapAt = (frame.lipGap ?? 0) >= STRAW_LIP_GAP ? now : -Infinity
        this.byStraw = false
      }
      return result()
    }
    if (hand !== this.hand) {
      this.phase = 'idle'
      return result()
    }

    if (handAtMouth === true && wrist) {
      this.startWrist ??= wrist
      const start = this.startWrist
      const alignment = start.x * wrist.x + start.y * wrist.y + start.z * wrist.z
      if (alignment <= WRIST_TURN_COS) this.wristTurned = true
    }

    // 같은 손이나 용기가 입 부근을 가리는 정면 음용은 손 방향 추정이 끊겨도 이어 간다.
    if (tilted === true && (this.wristTurned || covered) && handAtMouth !== false) {
      this.tiltSince ??= now
      if (now - this.tiltSince >= SIP_HOLD_MS) this.phase = 'sipping'
    } else if (tilted === false || handAtMouth === false) this.tiltSince = null

    // 빨대에 입술을 밀착하기 직전에 열린 경우도 같은 동작으로 본다.
    if (handAtMouth === true && (frame.lipGap ?? 0) >= STRAW_LIP_GAP) this.lipGapAt = now
    const puckered = handAtMouth === true && (frame.mouth?.pucker ?? 0) >= STRAW_PUCKER
    if (puckered) {
      this.puckerSince ??= now
      if (
        now - this.lipGapAt <= STRAW_LIP_GAP_MEMORY_MS &&
        now - this.puckerSince >= STRAW_HOLD_MS &&
        this.phase !== 'sipping'
      ) {
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
        if (this.phase === 'sipping' && now - this.lastFired >= SIP_COOLDOWN_MS) {
          this.lastFired = now
          fired = true
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
