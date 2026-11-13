import { useRef, useState } from 'react'
import { isMlInput } from '../water/mlInput'
import wordmark from '../../assets/icons/wordmark.webp'
import stage1 from '../../assets/stage1.webp'
import stage2 from '../../assets/stage2.webp'
import stage3 from '../../assets/stage3.webp'
import stage4 from '../../assets/stage4.webp'
import can from '../../assets/icons/watering-can.webp'
import statLeft from '../../assets/icons/stat-left.webp'
import statCups from '../../assets/icons/stat-cups.webp'

const glassHeight = (value: number): number =>
  Math.round(40 + (Math.min(value || 0, 1000) / 1000) * 120)

function Onboarding({ onComplete }: { onComplete: () => Promise<void> }): React.JSX.Element {
  const [step, setStep] = useState(0)
  const [goal, setGoal] = useState('')
  const [cup, setCup] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(crypto.randomUUID())

  function next(): void {
    if ((step === 1 && !isMlInput(goal)) || (step === 2 && !isMlInput(cup))) {
      setError('1ml 이상, 숫자로 입력해 주세요')
      return
    }
    setError('')
    setStep((current) => current + 1)
  }
  function change(value: string, setter: (value: string) => void): void {
    setter(value)
    setError('')
  }
  function adjust(value: string, setter: (value: string) => void, amount: number): void {
    const result = Math.max(0, (Number(value) || 0) + amount)
    change(result && Number.isSafeInteger(result) ? String(result) : '', setter)
  }
  async function submit(): Promise<void> {
    if (busy || !isMlInput(goal) || !isMlInput(cup)) return
    setBusy(true)
    setError('')
    try {
      const response = await window.hanzanhae.completeSetup({
        requestId: requestId.current,
        goalMl: Number(goal),
        cupMl: Number(cup)
      })
      if (response.ok || response.code === 'ALREADY_CONFIGURED') await onComplete()
      else setError('저장하지 못했어요. 다시 시도해 주세요.')
    } catch {
      setError('저장 결과를 확인하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }
  const amountField = (
    id: string,
    value: string,
    setter: (value: string) => void,
    increment: number,
    label: string
  ): React.JSX.Element => (
    <div className={`amount-field ${error ? 'bad' : ''}`}>
      <button
        type="button"
        className="step-btn"
        onClick={() => adjust(value, setter, -increment)}
        aria-label={`${increment}ml 줄이기`}
      >
        −
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min="1"
        step="1"
        placeholder="0"
        aria-label={label}
        aria-invalid={!!error}
        aria-describedby={`${id}-message`}
        value={value}
        onChange={(event) => change(event.target.value, setter)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') next()
        }}
        autoFocus
      />
      <span className="unit">ml</span>
      <button
        type="button"
        className="step-btn"
        onClick={() => adjust(value, setter, increment)}
        aria-label={`${increment}ml 늘리기`}
      >
        +
      </button>
    </div>
  )
  return (
    <div className="window setup">
      <section className="onboard" aria-label="처음 설정">
        <div className="ob-top">
          <div className="lights" aria-hidden="true" />
          <div className="ob-dots" aria-label={`설정 ${step + 1}단계 / 4단계`}>
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className={step === i ? 'on' : ''} />
            ))}
          </div>
          <span style={{ width: 52 }} />
        </div>
        <div className={`ob-body ${step === 0 ? 'ob-body-welcome' : ''}`}>
          <div className="ob-step on" key={step}>
            {step === 0 && (
              <>
                <img className="wordmark" src={wordmark} alt="한잔해" />
                <h1>
                  물을 마시는 작은 습관으로
                  <br />
                  나만의 화분을 키워요
                </h1>
                <p className="lead">
                  물을 마신 뒤 화분에 물을 주면 화분이 자라요.
                  <br />
                  시작하기 전에 두 가지만 정해 주세요.
                </p>
              </>
            )}
            {step === 1 && (
              <>
                <span className="eyebrow">1 / 2</span>
                <h1>하루에 물을 얼마나 마실까요?</h1>
                <p className="lead">
                  하루 목표를 채우면 화분이 자라요.
                  <br />
                  설정에서 언제든 바꿀 수 있어요.
                </p>
                {amountField('goal', goal, setGoal, 100, '하루 목표(ml)')}
                <div
                  id="goal-message"
                  className={`field-msg ${error ? 'bad' : ''}`}
                  role={error ? 'alert' : undefined}
                >
                  {error || 'ml 단위로 입력해 주세요'}
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <span className="eyebrow">2 / 2</span>
                <h1>한 번 마실 때 얼마나 마시나요?</h1>
                <p className="lead">
                  물뿌리개를 한 번 누르면 이만큼 기록돼요.
                  <br />
                  평소 쓰는 컵이나 텀블러를 떠올려 주세요.
                </p>
                <div className="cup-preview">
                  <span
                    className="glass"
                    style={{ height: glassHeight(Number(cup)) }}
                    aria-hidden="true"
                  >
                    <i style={{ height: '85%' }} />
                  </span>
                  {amountField('cup', cup, setCup, 50, '한 잔 용량(ml)')}
                </div>
                <div
                  id="cup-message"
                  className={`field-msg ${error ? 'bad' : ''}`}
                  role={error ? 'alert' : undefined}
                >
                  {error ||
                    (isMlInput(cup)
                      ? `하루 목표까지 약 ${Math.ceil(Number(goal) / Number(cup))}잔이에요`
                      : 'ml 단위로 입력해 주세요')}
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <div className="ob-done-art">
                  <img className="pot" src={stage1} alt="새싹 화분" />
                  <img className="can" src={can} alt="" />
                </div>
                <h1>준비됐어요!</h1>
                <div className="chips">
                  <span>
                    <img src={statLeft} alt="" />
                    하루 <b className="num">{Number(goal).toLocaleString('ko-KR')}ml</b>
                  </span>
                  <span>
                    <img src={statCups} alt="" />한 잔{' '}
                    <b className="num">{Number(cup).toLocaleString('ko-KR')}ml</b>
                  </span>
                </div>
                <p className="lead">
                  화분은 Dock 위에 놓아둘게요.
                  <br />
                  물을 마시고 화분에 물을 주세요.
                </p>
                {error && (
                  <p className="field-msg bad" role="alert">
                    {error}
                  </p>
                )}
              </>
            )}
            <div className="ob-actions">
              {step > 0 && (
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() => {
                    setError('')
                    setStep(step - 1)
                  }}
                >
                  이전
                </button>
              )}
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => (step === 3 ? void submit() : next())}
              >
                {busy
                  ? '저장하고 있어요'
                  : step === 0
                    ? '시작하기'
                    : step === 3
                      ? '화분 키우기 시작'
                      : '다음'}
              </button>
            </div>
          </div>
        </div>
        <div className="ob-garden" aria-hidden="true">
          {[stage1, stage2, stage3, stage4].map((src, index) => (
            <img key={src} className={`p${index + 1}`} src={src} alt="" />
          ))}
        </div>
      </section>
    </div>
  )
}
export default Onboarding
