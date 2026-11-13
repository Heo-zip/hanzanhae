import { useEffect, useState } from 'react'
import type { AppState, SettingsInput, WaterStatistics } from '../../../../shared/appState'
import { useRecordCup } from '../water/useRecordCup'
import { useCancelWater } from '../water/useCancelWater'
import { isMlInput } from '../water/mlInput'
import ClearTodayDialog, { type ClearTodaySnapshot } from './ClearTodayDialog'
import { useWaterStatistics } from '../statistics/useWaterStatistics'
import { WeekChart, WeekCups } from '../statistics/WaterStatistics'
import { dayLabel } from '../statistics/dateLabels'
import logo from '../../assets/icons/logo.webp'
import wordmark from '../../assets/icons/wordmark.webp'
import navToday from '../../assets/icons/nav-today.webp'
import navHistory from '../../assets/icons/nav-history.webp'
import navSettings from '../../assets/icons/nav-settings.webp'
import statLeft from '../../assets/icons/stat-left.webp'
import statCups from '../../assets/icons/stat-cups.webp'
import statStreak from '../../assets/icons/stat-streak.webp'
import statVitality from '../../assets/icons/stat-vit.webp'
import drop from '../../assets/icons/drop.webp'
import { plantImage, plantIndex, plants as stages } from '../plant/plantVisual'
import './dashboard.css'

// 대시보드에서 선택할 수 있는 화면을 세 가지로 제한한다.
type View = 'today' | 'history' | 'settings'

const navItems: { view: View; label: string; icon: string }[] = [
  { view: 'today', label: '오늘', icon: navToday },
  { view: 'history', label: '기록', icon: navHistory },
  { view: 'settings', label: '설정', icon: navSettings }
]

const format = (value: number): string => value.toLocaleString('ko-KR')

// 앱의 하루 기준인 한국 시간으로 날짜와 기록 시각을 표시한다.
const dayFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
  weekday: 'short'
})
const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

// 오늘 화면과 기록 화면에서 같은 형태의 요약 수치를 재사용한다.
function Metric({
  icon,
  label,
  value,
  unit
}: {
  icon: string
  label: string
  value: string | number
  unit: string
}): React.JSX.Element {
  return (
    <div className="tile">
      <img className="ic" src={icon} alt="" />
      <div>
        <span>{label}</span>
        <b className="num">
          {value}
          <small>{unit}</small>
        </b>
      </div>
    </div>
  )
}

function Glass({ percent, height }: { percent: number; height?: number }): React.JSX.Element {
  // 목표를 초과해도 컵의 물은 컵 높이를 넘지 않도록 제한한다.
  return (
    <span className="glass" style={height ? { height } : undefined} aria-hidden="true">
      <i style={{ height: `${Math.min(100, percent)}%` }} />
    </span>
  )
}

// 실제 물 기록과 기섭취량 조정을 함께 보여준다.
function Today({
  onSettings,
  state,
  refresh,
  statistics,
  statisticsError,
  refreshStatistics
}: {
  onSettings: () => void
  state: Extract<AppState, { status: 'ready' }>
  refresh: () => Promise<void>
  statistics: WaterStatistics | null
  statisticsError: boolean
  refreshStatistics: () => void
}): React.JSX.Element {
  const { goalMl, cupMl, todayMl, todayRecords } = state
  const { record, busy, error } = useRecordCup(state, refresh)
  const {
    cancel,
    retry,
    busy: cancelBusy,
    error: cancelError,
    retryable,
    errorCode
  } = useCancelWater(refresh)
  const [cancelNotice, setCancelNotice] = useState('')
  const [watered, setWatered] = useState(false)
  const [waterPulse, setWaterPulse] = useState(0)
  useEffect(() => {
    let timer: number | undefined
    const unsubscribe = window.hanzanhae.onWaterRecorded(() => {
      window.clearTimeout(timer)
      setWatered(true)
      setWaterPulse((value) => value + 1)
      timer = window.setTimeout(() => setWatered(false), 2600)
    })
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [])
  const [clearSnapshot, setClearSnapshot] = useState<ClearTodaySnapshot | null>(null)
  const [modalAttempted, setModalAttempted] = useState(false)
  const currentRecords = state.todayRecords.filter((item) => item.goalId === state.goalId)
  const latest = currentRecords[0]

  async function cancelLatest(): Promise<void> {
    if (!latest) return
    setCancelNotice('')
    if (
      await cancel({
        kind: 'latest',
        expectedGoalId: state.goalId,
        day: state.day,
        recordId: latest.id
      })
    )
      setCancelNotice('최근 한 잔을 취소했어요.')
  }

  function openCancelToday(): void {
    if (currentRecords.length === 0 || retryable) return
    setCancelNotice('')
    setModalAttempted(false)
    setClearSnapshot({
      goalId: state.goalId,
      goalMl: state.goalMl,
      day: state.day,
      todayMl: state.todayMl,
      adjustmentMl:
        state.todayMl - state.todayRecords.reduce((sum, item) => sum + item.amountMl, 0),
      records: currentRecords.map((item) => ({ id: item.id, amountMl: item.amountMl }))
    })
  }

  async function cancelToday(): Promise<boolean> {
    if (!clearSnapshot) return false
    setModalAttempted(true)
    const success = await cancel({
      kind: 'today',
      expectedGoalId: clearSnapshot.goalId,
      day: clearSnapshot.day,
      expectedRecordIds: clearSnapshot.records.map((item) => item.id)
    })
    if (success) setCancelNotice('오늘 현재 목표 기록을 취소했어요.')
    return success
  }

  async function retryCancelToday(): Promise<boolean> {
    setModalAttempted(true)
    const success = await retry()
    if (success) setCancelNotice('오늘 현재 목표 기록을 취소했어요.')
    return success
  }
  const today = dayFormat.format(new Date())
  const percent = Math.min(100, Math.round((todayMl / goalMl) * 100))
  const stageIndex = plantIndex(state.plantStage)
  const stage = stages[stageIndex]

  return (
    <section className="view on" aria-label="오늘">
      <div className="today-grid">
        <div className="col main-col">
          <div className="hero">
            <div className="msg">
              <div className="hi">{today}</div>
              <h1>
                {todayMl >= goalMl ? (
                  <>
                    오늘 목표 달성!
                    <br />
                    <em>{stage.name}</em>이 활짝 웃어요
                  </>
                ) : state.plantVitality < 45 ? (
                  <>
                    화분이 목말라 해요
                    <br />물 <em>한 잔</em> 어때요?
                  </>
                ) : todayRecords.length === 0 ? (
                  <>
                    화분이 오늘의
                    <br />
                    <em>첫 잔</em>을 기다려요
                  </>
                ) : (
                  <>
                    오늘 <em>{todayRecords.length}잔</em> 마셨어요
                    <br />
                    화분이 생생해요
                  </>
                )}
              </h1>
              <p>
                {todayMl >= goalMl
                  ? '오늘 목표를 달성했어요!'
                  : `목표까지 ${format(goalMl - todayMl)}ml 남았어요.`}
              </p>
              <div className="grow">
                <div className="steps" aria-hidden="true">
                  {stages.map((item, index) => (
                    <i key={item.id} className={index <= stageIndex ? 'on' : undefined} />
                  ))}
                </div>
                <span>
                  {stage.name} ·{' '}
                  {stageIndex === stages.length - 1
                    ? '활짝 피었어요'
                    : `${stages[stageIndex + 1].name}으로 자라고 있어요`}
                </span>
              </div>
            </div>
            <div className="pot">
              <img
                key={waterPulse}
                className={watered ? 'wobble' : undefined}
                src={plantImage(state.plantStage, state.plantVitality, watered)}
                alt={`${stage.name} 화분`}
              />
            </div>
          </div>
          <div className="card today">
            <div className="today-top">
              <div>
                <h2>오늘 마신 물</h2>
                <div className="big num">
                  <b>{format(todayMl)}</b>
                  <span>ml</span>
                </div>
                <div className="sub">
                  {todayMl >= goalMl
                    ? '오늘 목표를 달성했어요!'
                    : `목표까지 ${format(goalMl - todayMl)}ml 남았어요`}
                </div>
              </div>
              <div className="today-actions">
                <button className="goal-link" onClick={onSettings}>
                  목표 <span className="num">{format(goalMl)}</span>ml ›
                </button>
                <button
                  className="drink"
                  disabled={busy || cancelBusy}
                  onClick={() => void record()}
                >
                  <img src={drop} alt="" width="20" height="20" /> 한 잔 마셨어요{' '}
                  <small>+{cupMl}ml</small>
                </button>
              </div>
            </div>
            {error && (
              <p className="water-error" role="alert">
                {error}
              </p>
            )}
            <div className="track" aria-label={`목표 진행률 ${percent}%`}>
              <div className="fill" style={{ width: `${percent}%` }} />
              <div className="thumb" style={{ left: `${percent}%` }}>
                <b className="num">{percent}%</b>
                <img src={drop} alt="" width="38" height="38" />
              </div>
            </div>
            <div className="ends">
              <span>0</span>
              <span className="num">{format(goalMl)}ml</span>
            </div>
          </div>
          <div className="tiles">
            <Metric
              icon={statLeft}
              label="남은 양"
              value={format(Math.max(0, goalMl - todayMl))}
              unit="ml"
            />
            <Metric icon={statCups} label="오늘 마신 잔" value={todayRecords.length} unit="잔" />
            <Metric
              icon={statStreak}
              label="연속 달성"
              value={statistics?.streak ?? '—'}
              unit={statistics ? '일' : ''}
            />
            <Metric icon={statVitality} label="화분 생기" value={state.plantVitality} unit="%" />
          </div>
        </div>
        <div className="col side-col">
          <div className="card plain">
            <h2>
              최근 7일 <small>점선은 하루 목표</small>
            </h2>
            {statistics ? (
              <WeekChart days={statistics.days} />
            ) : (
              <StatisticsStatus error={statisticsError} retry={refreshStatistics} />
            )}
          </div>
          <div className="card plain stretch">
            <h2>
              오늘 기록{' '}
              <button
                className="plain-action"
                disabled={busy || cancelBusy || retryable || currentRecords.length === 0}
                onClick={openCancelToday}
              >
                전체 취소
              </button>
            </h2>
            {cancelNotice && (
              <p className="water-status" role="status">
                {cancelNotice}
              </p>
            )}
            {cancelError && (
              <p className="water-error" role="alert">
                {cancelError}{' '}
                {retryable && (
                  <button
                    className="cancel-retry"
                    disabled={cancelBusy}
                    onClick={() => void retry()}
                  >
                    다시 시도
                  </button>
                )}
              </p>
            )}
            {todayRecords.length === 0 && <p>아직 오늘의 물 기록이 없어요.</p>}
            <ul className="records">
              {todayRecords.map((record) => (
                <li key={record.id}>
                  <span className="dot">
                    <img src={drop} alt="" />
                  </span>
                  <span className="num">{format(record.amountMl)}ml</span>
                  <span className="t num">{timeFormat.format(new Date(record.recordedAt))}</span>
                  {record.id === latest?.id && (
                    <button
                      disabled={busy || cancelBusy || retryable}
                      onClick={() => void cancelLatest()}
                    >
                      최근 한 잔 취소
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {clearSnapshot && (
        <ClearTodayDialog
          plantStage={state.plantStage}
          snapshot={clearSnapshot}
          currentTodayMl={state.todayMl}
          busy={cancelBusy}
          error={cancelError}
          errorCode={errorCode}
          retryable={retryable}
          attempted={modalAttempted}
          onDismiss={() => setClearSnapshot(null)}
          onConfirm={cancelToday}
          onRetry={retryCancelToday}
          onSettings={onSettings}
        />
      )}
    </section>
  )
}

function StatisticsStatus({
  error,
  retry
}: {
  error: boolean
  retry: () => void
}): React.JSX.Element {
  return error ? (
    <p role="alert">
      통계를 불러오지 못했어요.{' '}
      <button className="cancel-retry" onClick={retry}>
        다시 시도
      </button>
    </p>
  ) : (
    <p role="status">통계를 불러오고 있어요.</p>
  )
}

function History({
  state,
  statistics,
  statisticsError,
  refreshStatistics
}: {
  state: ConfiguredState
  statistics: WaterStatistics | null
  statisticsError: boolean
  refreshStatistics: () => void
}): React.JSX.Element {
  const current = plantIndex(state.plantStage)
  return (
    <section className="view on" aria-label="기록">
      <div className="head">
        <h1>기록</h1>
        <span>내 화분이 자라온 길</span>
      </div>
      <div className="hist-grid">
        <div className="card journey">
          <h2>
            성장 여정 <small>누적 성장량에 따라 자라요</small>
          </h2>
          <div className="stages">
            {stages.map((stage, index) => (
              <div
                key={stage.name}
                className={`stage ${index < current ? 'done' : index === current ? 'done now' : 'todo'}`}
              >
                <img src={stage.image} alt={`${stage.name} 화분`} />
                <b>{stage.name}</b>
                <span>{index === 0 ? '시작' : index <= current ? '도달했어요' : '성장 단계'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card plain week-cups">
          <h2>
            최근 7일 물컵 <small>컵이 가득 차면 그날 목표 달성</small>
          </h2>
          {statistics ? (
            <>
              <WeekCups days={statistics.days} />
              <p className="stats-note">평균과 달성 횟수는 목표가 있던 날을 기준으로 해요.</p>
            </>
          ) : (
            <StatisticsStatus error={statisticsError} retry={refreshStatistics} />
          )}
        </div>
        <div className="col summary">
          <Metric
            icon={statCups}
            label="하루 평균"
            value={statistics?.averageMl != null ? format(statistics.averageMl) : '—'}
            unit={statistics?.averageMl != null ? 'ml' : ''}
          />
          <Metric
            icon={statStreak}
            label="목표 달성"
            value={statistics ? statistics.achievedDays : '—'}
            unit={statistics ? `/ ${statistics.trackedDays}일` : ''}
          />
          <Metric
            icon={statLeft}
            label="가장 많이 마신 날"
            value={
              statistics?.bestDay
                ? dayLabel(
                    statistics.bestDay.day,
                    statistics.bestDay.day === statistics.days[6].day
                  )
                : '—'
            }
            unit={statistics?.bestDay ? `${format(statistics.bestDay.totalMl)}ml` : ''}
          />
        </div>
      </div>
    </section>
  )
}

type ConfiguredState = Exclude<AppState, { status: 'setup-required' }>

function Settings({
  state,
  refresh
}: {
  state: ConfiguredState
  refresh: () => Promise<void>
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [goal, setGoal] = useState('')
  const [total, setTotal] = useState(String(state.todayMl))
  const [snapshot, setSnapshot] = useState({
    goalId: state.status === 'ready' ? state.goalId : null,
    todayMl: state.todayMl,
    day: state.day
  })
  const [cup, setCup] = useState(String(state.cupMl))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const goalId = state.status === 'ready' ? state.goalId : null

  async function save(input: SettingsInput): Promise<boolean> {
    if (busy) return false
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const response = await window.hanzanhae.updateSettings(input)
      if (response.ok) {
        await refresh()
        return true
      }
      if (response.code === 'STALE_STATE') {
        await refresh()
        setError('목표 또는 오늘 기록이 변경됐어요. 취소 후 다시 확인해 주세요.')
      } else setError('저장하지 못했어요. 다시 시도해 주세요.')
    } catch {
      setError('저장 결과를 확인하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
    return false
  }
  async function saveGoal(): Promise<void> {
    if (!isMlInput(goal) || !isMlInput(total, true)) {
      setError('목표는 1ml 이상, 오늘 마신 양은 0ml 이상으로 입력해 주세요.')
      return
    }
    if (
      await save({
        requestId: crypto.randomUUID(),
        kind: 'goal',
        goalMl: Number(goal),
        todayMl: Number(total),
        expectedTodayMl: snapshot.todayMl,
        expectedGoalId: snapshot.goalId,
        day: snapshot.day
      })
    ) {
      setEditing(false)
      setMessage('새 목표로 시작했어요.')
    }
  }
  async function saveCup(): Promise<void> {
    if (!isMlInput(cup)) {
      setError('한 잔 용량을 1ml 이상으로 입력해 주세요.')
      return
    }
    if (Number(cup) === state.cupMl) return
    if (await save({ requestId: crypto.randomUUID(), kind: 'cup', cupMl: Number(cup) }))
      setMessage('한 잔 용량을 저장했어요.')
  }
  async function stopGoal(): Promise<void> {
    if (goalId === null || !window.confirm('현재 목표를 멈출까요? 기존 기록과 화분은 유지돼요.'))
      return
    if (await save({ requestId: crypto.randomUUID(), kind: 'stop', expectedGoalId: goalId }))
      setMessage('목표를 멈췄어요. 새 목표를 설정할 수 있어요.')
  }
  return (
    <section className="view on" aria-label="설정">
      <div className="head">
        <h1>설정</h1>
        <span>기록은 이 Mac에만 저장돼요</span>
      </div>
      <div className="settings">
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="settings-saved" role="status">
            {message}
          </p>
        )}
        <section className="sset">
          <div className="sset-head">
            <h2>하루 목표</h2>
            <p>
              목표를 바꾸면 지금 목표는 멈추고 새 목표로 이어서 기록해요. 지금까지의 기록과 화분은
              그대로 남아요.
            </p>
          </div>
          <div>
            <div className="goal-row">
              <div className="goal-big num">
                {state.status === 'ready' ? (
                  <>
                    <b>{format(state.goalMl)}</b>
                    <span>ml</span>
                  </>
                ) : (
                  <b>목표 없음</b>
                )}
              </div>
              <div className="goal-actions">
                <button
                  className="btn line"
                  disabled={busy}
                  onClick={() => {
                    setGoal('')
                    setTotal(String(state.todayMl))
                    setSnapshot({ goalId, todayMl: state.todayMl, day: state.day })
                    setError('')
                    setMessage('')
                    setEditing(true)
                  }}
                >
                  {state.status === 'ready' ? '목표 바꾸기' : '새 목표 설정'}
                </button>
                {state.status === 'ready' && (
                  <button
                    className="btn ghost danger"
                    disabled={busy}
                    onClick={() => void stopGoal()}
                  >
                    멈추기
                  </button>
                )}
              </div>
            </div>
            {editing && (
              <div className="goal-edit on">
                <div className="fields">
                  <label>
                    새 하루 목표
                    <span className="mini-field">
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        placeholder="0"
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
                      />
                      <span>ml</span>
                    </span>
                  </label>
                  <label>
                    오늘 이미 마신 양
                    <span className="mini-field">
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={total}
                        onChange={(e) => setTotal(e.target.value)}
                      />
                      <span>ml</span>
                    </span>
                  </label>
                </div>
                <p className="note">
                  앱에 기록하지 않고 마신 물이 있다면 오늘 마신 양에 함께 적어 주세요. 이미 기록한
                  양에 다시 더하지 않아요.
                </p>
                <div className="row-btns">
                  <button
                    className="btn ghost"
                    disabled={busy}
                    onClick={() => {
                      setEditing(false)
                      setError('')
                    }}
                  >
                    취소
                  </button>
                  <button className="btn primary" disabled={busy} onClick={() => void saveGoal()}>
                    새 목표로 시작
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
        <section className="sset">
          <div className="sset-head">
            <h2>한 잔 용량</h2>
            <p>물뿌리개를 한 번 누를 때 기록되는 양이에요. 바꾸면 다음 기록부터 적용돼요.</p>
          </div>
          <div className="cup-edit">
            <Glass
              percent={85}
              height={Math.round(40 + (Math.min(Number(cup) || 0, 1000) / 1000) * 120)}
            />
            <label className="mini-field">
              <input
                type="number"
                min="1"
                inputMode="numeric"
                aria-label="한 잔 용량"
                value={cup}
                onChange={(e) => setCup(e.target.value)}
                onBlur={() => void saveCup()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                disabled={busy}
              />
              <span>ml</span>
            </label>
          </div>
        </section>
        <section className="sset">
          <div className="sset-head">
            <h2>화분 놓는 곳</h2>
            <p>화분이 고정될 바닥을 골라요. 좌우 위치는 화분을 끌어서 옮겨요.</p>
          </div>
          <div className="place-pick">
            <button className="place on" disabled>
              <span className="mini">
                <i className="dock" />
                <img src={stages[2].image} alt="" className="on-dock" />
              </span>
              <b>Dock 위</b>
            </button>
            <button className="place" disabled>
              <span className="mini">
                <i className="dock" />
                <img src={stages[2].image} alt="" className="on-floor" />
              </span>
              <b>화면 바닥</b>
            </button>
          </div>
        </section>
        <section className="sset">
          <div className="sset-head">
            <h2>위젯 동작</h2>
            <p>일하는 동안 화분이 어떻게 보일지 정해요.</p>
          </div>
          <div className="group">
            <div className="set">
              <div>
                <b>다른 창 위에 표시</b>
                <small>업무 창에 가려지지 않게 해요</small>
              </div>
              <button
                className="switch"
                role="switch"
                aria-checked="true"
                aria-label="다른 창 위에 표시"
                disabled
              />
            </div>
            <div className="set">
              <div>
                <b>로그인 시 자동 실행</b>
                <small>Mac을 켜면 화분도 함께 떠요</small>
              </div>
              <button
                className="switch"
                role="switch"
                aria-checked="false"
                aria-label="로그인 시 자동 실행"
                disabled
              />
            </div>
          </div>
        </section>
        <section className="sset">
          <div className="sset-head">
            <h2>데이터</h2>
            <p>로그인 없이 쓰는 앱이에요.</p>
          </div>
          <p className="data-note">
            <img src={logo} alt="" />
            모든 기록은 이 Mac에만 저장되고, 다른 기기와 자동으로 동기화되지 않아요.
          </p>
        </section>
      </div>
    </section>
  )
}

function Dashboard({
  state,
  refresh
}: {
  state: ConfiguredState
  refresh: () => Promise<void>
}): React.JSX.Element {
  // 별도의 페이지 이동 없이 선택한 메뉴에 맞는 화면만 렌더링한다.
  const [view, setView] = useState<View>('today')
  const { statistics, error: statisticsError, refresh: refreshStatistics } = useWaterStatistics()

  return (
    <div className="window">
      <aside className="side">
        <div className="lights" aria-hidden="true" />
        <button className="brand" onClick={() => setView('today')} aria-label="오늘로 이동">
          <img className="mark" src={wordmark} alt="한잔해" />
        </button>
        <nav aria-label="대시보드 메뉴" className="navigation">
          {navItems.map((item) => (
            <button
              key={item.view}
              className={`nav ${view === item.view ? 'on' : ''}`}
              onClick={() => setView(item.view)}
              aria-current={view === item.view ? 'page' : undefined}
            >
              <img src={item.icon} alt="" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="foot">
          기록은 이 Mac에만 저장돼요.
          <br />
          로그인 없이 사용 중
        </div>
      </aside>
      <main>
        {view === 'today' &&
          (state.status === 'ready' ? (
            <Today
              onSettings={() => setView('settings')}
              state={state}
              refresh={refresh}
              statistics={statistics}
              statisticsError={statisticsError}
              refreshStatistics={refreshStatistics}
            />
          ) : (
            <section className="view on">
              <div className="head">
                <h1>진행 중인 목표가 없어요</h1>
              </div>
              <p>기존 기록과 화분은 그대로 남아 있어요.</p>
              <button className="btn line" onClick={() => setView('settings')}>
                새 목표 설정하기
              </button>
            </section>
          ))}
        {view === 'history' && (
          <History
            state={state}
            statistics={statistics}
            statisticsError={statisticsError}
            refreshStatistics={refreshStatistics}
          />
        )}
        {view === 'settings' && <Settings state={state} refresh={refresh} />}
      </main>
    </div>
  )
}

export default Dashboard
