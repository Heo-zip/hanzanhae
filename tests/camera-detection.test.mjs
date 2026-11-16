import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Module from 'node:module'
import ts from 'typescript'

const path = fileURLToPath(
  new URL('../src/renderer/src/features/camera/drinkDetection.ts', import.meta.url)
)
const source = ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const module = new Module(path)
module._compile(source, path)
const {
  SipDetector,
  headPitchUp,
  isHandAtMouth,
  ContainerHold,
  poseHead,
  FaceCover,
  handZoomRegions,
  mouthShape,
  MouthShapeMeter,
  countsAsContainer
} = module.exports

/** 평소 자세를 5프레임 보여 기준 각도를 만든다. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- 테스트 보조 함수는 JavaScript다.
function calm(detector, start = 0) {
  for (let i = 0; i < 5; i += 1)
    detector.observe({ pitch: 0, handAtMouth: false, containerHeld: false }, start + i * 250)
  return start + 5 * 250
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- 테스트 보조 함수는 JavaScript다.
function sip(detector, start, { lift = 20, hold = 1000, held = true } = {}) {
  const fired = []
  let t = start
  fired.push(detector.observe({ pitch: 2, handAtMouth: true, containerHeld: held }, t).fired)
  for (let end = t + hold; t <= end; t += 250)
    fired.push(detector.observe({ pitch: lift, handAtMouth: true, containerHeld: held }, t).fired)
  for (let end = t + 500; t <= end; t += 250)
    fired.push(detector.observe({ pitch: 0, handAtMouth: false, containerHeld: held }, t).fired)
  return { count: fired.filter(Boolean).length, end: t }
}

test('용기를 들고 고개를 젖힌 뒤 내리면 후보 한 번이다', () => {
  const detector = new SipDetector()
  assert.equal(sip(detector, calm(detector)).count, 1)
})

test('고개를 젖히지 않고 입에 대기만 하면 후보가 아니다', () => {
  const detector = new SipDetector()
  assert.equal(sip(detector, calm(detector), { lift: 3 }).count, 0)
})

test('용기를 잡지 않은 손이 입에 오면 후보가 아니다', () => {
  const detector = new SipDetector()
  assert.equal(sip(detector, calm(detector), { held: false }).count, 0)
})

test('고개를 잠깐만 젖히면 후보가 아니다', () => {
  const detector = new SipDetector()
  assert.equal(sip(detector, calm(detector), { hold: 250 }).count, 0)
})

test('평소 각도를 모르면 판단하지 않는다', () => {
  const detector = new SipDetector()
  assert.equal(sip(detector, 0).count, 0)
})

test('손이 잠깐 안 보여도 이어 보고, 오래 안 보이면 버린다', () => {
  const detector = new SipDetector()
  let t = calm(detector)
  detector.observe({ pitch: 20, handAtMouth: true, containerHeld: true }, t)
  for (let i = 0; i < 4; i += 1)
    detector.observe({ pitch: 20, handAtMouth: null, containerHeld: true }, (t += 250))
  t += 250
  assert.equal(
    detector.observe({ pitch: 0, handAtMouth: false, containerHeld: true }, t).fired,
    false
  )
  assert.equal(
    detector.observe({ pitch: 0, handAtMouth: false, containerHeld: true }, t + 500).fired,
    true
  )

  const lost = new SipDetector()
  t = calm(lost)
  lost.observe({ pitch: 20, handAtMouth: true, containerHeld: true }, t)
  for (let i = 0; i < 8; i += 1)
    lost.observe({ pitch: 20, handAtMouth: null, containerHeld: true }, (t += 250))
  assert.equal(
    lost.observe({ pitch: 0, handAtMouth: false, containerHeld: true }, t + 600).fired,
    false
  )
})

test('연달아 마셔도 잠시 동안은 한 번만 센다', () => {
  const detector = new SipDetector()
  const first = sip(detector, calm(detector))
  const second = sip(detector, first.end)
  assert.equal(first.count + second.count, 1)
  assert.equal(sip(detector, second.end + 5000).count, 1)
})

test('변환 행렬에서 고개 각도와 손·입 거리를 계산한다', () => {
  const up = new Array(16).fill(0)
  up[9] = Math.sin(Math.PI / 6)
  assert.ok(Math.abs(headPitchUp(up) - 30) < 1e-9)
  assert.equal(headPitchUp([]), null)
  const mouth = { x: 0.5, y: 0.5 }
  assert.equal(isHandAtMouth(mouth, 0.3, [{ x: 0.55, y: 0.7 }], 4 / 3), true)
  assert.equal(isHandAtMouth(mouth, 0.3, [{ x: 0.9, y: 0.9 }], 4 / 3), false)
  assert.equal(isHandAtMouth(null, 0.3, [{ x: 0.5, y: 0.5 }], 4 / 3), null)
  assert.equal(isHandAtMouth(mouth, 0.3, [], 4 / 3), null)
})

test('빠르게 들어 마셔 드는 순간 용기를 놓쳐도, 마시는 중에 보이면 센다', () => {
  const detector = new SipDetector()
  let t = calm(detector)
  detector.observe({ pitch: 2, handAtMouth: true, containerHeld: false }, t)
  for (let i = 0; i < 3; i += 1)
    detector.observe({ pitch: 10, handAtMouth: true, containerHeld: i > 0 }, (t += 250))
  let fired = 0
  for (let i = 0; i < 3; i += 1)
    if (detector.observe({ pitch: 0, handAtMouth: false, containerHeld: true }, (t += 250)).fired)
      fired += 1
  assert.equal(fired, 1)
})

test('마시는 동안 용기를 못 봤으면 내린 직후 1.5초 안에 보일 때만 센다', () => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- 테스트 보조 함수다.
  const run = (seenAfter) => {
    const detector = new SipDetector()
    const { count, end } = sip(detector, calm(detector), { lift: 10, hold: 500, held: false })
    const later = detector.observe(
      { pitch: 0, handAtMouth: false, containerHeld: true },
      end + seenAfter
    )
    return count + (later.fired ? 1 : 0)
  }
  assert.equal(run(500), 1)
  assert.equal(run(2500), 0)
})

test('8도만 젖혀도 마신 것으로 본다', () => {
  const detector = new SipDetector()
  assert.equal(sip(detector, calm(detector), { lift: 8, hold: 500 }).count, 1)
})

test('들고 온 용기가 입에 닿아 있으면 잡은 것으로 본다', () => {
  const hold = new ContainerHold()
  const box = { x: 0.4, y: 0.4, width: 0.1, height: 0.2 }
  assert.equal(hold.observe([], [], 0, { x: 0.45, y: 0.42 }), false)
  assert.equal(hold.observe([], [box], 100, { x: 0.45, y: 0.42 }), true)
  assert.equal(hold.source, 'mouth')
})

test('제자리에 놓인 용기는 입이 다가가도 잡은 것으로 보지 않는다', () => {
  const hold = new ContainerHold()
  const box = { x: 0.4, y: 0.4, width: 0.1, height: 0.2 }
  assert.equal(hold.observe([], [box], 0, { x: 0.9, y: 0.1 }), false)
  assert.equal(hold.observe([], [box], 100, { x: 0.45, y: 0.42 }), false)
})

test('용기를 잡았던 손은 6초 동안 기억한다', () => {
  const hold = new ContainerHold()
  const box = { x: 0.4, y: 0.4, width: 0.1, height: 0.2 }
  // 처음부터 손과 함께 보인 용기(제자리에 놓인 적 없음)
  assert.equal(hold.observe([{ x: 0.9, y: 0.9 }], [], 0), false)
  assert.equal(hold.observe([{ x: 0.45, y: 0.5 }], [box], 100), true)
  assert.equal(hold.observe([], [], 6000), true)
  assert.equal(hold.observe([], [], 6200), false)
})

/** 얼굴·자세 기준을 모두 만든 뒤, 입으로 가져간 다음 프레임들을 넣고 내려놓는다. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- 테스트 보조 함수는 JavaScript다.
function runFrames(detector, frames) {
  let t = 0
  for (let i = 0; i < 5; i += 1, t += 250)
    detector.observe({ pitch: 0, posePitch: 0.1, handAtMouth: false, containerHeld: false }, t)
  let fired = 0
  const base = { pitch: null, posePitch: null, covered: false, containerHeld: true }
  detector.observe({ pitch: 1, posePitch: 0.1, handAtMouth: true, containerHeld: true }, t)
  for (const frame of frames)
    if (detector.observe({ ...base, ...frame }, (t += 250)).fired) fired += 1
  for (let i = 0; i < 3; i += 1)
    if (detector.observe({ ...base, posePitch: 0.1, handAtMouth: false }, (t += 250)).fired)
      fired += 1
  return fired
}

test('얼굴을 놓쳐도 자세로 고개를 젖힌 게 보이면 센다', () => {
  const tilted = Array(4).fill({ posePitch: 0.2, handAtMouth: true })
  assert.equal(runFrames(new SipDetector(), tilted), 1)
  const flat = Array(4).fill({ posePitch: 0.12, handAtMouth: true })
  assert.equal(runFrames(new SipDetector(), flat), 0)
})

test('용기를 든 손이 얼굴을 가린 채 유지되면 마시는 자세로 본다', () => {
  const covered = Array(4).fill({ covered: true, handAtMouth: true })
  assert.equal(runFrames(new SipDetector(), covered), 1)
  const brief = [
    { covered: true, handAtMouth: true },
    { posePitch: 0.1, handAtMouth: true }
  ]
  assert.equal(runFrames(new SipDetector(), brief), 0)
})

test('얼굴 모델 값이 있으면 자세 값보다 먼저 쓴다', () => {
  const faceFlat = Array(4).fill({ pitch: 2, posePitch: 0.3, handAtMouth: true })
  assert.equal(runFrames(new SipDetector(), faceFlat), 0)
})

test('자세 모델에서 어깨가 보일 때만 머리 정보를 만든다', () => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- 테스트 보조 함수는 JavaScript다.
  const mark = (x, y) => ({ x, y, visibility: 0.9 })
  const marks = []
  marks[0] = mark(0.5, 0.3)
  marks[7] = mark(0.45, 0.33)
  marks[8] = mark(0.55, 0.33)
  marks[9] = mark(0.48, 0.36)
  marks[10] = mark(0.52, 0.36)
  marks[11] = mark(0.35, 0.6)
  marks[12] = mark(0.65, 0.6)
  const head = poseHead(marks, 1)
  assert.ok(Math.abs(head.scale - 0.3) < 1e-9)
  assert.ok(Math.abs(head.pitch - 0.1) < 1e-9)
  assert.deepEqual(head.mouth, { x: 0.5, y: 0.36 })
  marks[12] = { ...marks[12], visibility: 0.1 }
  assert.equal(poseHead(marks, 1), null)
})

test('사라진 얼굴 자리를 손이나 용기가 덮을 때만 가림으로 본다', () => {
  const cover = new FaceCover()
  const face = { x: 0.4, y: 0.2, width: 0.2, height: 0.3 }
  assert.equal(cover.observe(face, [], [], 0), false)
  assert.equal(cover.observe(null, [{ x: 0.5, y: 0.3 }], [], 500), true)
  assert.equal(cover.observe(null, [], [{ x: 0.45, y: 0.25, width: 0.1, height: 0.3 }], 600), true)
  assert.equal(cover.observe(null, [{ x: 0.9, y: 0.9 }], [], 700), false)
  assert.equal(cover.observe(null, [{ x: 0.5, y: 0.3 }], [], 3500), false)
})

test('제자리 용기를 잡고 손을 든 동안 그 자리가 비면 집어 든 것으로 본다', () => {
  const desk = { x: 0.4, y: 0.7, width: 0.1, height: 0.2 }
  const onBottle = [{ x: 0.45, y: 0.8 }]
  const atMouth = [{ x: 0.45, y: 0.35 }]
  const hold = new ContainerHold()
  assert.equal(hold.observe([{ x: 0.9, y: 0.9 }], [desk], 0), false)
  // 손이 병을 잡음(아직 들었다고 보지 않음)
  assert.equal(hold.observe(onBottle, [desk], 250), false)
  // 손을 들어 올렸고 병 자리가 비어 있음
  assert.equal(hold.observe(atMouth, [], 500, null, [], true), false)
  assert.equal(hold.observe(atMouth, [], 750, null, [], true), false)
  assert.equal(hold.observe(atMouth, [], 1100, null, [], true), true)
  assert.equal(hold.source, 'pickup')
})

test('제자리 용기를 만지기만 하고 손을 떼면 집은 것으로 보지 않는다', () => {
  const desk = { x: 0.4, y: 0.7, width: 0.1, height: 0.2 }
  const hold = new ContainerHold()
  hold.observe([{ x: 0.9, y: 0.9 }], [desk], 0)
  hold.observe([{ x: 0.45, y: 0.8 }], [desk], 250)
  // 손은 입으로 갔지만 병은 그 자리에 그대로 보임
  for (let t = 500; t <= 3000; t += 250)
    assert.equal(hold.observe([{ x: 0.45, y: 0.35 }], [desk], t, null, [], true), false)
})

test('화면에 병만 놓여 있고 빈손을 입에 대고 고개를 젖히면 마신 것으로 세지 않는다', () => {
  const desk = { x: 0.7, y: 0.7, width: 0.1, height: 0.2 }
  const mouth = { x: 0.5, y: 0.35 }
  const hold = new ContainerHold()
  const detector = new SipDetector()
  let t = 0
  let fired = 0
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- 테스트 보조 함수다.
  const frame = (hand, pitch, handAtMouth, zoomBoxes = []) => {
    const held = hold.observe(hand, [desk], t, mouth, zoomBoxes, hand[0].y < 0.6)
    if (detector.observe({ pitch, handAtMouth, containerHeld: held }, t).fired) fired += 1
    t += 250
  }
  for (let i = 0; i < 5; i += 1) frame([{ x: 0.3, y: 0.9 }], 0, false)
  // 손을 병 옆에 잠깐 둠(스침)
  frame([{ x: 0.74, y: 0.8 }], 0, false)
  // 빈손을 입에 대고 고개를 젖힘. 확대 영역에도 같은 병이 잡힘
  for (let i = 0; i < 6; i += 1) frame([{ x: 0.5, y: 0.38 }], 15, true, [desk])
  for (let i = 0; i < 12; i += 1) frame([{ x: 0.3, y: 0.9 }], 0, false)
  assert.equal(fired, 0)
})

test('손 주변 확대에서 찾은 상자는 확대 근거로 표시한다', () => {
  const hold = new ContainerHold()
  const zoomBox = { x: 0.4, y: 0.3, width: 0.05, height: 0.1 }
  assert.equal(hold.observe([{ x: 0.42, y: 0.35 }], [], 0, null, [zoomBox]), true)
  assert.equal(hold.source, 'zoom')
  assert.equal(hold.observe([{ x: 0.42, y: 0.35 }], [zoomBox], 250), true)
  assert.equal(hold.source, 'touch')
})

test('가슴 위로 올라온 손만 주변 확대 영역을 만든다', () => {
  // 어깨 너비 0.2(화면비 1), 어깨 높이 0.5
  const marks = []
  marks[11] = { x: 0.4, y: 0.5, visibility: 1 }
  marks[12] = { x: 0.6, y: 0.5, visibility: 1 }
  marks[15] = { x: 0.3, y: 0.4, visibility: 1 }
  marks[16] = { x: 0.7, y: 0.95, visibility: 1 }
  const regions = handZoomRegions(marks, 1)
  assert.equal(regions.length, 1)
  const [region] = regions
  assert.ok(Math.abs(region.width - 0.24) < 1e-9 && Math.abs(region.height - 0.24) < 1e-9)
  assert.ok(Math.abs(region.x + region.width / 2 - 0.3) < 1e-9)

  // 화면 가장자리에서는 영역을 화면 안으로 민다.
  marks[15] = { x: 0.01, y: 0.4, visibility: 1 }
  assert.equal(handZoomRegions(marks, 1)[0].x, 0)

  // 어깨가 안 보이면 만들지 않는다.
  marks[12] = { x: 0.6, y: 0.5, visibility: 0.2 }
  assert.deepEqual(handZoomRegions(marks, 1), [])
})

test('표정 값에서 입술 오므리기·모으기만 꺼낸다', () => {
  const categories = [
    { categoryName: 'jawOpen', score: 0.4 },
    { categoryName: 'mouthPucker', score: 0.62 },
    { categoryName: 'mouthFunnel', score: 0.18 }
  ]
  assert.deepEqual(mouthShape(categories), { pucker: 0.62, funnel: 0.18 })
  assert.equal(mouthShape([]), null)
  assert.equal(mouthShape(undefined), null)
  assert.equal(mouthShape([{ categoryName: 'mouthPucker', score: 0.5 }]), null)
})

test('입 모양 측정은 현재 값과 최근 3초 최고값을 돌려준다', () => {
  const meter = new MouthShapeMeter()
  meter.observe({ pucker: 0.7, funnel: 0.1 }, 0)
  const reading = meter.observe({ pucker: 0.2, funnel: 0.3 }, 1000)
  assert.deepEqual(reading.current, { pucker: 0.2, funnel: 0.3 })
  assert.deepEqual(reading.peak, { pucker: 0.7, funnel: 0.3 })
  // 얼굴을 놓쳐도 최근 최고값은 남고, 3초가 지나면 빠진다.
  assert.deepEqual(meter.observe(null, 2000).peak, { pucker: 0.7, funnel: 0.3 })
  assert.deepEqual(meter.observe(null, 3500).peak, { pucker: 0.2, funnel: 0.3 })
  assert.equal(meter.observe(null, 5000).peak, null)
})

test('빨대: 고개를 젖히지 않아도 입을 오므린 채 0.5초 이상 마시고 내리면 센다', () => {
  const detector = new SipDetector()
  let t = calm(detector)
  const straw = { pucker: 0.6, funnel: 0.3 }
  detector.observe({ pitch: 0, handAtMouth: true, containerHeld: true, mouth: straw }, t)
  let result
  for (let i = 0; i < 3; i++)
    result = detector.observe(
      { pitch: 0, handAtMouth: true, containerHeld: true, mouth: straw },
      (t += 250)
    )
  assert.equal(result.phase, 'sipping')
  assert.equal(result.straw, true)
  // 손을 내리고 0.4초가 지나면 한 번 센다.
  const fired = [250, 500, 750].map(
    (step) =>
      detector.observe({ pitch: 0, handAtMouth: false, containerHeld: true }, t + step).fired
  )
  assert.deepEqual(fired, [false, false, true])
})

test('빨대: 입을 잠깐만 오므리거나 용기가 없으면 세지 않는다', () => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const run = (frames, held) => {
    const detector = new SipDetector()
    let t = calm(detector)
    let fired = false
    for (const pucker of frames)
      fired ||= detector.observe(
        { pitch: 0, handAtMouth: true, containerHeld: held, mouth: { pucker, funnel: 0 } },
        (t += 250)
      ).fired
    for (let i = 0; i < 10; i++)
      fired ||= detector.observe(
        { pitch: 0, handAtMouth: false, containerHeld: false },
        (t += 250)
      ).fired
    return fired
  }
  assert.equal(run([0.1, 0.6, 0.1, 0.6, 0.1], true), false)
  assert.equal(run([0.2, 0.3, 0.3, 0.3, 0.2], true), false)
  assert.equal(run([0.6, 0.6, 0.6, 0.6, 0.6], false), false)
  assert.equal(run([0.6, 0.6, 0.6, 0.6, 0.6], true), true)
})

test('확대 검출은 입에 댄 빈손 수준의 낮은 컵 점수를 용기로 쓰지 않는다', () => {
  assert.equal(countsAsContainer(0.3, true), false)
  assert.equal(countsAsContainer(0.49, true), false)
  assert.equal(countsAsContainer(0.5, true), true)
  assert.equal(countsAsContainer(0.25, false), false)
  assert.equal(countsAsContainer(0.3, false), true)
  assert.equal(countsAsContainer(undefined, false), false)
})
