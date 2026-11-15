export type Point = { x: number; y: number }
export type Box = { x: number; y: number; width: number; height: number }

function distanceToBox(point: Point, box: Box): number {
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width))
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height))
  return Math.hypot(dx, dy)
}

// ── 고개·손목 단계 판정 ──
// 마시는 순간 병과 손이 가려져도 고개를 젖히는 움직임은 보인다는 가정을 시험한다.
// 아래 값은 모두 실측 전 임시값이며 후보 수만 보여주고 기록하지 않는다.
const SIP_LIFT_DEGREES = 12
// 자세 모델의 (귀 높이 − 코 높이) ÷ 어깨 너비가 평소보다 이만큼 커지면 젖힌 것으로 본다.
const POSE_LIFT = 0.06
const FACE_MEMORY_MS = 3000
const SIP_HOLD_MS = 600
const SIP_AWAY_MS = 400
const SIP_LOST_MS = 1500
const SIP_MAX_MS = 20000
const SIP_COOLDOWN_MS = 5000
const HOLD_MEMORY_MS = 6000

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

/** 손 끝·손목이 용기 상자에 닿아 있으면 잡은 것으로 보고, 가려진 뒤에도 잠시 기억한다. */
export class ContainerHold {
  private heldAt = -Infinity

  observe(handPoints: Point[], boxes: Box[], now: number): boolean {
    if (handPoints.some((point) => boxes.some((box) => distanceToBox(point, box) <= 0.05)))
      this.heldAt = now
    return now - this.heldAt <= HOLD_MEMORY_MS
  }
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
}

export type SipPhase = 'idle' | 'approach' | 'sipping'
export type HeadSource = 'face' | 'pose' | 'covered' | 'none'
export type SipResult = {
  fired: boolean
  phase: SipPhase
  lift: number | null
  poseLift: number | null
  source: HeadSource
}

/**
 * 용기를 든 손이 입으로 옴 → 평소보다 고개를 젖힌 채 유지 → 손을 내림을 한 번의 후보로 센다.
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
    const result = (): SipResult => ({ fired, phase: this.phase, lift, poseLift, source })

    if (this.phase === 'idle') {
      if (handAtMouth === true && containerHeld && (baseline !== null || poseBaseline !== null)) {
        this.phase = 'approach'
        this.startedAt = now
        this.lastAtMouth = now
        this.awaySince = null
        this.tiltSince = null
      }
      return result()
    }

    if (tilted === true) {
      this.tiltSince ??= now
      if (now - this.tiltSince >= SIP_HOLD_MS) this.phase = 'sipping'
    } else if (tilted === false) this.tiltSince = null

    if (handAtMouth === true) {
      this.lastAtMouth = now
      this.awaySince = null
    } else if (handAtMouth === false) {
      this.awaySince ??= now
      if (now - this.awaySince >= SIP_AWAY_MS) {
        fired = this.phase === 'sipping' && now - this.lastFired >= SIP_COOLDOWN_MS
        if (fired) this.lastFired = now
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
