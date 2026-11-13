import { useEffect, useState, type CSSProperties } from 'react'
import type { AppState } from '../../../../shared/appState'
import { useRecordCup } from '../water/useRecordCup'
import { useCancelWater } from '../water/useCancelWater'
import { plantImage, plantIndex, plants } from '../plant/plantVisual'
import wateringCan from '../../assets/icons/watering-can.webp'
import './garden.css'

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
  const [watered, setWatered] = useState(false)
  const plant = plants[plantIndex(state.plantStage)]
  const source = plantImage(state.plantStage, state.plantVitality, watered)
  const rim =
    watered && state.plantStage === 'young'
      ? 436
      : watered && state.plantStage === 'flower'
        ? 436
        : state.plantVitality < 45 && state.plantStage === 'leafy'
          ? 412
          : plant.rim
  const faded =
    state.plantVitality < 100 && (state.plantStage === 'seedling' || state.plantStage === 'flower')
  const dry = (100 - state.plantVitality) / 100
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
    let wateredTimer: number | undefined
    const unsubscribe = window.hanzanhae.onWaterRecorded(() => {
      window.clearTimeout(timer)
      window.clearTimeout(undoTimer)
      window.clearTimeout(wateredTimer)
      setWatered(true)
      wateredTimer = window.setTimeout(() => setWatered(false), 2600)
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
      window.clearTimeout(wateredTimer)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let currentIgnore: boolean | null = null

    // 화분과 물뿌리개 바깥의 투명한 영역은 아래 창으로 클릭을 전달한다.
    const updatePassthrough = (ignore: boolean): void => {
      if (currentIgnore === ignore) return
      currentIgnore = ignore
      window.gardenWindow?.setMousePassthrough(ignore)
    }

    const onMouseMove = (event: MouseEvent): void => {
      const target = event.target
      const isInteractive = target instanceof Element && target.closest('[data-garden-interactive]')
      updatePassthrough(!isInteractive)
    }

    const onMouseLeave = (): void => updatePassthrough(true)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseleave', onMouseLeave)
    updatePassthrough(true)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseleave', onMouseLeave)
      updatePassthrough(true)
    }
  }, [])

  return (
    <main className="garden-surface" aria-label="작은 정원">
      <div className={`garden-widget ${isOpen ? 'is-open' : ''} ${pouring ? 'is-pouring' : ''}`}>
        <button
          className="garden-plant"
          type="button"
          data-garden-interactive
          aria-label={isOpen ? '물뿌리개 닫기' : '물뿌리개 보기'}
          aria-expanded={isOpen}
          aria-controls="garden-watering-can"
          onClick={() => {
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
                  style={
                    faded
                      ? {
                          filter: `saturate(${1 - dry * 0.65}) sepia(${dry * 0.4}) brightness(${1 - dry * 0.06})`
                        }
                      : undefined
                  }
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
            state.status === 'ready' ? '물 한 잔 기록하기' : '목표를 설정해야 물을 기록할 수 있어요'
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
        {showUndo && latest && state.status === 'ready' && (
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
        {(error || cancelError) && (
          <span className="garden-error" role="alert" data-garden-interactive>
            {cancelError || error}
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
