import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { AppState } from '../../../../shared/appState'
import { useRecordCup } from '../water/useRecordCup'
import { useCancelWater } from '../water/useCancelWater'
import { plantFrame } from '../plant/plantVisual'
import wateringCan from '../../assets/icons/watering-can.webp'
import './garden.css'

// 카메라 감지 표시와 되돌리기 버튼을 보여 주는 시간. 대시보드 안내와 같다.
const DETECTED_MS = 8000
// 감지 때 화분 위로 떨어지는 물방울의 가로 위치(화분 가운데 기준 px)와 시작 지연(ms).
const DROPS = [
  [-26, 0],
  [8, 90],
  [-6, 200],
  [24, 280],
  [-16, 380],
  [14, 470]
] as const

function Garden({
  state,
  refresh
}: {
  state: Exclude<AppState, { status: 'setup-required' }>
  refresh: () => Promise<void>
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [pouring, setPouring] = useState(false)
  const [showUndo, setShowUndo] = useState(false)
  const [dragError, setDragError] = useState('')
  // 카메라가 마신 동작을 감지해 저장한 기록. 잠시 표시하고 되돌릴 수 있게 한다.
  const [detected, setDetected] = useState<number | null>(null)
  const [celebrating, setCelebrating] = useState(false)
  const [detectBusy, setDetectBusy] = useState(false)
  const [detectError, setDetectError] = useState('')
  const gesture = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  function startDrag(event: PointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0 || pouring || !window.gardenWindow) return
    setDragError('')
    suppressClick.current = false
    gesture.current = { id: event.pointerId, x: event.screenX, y: event.screenY, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
    window.gardenWindow.beginDrag({ x: event.screenX, y: event.screenY })
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>): void {
    const active = gesture.current
    if (!active || active.id !== event.pointerId) return
    if (!active.moved && Math.hypot(event.screenX - active.x, event.screenY - active.y) < 5) return
    active.moved = true
    window.gardenWindow?.moveDrag({ x: event.screenX, y: event.screenY })
  }

  function cancelDrag(event: PointerEvent<HTMLButtonElement>): void {
    if (gesture.current?.id !== event.pointerId) return
    gesture.current = null
    suppressClick.current = false
    window.gardenWindow?.cancelDrag()
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>): void {
    const active = gesture.current
    if (!active || active.id !== event.pointerId) return
    gesture.current = null
    suppressClick.current = active.moved
    void window.gardenWindow
      ?.endDrag({ x: event.screenX, y: event.screenY })
      .then((result) => {
        if (!result.ok) setDragError('위치를 저장하지 못했어요. 다시 옮겨 주세요.')
      })
      .catch(() => setDragError('위치를 저장하지 못했어요. 다시 옮겨 주세요.'))
  }
  const { image: source, rim, filter } = plantFrame(state.plantStage, state.plantVitality)
  const { record, busy, error } = useRecordCup(state, refresh)
  const { cancel, retry, busy: cancelBusy, error: cancelError, retryable } = useCancelWater(refresh)
  const latest =
    state.status === 'ready'
      ? state.todayRecords.find((item) => item.goalId === state.goalId)
      : undefined

  async function undoLatest(): Promise<void> {
    if (state.status !== 'ready' || !latest) return
    if (
      await cancel({
        kind: 'latest',
        expectedGoalId: state.goalId,
        day: state.day,
        recordId: latest.id
      })
    )
      setShowUndo(false)
  }

  useEffect(() => {
    let timer: number | undefined
    let undoTimer: number | undefined
    const unsubscribe = window.hanzanhae.onWaterRecorded(() => {
      window.clearTimeout(timer)
      window.clearTimeout(undoTimer)
      setShowUndo(false)
      setIsOpen(true)
      setPouring(true)
      timer = window.setTimeout(() => {
        setPouring(false)
        setIsOpen(false)
        // 물뿌리개가 닫힌 뒤 되돌리기 아이콘이 겹치지 않게 나타난다.
        undoTimer = window.setTimeout(() => {
          setShowUndo(true)
          undoTimer = window.setTimeout(() => setShowUndo(false), 4000)
        }, 250)
      }, 1700)
    })
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(undoTimer)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let hideTimer: number | undefined
    let celebrateTimer: number | undefined
    const unsubscribe = window.hanzanhae.onDrinkDetected((recordId) => {
      window.clearTimeout(hideTimer)
      window.clearTimeout(celebrateTimer)
      setDetectError('')
      setDetected(recordId)
      setCelebrating(true)
      celebrateTimer = window.setTimeout(() => setCelebrating(false), 1400)
      hideTimer = window.setTimeout(() => setDetected(null), DETECTED_MS)
    })
    return () => {
      window.clearTimeout(hideTimer)
      window.clearTimeout(celebrateTimer)
      unsubscribe()
    }
  }, [])

  // 대시보드에서 되돌리는 등 기록이 바뀌면 버튼을 거둔다. 저장 직후에는 상태가 한 번 늦게
  // 따라오므로 이 기록이 화면에 반영된 것을 본 뒤에만 판단한다.
  const latestDrinkId = state.latestDrinkId
  const seenDetected = useRef(false)
  useEffect(() => {
    seenDetected.current = false
  }, [detected])
  useEffect(() => {
    if (detected === null) return
    if (latestDrinkId === detected) seenDetected.current = true
    else if (seenDetected.current) setDetected(null)
  }, [detected, latestDrinkId])

  async function undoDetected(): Promise<void> {
    if (detected === null || state.status !== 'ready') return
    setDetectBusy(true)
    try {
      const response = await window.hanzanhae.recordDrinkAction({
        requestId: crypto.randomUUID(),
        expectedGoalId: state.goalId,
        day: state.day,
        kind: 'undo',
        recordId: detected
      })
      if (response.ok) setDetected(null)
      else setDetectError('되돌릴 수 없어요. 대시보드에서 최근 횟수를 취소해 주세요.')
    } catch {
      setDetectError('되돌릴 수 없어요. 대시보드에서 최근 횟수를 취소해 주세요.')
    } finally {
      setDetectBusy(false)
      await refresh().catch(() => undefined)
    }
  }

  useEffect(() => {
    let currentIgnore: boolean | null = null
    let cursorFrame = 0

    // 화분과 물뿌리개 바깥의 투명한 영역은 아래 창으로 클릭을 전달한다.
    const updatePassthrough = (ignore: boolean): void => {
      if (currentIgnore === ignore) return
      currentIgnore = ignore
      window.gardenWindow?.setMousePassthrough(ignore)
    }

    const onMouseMove = (event: MouseEvent): void => {
      const target = event.target
      const isInteractive = target instanceof Element && target.closest('[data-garden-interactive]')
      updatePassthrough(!gesture.current && !isInteractive)
    }

    const onMouseLeave = (): void => updatePassthrough(!gesture.current)
    const unsubscribeCapture = window.gardenWindow?.onMouseCaptureReady(() => {
      // 클릭 통과를 해제한 뒤 커서 스타일을 다시 계산한다.
      window.cancelAnimationFrame(cursorFrame)
      document.documentElement.classList.add('garden-refresh-cursor')
      cursorFrame = window.requestAnimationFrame(() => {
        cursorFrame = window.requestAnimationFrame(() => {
          document.documentElement.classList.remove('garden-refresh-cursor')
        })
      })
    })
    const unsubscribe = window.gardenWindow?.onDragCancelled(() => {
      gesture.current = null
      suppressClick.current = false
      updatePassthrough(true)
    })
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseleave', onMouseLeave)
    updatePassthrough(true)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseleave', onMouseLeave)
      unsubscribeCapture?.()
      window.cancelAnimationFrame(cursorFrame)
      document.documentElement.classList.remove('garden-refresh-cursor')
      unsubscribe?.()
      updatePassthrough(true)
    }
  }, [])

  return (
    <main className="garden-surface" aria-label="작은 정원">
      <div
        className={`garden-widget ${isOpen ? 'is-open' : ''} ${pouring ? 'is-pouring' : ''} ${celebrating ? 'is-detected' : ''}`}
      >
        <button
          className="garden-plant"
          type="button"
          data-garden-interactive
          aria-label={isOpen ? '물뿌리개 닫기' : '물뿌리개 보기'}
          aria-expanded={isOpen}
          aria-controls="garden-watering-can"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={cancelDrag}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false
              return
            }
            if (!pouring) setIsOpen((open) => !open)
          }}
        >
          <span
            className="garden-layer"
            key={state.plantStage}
            aria-hidden="true"
            style={{ '--rim': `${rim / 8}%` } as CSSProperties}
          >
            <span className="garden-box">
              <img className="garden-base" src={source} alt="" />
              <span className="garden-top-wrap">
                <img
                  className="garden-top"
                  src={source}
                  alt=""
                  style={filter ? { filter } : undefined}
                />
              </span>
            </span>
          </span>
        </button>
        <button
          id="garden-watering-can"
          className="garden-can"
          type="button"
          data-garden-interactive
          disabled={busy || cancelBusy || pouring || state.status !== 'ready'}
          aria-label={
            state.status === 'ready'
              ? '다 비운 텀블러 기록하기'
              : '목표를 설정해야 물을 기록할 수 있어요'
          }
          onClick={() => void record()}
        >
          <img src={wateringCan} alt="" />
        </button>
        {pouring && (
          <span className="garden-water" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} style={{ animationDelay: `${i * 85}ms` }} />
            ))}
          </span>
        )}
        {celebrating && (
          <span className="garden-detect-drop" aria-hidden="true">
            {DROPS.map(([x, delay], index) => (
              <i
                key={index}
                style={{ '--x': `${x}px`, animationDelay: `${delay}ms` } as CSSProperties}
              />
            ))}
            <b />
          </span>
        )}
        {detected !== null && state.status === 'ready' && (
          <span className="garden-detected" role="status" data-garden-interactive>
            <span className="garden-detected-mark" aria-label="카메라가 물 마신 것을 기록했어요">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 3.5c-3 3.6-5.5 6.6-5.5 9.6a5.5 5.5 0 0 0 11 0c0-3-2.5-6-5.5-9.6Z"
                  fill="currentColor"
                />
                <path
                  d="m9.4 13.4 1.9 1.9 3.4-3.6"
                  stroke="#fff"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <button
              type="button"
              className="garden-detected-undo"
              aria-label="카메라 기록 되돌리기"
              disabled={detectBusy}
              onClick={() => void undoDetected()}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
              </svg>
              <span aria-hidden="true">되돌리기</span>
            </button>
          </span>
        )}
        {showUndo && latest && state.status === 'ready' && detected === null && (
          <button
            type="button"
            className="garden-undo"
            data-garden-interactive
            aria-label="최근 한 잔 취소"
            disabled={busy || cancelBusy}
            onClick={() => void undoLatest()}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          </button>
        )}
        {(error || cancelError || dragError || detectError) && (
          <span className="garden-error" role="alert" data-garden-interactive>
            {cancelError || error || dragError || detectError}
            {retryable && (
              <button
                type="button"
                className="garden-retry"
                disabled={cancelBusy}
                onClick={() => void retry()}
              >
                다시 시도
              </button>
            )}
          </span>
        )}
      </div>
    </main>
  )
}

export default Garden
