import { useEffect, useState } from 'react'
import stage1 from '../../assets/stage1.webp'
import wateringCan from '../../assets/icons/watering-can.webp'
import './garden.css'

function Garden(): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)

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
    <main className="garden-surface" aria-label="정원 미리보기">
      <div className={`garden-widget ${isOpen ? 'is-open' : ''}`}>
        <button
          className="garden-plant"
          type="button"
          data-garden-interactive
          aria-label={isOpen ? '물뿌리개 닫기' : '물뿌리개 보기'}
          aria-expanded={isOpen}
          aria-controls="garden-watering-can"
          onClick={() => setIsOpen((open) => !open)}
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
          disabled
          aria-label="물 마시기 기록은 목표 설정 후 사용할 수 있어요"
          title="목표 설정과 물 기록 기능은 아직 준비 중이에요"
        >
          <img src={wateringCan} alt="" />
        </button>
      </div>
    </main>
  )
}

export default Garden
