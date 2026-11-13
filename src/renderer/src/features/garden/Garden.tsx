import { useEffect, useState } from 'react'
import type { AppState } from '../../../../shared/appState'
import { useRecordCup } from '../water/useRecordCup'
import stage1 from '../../assets/stage1.webp'
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
  const { record, busy, error } = useRecordCup(state, refresh)

  useEffect(() => {
    let timer: number | undefined
    const unsubscribe = window.hanzanhae.onWaterRecorded(() => {
      window.clearTimeout(timer)
      setIsOpen(true)
      setPouring(true)
      timer = window.setTimeout(() => {
        setPouring(false)
        setIsOpen(false)
      }, 1700)
    })
    return () => {
      window.clearTimeout(timer)
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
          <span className="garden-layer" aria-hidden="true">
            <span className="garden-box">
              <img className="garden-base" src={stage1} alt="" />
              <span className="garden-top-wrap">
                <img className="garden-top" src={stage1} alt="" />
              </span>
            </span>
          </span>
        </button>
        <button
          id="garden-watering-can"
          className="garden-can"
          type="button"
          data-garden-interactive
          disabled={busy || pouring || state.status !== 'ready'}
          aria-label={
            state.status === 'ready' ? '물 한 잔 기록하기' : '목표를 설정해야 물을 기록할 수 있어요'
          }
          title={
            state.status === 'ready'
              ? `물 한 잔 기록하기 (+${state.cupMl}ml)`
              : '설정에서 새 목표를 시작해 주세요'
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
        {error && (
          <span className="garden-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </main>
  )
}

export default Garden
