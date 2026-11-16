import { useEffect, useRef, useState } from 'react'
import { STAGE_POINTS } from '../../../../shared/appState'
import type { AppState, WaterStatistics, DrinkActionInput } from '../../../../shared/appState'
import { useRecordCup } from '../water/useRecordCup'
import { useCancelWater } from '../water/useCancelWater'
import ClearTodayDialog, { type ClearTodaySnapshot } from './ClearTodayDialog'
import { WeekChart } from '../statistics/WaterStatistics'
import statLeft from '../../assets/icons/stat-left.webp'
import statCups from '../../assets/icons/stat-cups.webp'
import statStreak from '../../assets/icons/stat-streak.webp'
import statVitality from '../../assets/icons/stat-vit.webp'
import drop from '../../assets/icons/drop.webp'
import { plantFrame, plantIndex, plants as stages } from '../plant/plantVisual'
import { format, dayFormat, timeFormat } from './dashboardFormat'
import { Metric } from './parts'
import { StatisticsStatus } from './HistoryView'

// 실제 물 기록과 기섭취량 조정을 함께 보여준다.
export default function Today({
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
  const next = stages[stageIndex + 1]
  // 100%는 다음 단계로 바뀔 때만 보이도록 99%에서 멈춘다.
  const growPercent = next
    ? Math.min(
        99,
        Math.floor(
          ((state.growthPoints - STAGE_POINTS[stage.id]) /
            (STAGE_POINTS[next.id] - STAGE_POINTS[stage.id])) *
            100
        )
      )
    : 100

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
                <div className="grow-head">
                  <span>
                    {stage.name} {next ? `→ ${next.name}` : '· 활짝 피었어요'}
                  </span>
                  {next && <b>{growPercent}%</b>}
                </div>
                <div
                  className="grow-bar"
                  role="progressbar"
                  aria-label={next ? `${next.name}까지 자란 정도` : '성장 완료'}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={growPercent}
                >
                  <i style={{ width: `${growPercent}%` }} />
                </div>
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
