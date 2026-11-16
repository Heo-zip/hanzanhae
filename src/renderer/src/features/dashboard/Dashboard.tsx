import { useEffect, useRef, useState } from 'react'
import type {
  AppState,
  SettingsInput,
  WaterStatistics,
  GardenSettings,
  GardenSettingsChange,
  DrinkActionInput,
  LoginItemResult
} from '../../../../shared/appState'
import { useRecordCup } from '../water/useRecordCup'
import { useCancelWater } from '../water/useCancelWater'
import { isMlInput } from '../water/mlInput'
import ClearTodayDialog, { type ClearTodaySnapshot } from './ClearTodayDialog'
import StopGoalDialog from './StopGoalDialog'
import { useWaterStatistics } from '../statistics/useWaterStatistics'
import { useCameraDetection, type CameraControl } from '../camera/useCameraDetection'
import { useCameraRecord } from '../camera/useCameraRecord'
import ReminderSettingsPanel from '../reminders/ReminderSettingsPanel'
import { WeekChart, WeekCups } from '../statistics/WaterStatistics'
import { dayLabel } from '../statistics/dateLabels'
import wordmark from '../../assets/icons/wordmark.webp'
import navToday from '../../assets/icons/nav-today.webp'
import navHistory from '../../assets/icons/nav-history.webp'
import navSettings from '../../assets/icons/nav-settings.webp'
import statLeft from '../../assets/icons/stat-left.webp'
import statCups from '../../assets/icons/stat-cups.webp'
import statStreak from '../../assets/icons/stat-streak.webp'
import statVitality from '../../assets/icons/stat-vit.webp'
import drop from '../../assets/icons/drop.webp'
import { plantFrame, plantIndex, plants as stages } from '../plant/plantVisual'
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
  const { goalCount, todayCount, cupMl, todayMl } = state
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
  const [drinkBusy, setDrinkBusy] = useState(false)
  const [drinkError, setDrinkError] = useState('')
  const [pendingDrinkKind, setPendingDrinkKind] = useState<'add' | 'undo' | null>(null)
  const drinkRunning = useRef(false)
  const pendingDrink = useRef<DrinkActionInput | null>(null)
  async function changeDrinkCount(kind: 'add' | 'undo'): Promise<void> {
    if (
      drinkRunning.current ||
      (kind === 'undo' && state.latestDrinkId === null && !pendingDrink.current)
    )
      return
    if (pendingDrink.current && pendingDrink.current.kind !== kind) {
      setDrinkError('이전 요청의 결과를 확인하도록 같은 버튼을 다시 눌러 주세요.')
      return
    }
    drinkRunning.current = true
    setDrinkBusy(true)
    setDrinkError('')
    const input: DrinkActionInput = pendingDrink.current ?? {
      requestId: crypto.randomUUID(),
      expectedGoalId: state.goalId,
      day: state.day,
      kind,
      ...(kind === 'undo' ? { recordId: state.latestDrinkId! } : {})
    }
    pendingDrink.current = input
    setPendingDrinkKind(kind)
    try {
      const response = await window.hanzanhae.recordDrinkAction(input)
      if (response.ok) {
        pendingDrink.current = null
        setPendingDrinkKind(null)
        await refresh()
      } else if (response.code === 'STALE_STATE' || response.code === 'VALIDATION_ERROR') {
        pendingDrink.current = null
        setPendingDrinkKind(null)
        await refresh()
        setDrinkError('목표나 기록이 바뀌었어요. 다시 확인해 주세요.')
      } else setDrinkError('횟수를 저장하지 못했어요. 같은 버튼을 눌러 다시 시도해 주세요.')
    } catch {
      setDrinkError('횟수를 저장하지 못했어요. 다시 시도해 주세요.')
    } finally {
      drinkRunning.current = false
      setDrinkBusy(false)
    }
  }
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
  // 오늘 기록 목록은 마신 횟수와 텀블러 기록을 시간순(최신 먼저)으로 함께 보여 준다.
  const timeline = [
    ...state.todayDrinks.map((record) => ({ kind: 'drink' as const, record })),
    ...state.todayRecords.map((record) => ({ kind: 'cup' as const, record }))
  ].sort((a, b) => b.record.recordedAt.localeCompare(a.record.recordedAt))
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
      setCancelNotice('최근 텀블러 기록을 취소했어요.')
  }

  function openCancelToday(): void {
    if ((currentRecords.length === 0 && state.todayCount === 0) || retryable) return
    setCancelNotice('')
    setModalAttempted(false)
    setClearSnapshot({
      goalId: state.goalId,
      goalCount: state.goalCount,
      day: state.day,
      drinkCount: state.todayCount,
      latestDrinkId: state.latestDrinkId,
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
      expectedRecordIds: clearSnapshot.records.map((item) => item.id),
      expectedDrinkCount: clearSnapshot.drinkCount,
      expectedLatestDrinkId: clearSnapshot.latestDrinkId
    })
    if (success) setCancelNotice('오늘 마신 횟수와 텀블러 기록을 취소했어요.')
    return success
  }

  async function retryCancelToday(): Promise<boolean> {
    setModalAttempted(true)
    const success = await retry()
    if (success) setCancelNotice('오늘 마신 횟수와 텀블러 기록을 취소했어요.')
    return success
  }
  const today = dayFormat.format(new Date())
  const percent = Math.min(100, Math.round((todayCount / goalCount) * 100))
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
                {todayCount >= goalCount ? (
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
                ) : todayCount === 0 ? (
                  <>
                    화분이 오늘의
                    <br />
                    <em>첫 잔</em>을 기다려요
                  </>
                ) : (
                  <>
                    오늘 <em>{todayCount}회</em> 마셨어요
                    <br />
                    화분이 생생해요
                  </>
                )}
              </h1>
              <p>
                {todayCount >= goalCount
                  ? '오늘 목표를 달성했어요!'
                  : `목표까지 ${format(goalCount - todayCount)}회 남았어요.`}
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
                src={plantFrame(state.plantStage, state.plantVitality).image}
                style={{ filter: plantFrame(state.plantStage, state.plantVitality).filter }}
                alt={`${stage.name} 화분`}
              />
            </div>
          </div>
          <div className="card today">
            <div className="today-top">
              <div>
                <h2>오늘 물 마신 횟수</h2>
                <div className="big num">
                  <b>{format(todayCount)}</b>
                  <span>회</span>
                </div>
                <div className="sub">
                  {todayCount >= goalCount
                    ? '오늘 목표를 달성했어요!'
                    : `목표까지 ${format(goalCount - todayCount)}회 남았어요`}
                </div>
              </div>
              <div className="today-actions">
                <div className="today-action-links">
                  <button className="goal-link" onClick={onSettings}>
                    목표 <span className="num">{format(goalCount)}</span>회 ›
                  </button>
                  <button
                    className="plain-action"
                    disabled={
                      drinkBusy || (state.latestDrinkId === null && pendingDrinkKind !== 'undo')
                    }
                    onClick={() => void changeDrinkCount('undo')}
                  >
                    최근 횟수 취소
                  </button>
                </div>
                <div className="today-primary-actions">
                  <button
                    className="drink"
                    disabled={drinkBusy}
                    onClick={() => void changeDrinkCount('add')}
                  >
                    물 마신 횟수 추가
                  </button>
                  <button
                    className="drink drink-outline"
                    disabled={busy || cancelBusy}
                    onClick={() => void record()}
                  >
                    <img src={drop} alt="" width="20" height="20" />
                    <span>텀블러 비우기</span> <small>+{cupMl}ml</small>
                  </button>
                </div>
              </div>
            </div>
            {error && (
              <p className="water-error" role="alert">
                {error}
              </p>
            )}
            {drinkError && (
              <p className="water-error" role="alert">
                {drinkError}
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
              <span className="num">{format(goalCount)}회</span>
            </div>
          </div>
          <div className="tiles">
            <Metric
              icon={statLeft}
              label="남은 횟수"
              value={format(Math.max(0, goalCount - todayCount))}
              unit="회"
            />
            <Metric icon={statCups} label="기록한 물" value={todayMl} unit="ml" />
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
                disabled={
                  busy ||
                  cancelBusy ||
                  retryable ||
                  (currentRecords.length === 0 && todayCount === 0)
                }
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
            {timeline.length === 0 && <p>아직 오늘의 물 기록이 없어요.</p>}
            <ul className="records">
              {timeline.map((item) =>
                item.kind === 'cup' ? (
                  <li key={`cup-${item.record.id}`}>
                    <span className="dot">
                      <img src={drop} alt="" />
                    </span>
                    <span className="num">{format(item.record.amountMl)}ml</span>
                    <span className="t num">
                      {timeFormat.format(new Date(item.record.recordedAt))}
                    </span>
                    {item.record.id === latest?.id && (
                      <button
                        disabled={busy || cancelBusy || retryable}
                        onClick={() => void cancelLatest()}
                      >
                        최근 텀블러 취소
                      </button>
                    )}
                  </li>
                ) : (
                  <li key={`drink-${item.record.id}`}>
                    <span className="dot">
                      <img src={statCups} alt="" />
                    </span>
                    <span>
                      물 <span className="num">1</span>회
                    </span>
                    <span className="t num">
                      {timeFormat.format(new Date(item.record.recordedAt))}
                    </span>
                    {item.record.id === state.latestDrinkId && (
                      <button
                        disabled={drinkBusy || pendingDrinkKind === 'add'}
                        onClick={() => void changeDrinkCount('undo')}
                      >
                        최근 횟수 취소
                      </button>
                    )}
                  </li>
                )
              )}
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

const sipSteps = [
  { key: 'held', label: '컵이나 병을 들어요' },
  { key: 'mouth', label: '입으로 가져가요' },
  { key: 'sip', label: '고개를 젖히거나 빨대로 마셔요' }
] as const

/**
 * 카메라가 지금 무엇을 보고 있는지 사용자가 직접 확인하는 화면이다.
 * 캔버스 ref 콜백과 렌더링 값을 한 객체로 넘기면 react-hooks/refs 규칙에 걸려 따로 받는다.
 */
function CameraView({
  setPreview,
  sipCount,
  status
}: {
  setPreview: CameraControl['setPreview']
  sipCount: number
  status: CameraControl['detectionStatus']
}): React.JSX.Element {
  const done = {
    held: Boolean(status?.held),
    mouth: status?.handAtMouth === true || status?.sipPhase !== 'idle',
    sip: status?.sipPhase === 'sipping'
  }
  const holdHint =
    status?.holdSource === 'touch'
      ? '손에 든 걸 찾았어요'
      : status?.holdSource === 'zoom'
        ? '손 주변을 확대해 찾았어요'
        : status?.holdSource === 'pickup'
          ? '집어 드는 걸 봤어요'
          : status?.holdSource === 'mouth'
            ? '입에 댄 걸 찾았어요'
            : '손을 가슴 위로 들면 주변을 확대해 찾아요'
  const headHint = status?.straw
    ? '빨대로 마시는 걸 봤어요'
    : status?.headSource === 'face'
      ? `고개 ${(status.lift ?? 0) > 0 ? '+' : ''}${status.lift}°`
      : status?.headSource === 'pose'
        ? '몸 자세로 보고 있어요'
        : status?.headSource === 'covered'
          ? '얼굴이 가려져도 이어서 봐요'
          : '얼굴을 찾고 있어요'
  return (
    <div className="camera-view">
      <div className="camera-preview-frame">
        <canvas
          ref={setPreview}
          className="camera-preview"
          aria-label="카메라가 인식한 얼굴, 손, 컵을 보여주는 화면"
        />
        <div key={sipCount} className="camera-detection-count" role="status">
          마신 동작 <strong>{sipCount}회</strong>
        </div>
      </div>
      <div className="camera-guide">
        <ol className="camera-steps" aria-label="마시는 동작 인식 단계">
          {sipSteps.map((step, index) => (
            <li key={step.key} className={done[step.key] ? 'on' : ''}>
              <span className="camera-step-num" aria-hidden="true">
                {done[step.key] ? '✓' : index + 1}
              </span>
              <span>
                {step.label}
                {step.key === 'held' && <small>{holdHint}</small>}
                {step.key === 'sip' && <small>{headHint}</small>}
              </span>
            </li>
          ))}
        </ol>
        <ul className="camera-legend" aria-label="화면 표시">
          <li className="face">얼굴</li>
          <li className="cup">컵·병</li>
          <li className="hand">손·확대 영역</li>
          <li className="mouth">입</li>
        </ul>
        {/* 빨대 판정은 입 오므림이 0.45 이상일 때다. 기준을 조정할 때 이 값을 본다. */}
        <p className="camera-measure" aria-label="입 모양 측정값">
          입 오므림 <b className="num">{status?.mouth ? status.mouth.pucker.toFixed(2) : '–'}</b>
          <small>3초 최고 {status?.mouthPeak ? status.mouthPeak.pucker.toFixed(2) : '–'}</small>·
          입술 모음 <b className="num">{status?.mouth ? status.mouth.funnel.toFixed(2) : '–'}</b>
          <small>3초 최고 {status?.mouthPeak ? status.mouthPeak.funnel.toFixed(2) : '–'}</small>
        </p>
      </div>
    </div>
  )
}

function Settings({
  state,
  refresh,
  camera
}: {
  state: ConfiguredState
  refresh: () => Promise<void>
  camera: CameraControl
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [goal, setGoal] = useState('')
  const [snapshot, setSnapshot] = useState({
    goalId: state.status === 'ready' ? state.goalId : null,
    todayMl: state.todayMl,
    day: state.day
  })
  const [cup, setCup] = useState(String(state.cupMl))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [gardenSettings, setGardenSettings] = useState<GardenSettings | null>(null)
  const [gardenError, setGardenError] = useState('')
  const [gardenSaving, setGardenSaving] = useState(false)
  const gardenRunning = useRef(false)
  useEffect(() => {
    let active = true
    let sequence = 0
    function load(): void {
      const current = ++sequence
      void window.hanzanhae
        .getGardenSettings()
        .then((response) => {
          if (!active || current !== sequence) return
          if (response.ok) {
            setGardenSettings(response.settings)
            setGardenError('')
          } else setGardenError('정원 설정을 불러오지 못했어요.')
        })
        .catch(() => {
          if (active && current === sequence) setGardenError('정원 설정을 불러오지 못했어요.')
        })
    }
    const unsubscribe = window.hanzanhae.onGardenSettingsChanged(load)
    load()
    return () => {
      active = false
      unsubscribe()
    }
  }, [])
  async function reloadGardenSettings(): Promise<void> {
    setGardenError('')
    try {
      const response = await window.hanzanhae.getGardenSettings()
      if (response.ok) setGardenSettings(response.settings)
      else setGardenError('정원 설정을 불러오지 못했어요.')
    } catch {
      setGardenError('정원 설정을 불러오지 못했어요.')
    }
  }
  async function changeGardenSettings(change: GardenSettingsChange): Promise<void> {
    if (gardenRunning.current) return
    gardenRunning.current = true
    setGardenSaving(true)
    setGardenError('')
    try {
      const response = await window.hanzanhae.updateGardenSettings(change)
      if (response.ok) setGardenSettings(response.settings)
      else setGardenError('정원 설정을 저장하지 못했어요. 다시 시도해 주세요.')
    } catch {
      setGardenError('정원 설정을 저장하지 못했어요. 다시 시도해 주세요.')
    } finally {
      gardenRunning.current = false
      setGardenSaving(false)
    }
  }
  const goalId = state.status === 'ready' ? state.goalId : null
  const [loginItem, setLoginItem] = useState<Extract<LoginItemResult, { ok: true }> | null>(null)
  const [loginSaving, setLoginSaving] = useState(false)
  const [loginError, setLoginError] = useState('')
  useEffect(() => {
    let active = true
    void window.hanzanhae
      .getLoginItem()
      .then((response) => {
        if (!active) return
        if (response.ok) setLoginItem(response)
        else setLoginError('자동 실행 상태를 불러오지 못했어요.')
      })
      .catch(() => active && setLoginError('자동 실행 상태를 불러오지 못했어요.'))
    return () => {
      active = false
    }
  }, [])
  async function changeLoginItem(openAtLogin: boolean): Promise<void> {
    if (loginSaving) return
    setLoginSaving(true)
    setLoginError('')
    try {
      const response = await window.hanzanhae.setLoginItem(openAtLogin)
      if (response.ok) setLoginItem(response)
      else setLoginError('자동 실행 설정을 바꾸지 못했어요. 다시 시도해 주세요.')
    } catch {
      setLoginError('자동 실행 설정을 바꾸지 못했어요. 다시 시도해 주세요.')
    } finally {
      setLoginSaving(false)
    }
  }

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
    if (!isMlInput(goal)) {
      setError('하루 목표를 1회 이상으로 입력해 주세요.')
      return
    }
    if (
      await save({
        requestId: crypto.randomUUID(),
        kind: 'goal',
        goalCount: Number(goal),
        todayMl: snapshot.todayMl,
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
      setError('텀블러 용량을 1ml 이상으로 입력해 주세요.')
      return
    }
    if (Number(cup) === state.cupMl) return
    if (await save({ requestId: crypto.randomUUID(), kind: 'cup', cupMl: Number(cup) }))
      setMessage('텀블러 용량을 저장했어요.')
  }
  function startEditing(): void {
    setGoal('')
    setSnapshot({ goalId, todayMl: state.todayMl, day: state.day })
    setError('')
    setMessage('')
    setEditing(true)
  }
  async function stopGoal(): Promise<void> {
    if (goalId === null) return
    if (await save({ requestId: crypto.randomUUID(), kind: 'stop', expectedGoalId: goalId }))
      setMessage('목표를 멈췄어요. 새 목표를 설정할 수 있어요.')
    // 실패해도 모달을 닫고 설정 화면의 오류 안내를 보여준다.
    setStopping(false)
  }
  return (
    <section className="view on" aria-label="설정">
      <div className="head">
        <h1>설정</h1>
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
          </div>
          <div>
            <div className="goal-row">
              <div className="goal-big num">
                {state.status === 'ready' ? (
                  <>
                    <b>{format(state.goalCount)}</b>
                    <span>회</span>
                  </>
                ) : (
                  <b>목표 없음</b>
                )}
              </div>
              <div className="goal-actions">
                <button className="btn line" disabled={busy} onClick={startEditing}>
                  {state.status === 'ready' ? '목표 바꾸기' : '새 목표 설정'}
                </button>
                {state.status === 'ready' && (
                  <button
                    className="btn ghost danger"
                    disabled={busy}
                    onClick={() => {
                      setError('')
                      setMessage('')
                      setStopping(true)
                    }}
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
                      <span>회</span>
                    </span>
                  </label>
                </div>
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
        {stopping && state.status === 'ready' && (
          <StopGoalDialog
            goalCount={state.goalCount}
            todayCount={state.todayCount}
            plantStage={state.plantStage}
            busy={busy}
            onDismiss={() => setStopping(false)}
            onConfirm={stopGoal}
            onChangeGoal={startEditing}
          />
        )}
        <section className="sset">
          <div className="sset-head">
            <h2>텀블러 용량</h2>
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
                aria-label="텀블러 용량"
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
          </div>
          <div className="place-pick">
            <button
              className={`place ${gardenSettings?.placement === 'dock' ? 'on' : ''}`}
              aria-pressed={gardenSettings?.placement === 'dock'}
              disabled={!gardenSettings || gardenSaving}
              onClick={() => void changeGardenSettings({ kind: 'placement', placement: 'dock' })}
            >
              <span className="mini">
                <i className="dock" />
                <img src={stages[2].image} alt="" className="on-dock" />
              </span>
              <b>Dock 위</b>
            </button>
            <button
              className={`place ${gardenSettings?.placement === 'floor' ? 'on' : ''}`}
              aria-pressed={gardenSettings?.placement === 'floor'}
              disabled={!gardenSettings || gardenSaving}
              onClick={() => void changeGardenSettings({ kind: 'placement', placement: 'floor' })}
            >
              <span className="mini">
                <i className="dock" />
                <img src={stages[2].image} alt="" className="on-floor" />
              </span>
              <b>화면 바닥</b>
            </button>
          </div>
          {gardenError && (
            <p className="water-error" role="alert">
              {gardenError}{' '}
              {!gardenSettings && (
                <button className="cancel-retry" onClick={() => void reloadGardenSettings()}>
                  다시 시도
                </button>
              )}
            </p>
          )}
        </section>
        <section className="sset">
          <div className="sset-head">
            <h2>위젯 동작</h2>
          </div>
          <div className="group">
            <div className="set">
              <div>
                <b>다른 창 위에 표시</b>
              </div>
              <button
                className="switch"
                role="switch"
                aria-checked={gardenSettings?.alwaysOnTop ?? false}
                aria-label="다른 창 위에 표시"
                disabled={!gardenSettings || gardenSaving}
                onClick={() => {
                  if (gardenSettings)
                    void changeGardenSettings({
                      kind: 'alwaysOnTop',
                      alwaysOnTop: !gardenSettings.alwaysOnTop
                    })
                }}
              />
            </div>
            <div className="set">
              <div>
                <b>로그인 시 자동 실행</b>
                {loginItem && !loginItem.available && (
                  <span className="set-sub">설치한 앱에서 바꿀 수 있어요</span>
                )}
                {loginItem?.needsApproval && (
                  <span className="set-sub">
                    시스템 설정 &gt; 일반 &gt; 로그인 항목에서 한잔해를 허용해 주세요
                  </span>
                )}
              </div>
              <button
                className="switch"
                role="switch"
                aria-checked={loginItem?.openAtLogin ?? false}
                aria-label="로그인 시 자동 실행"
                disabled={!loginItem?.available || loginSaving}
                onClick={() => void changeLoginItem(!loginItem?.openAtLogin)}
              />
            </div>
            {loginError && (
              <p className="water-error" role="alert">
                {loginError}
              </p>
            )}
          </div>
        </section>
        <section className="sset wide">
          <div className="sset-head">
            <h2>카메라 감지</h2>
          </div>
          <div className="group camera-settings">
            <div className="set">
              <div>
                <b>마시는 동작 알아보기</b>
                <span className="camera-sub">
                  마시면 오늘 횟수에 1회 기록해요. 영상은 이 Mac에서만 보고 저장하지 않아요
                </span>
              </div>
              <button
                className="switch"
                role="switch"
                aria-checked={camera.status !== 'off'}
                aria-label="카메라 감지"
                disabled={state.status !== 'ready'}
                onClick={() => {
                  if (camera.status === 'off') void camera.start()
                  else camera.stop()
                }}
              />
            </div>
            {camera.status === 'on' && (
              <CameraView
                setPreview={camera.setPreview}
                sipCount={camera.sipCount}
                status={camera.detectionStatus}
              />
            )}
            {(state.status !== 'ready' || camera.status === 'starting' || camera.message) && (
              <p className="camera-note" role="status">
                {state.status !== 'ready'
                  ? '목표를 먼저 설정해 주세요.'
                  : camera.status === 'starting'
                    ? '카메라를 준비하고 있어요.'
                    : camera.message}
              </p>
            )}
          </div>
        </section>
        <ReminderSettingsPanel />
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
  const cameraRecord = useCameraRecord(state, refresh)
  const camera = useCameraDetection(state.status === 'ready', cameraRecord.record)
  const cameraNotice = cameraRecord.notice

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
        {camera.status !== 'off' && (
          <button className="camera-active" onClick={camera.stop}>
            <span aria-hidden="true" />
            {camera.status === 'starting' ? '카메라 준비 중 · 취소' : '카메라 사용 중 · 끄기'}
          </button>
        )}
      </aside>
      {cameraNotice && (
        // 키(key)를 바꿔 새 알림마다 등장 효과와 남은 시간 막대를 다시 시작한다.
        <div
          key={cameraNotice.kind === 'recorded' ? cameraNotice.recordId : cameraNotice.kind}
          className={`camera-toast ${cameraNotice.kind}`}
          role={cameraNotice.kind === 'error' ? 'alert' : 'status'}
        >
          <img className="camera-toast-icon" src={drop} alt="" />
          <div className="camera-toast-text">
            <b>
              {cameraNotice.kind === 'recorded'
                ? '물 마신 걸 기록했어요'
                : cameraNotice.kind === 'undone'
                  ? '카메라 기록을 되돌렸어요'
                  : '기록하지 못했어요'}
            </b>
            <span>
              {cameraNotice.kind === 'error'
                ? cameraNotice.message
                : state.status === 'ready'
                  ? `오늘 ${state.todayCount}회 · 목표 ${state.goalCount}회`
                  : ''}
            </span>
          </div>
          {cameraNotice.kind === 'recorded' && (
            <button
              type="button"
              className="camera-toast-undo"
              disabled={cameraRecord.busy}
              onClick={() => void cameraRecord.undo()}
            >
              되돌리기
            </button>
          )}
          <i className="camera-toast-timer" aria-hidden="true" />
        </div>
      )}
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
                <h1>물 마시기 횟수 목표를 설정해 주세요</h1>
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
        {view === 'settings' && <Settings state={state} refresh={refresh} camera={camera} />}
      </main>
    </div>
  )
}

export default Dashboard
