import { useEffect, useRef, useState } from 'react'
import type {
  SettingsInput,
  GardenSettings,
  GardenSettingsChange,
  LoginItemResult
} from '../../../../shared/appState'
import { dockName, platformName, platformSupport } from '../../../../shared/platform'
import { isMlInput } from '../water/mlInput'
import StopGoalDialog from './StopGoalDialog'
import ResetDataDialog from './ResetDataDialog'
import { type CameraControl } from '../camera/useCameraDetection'
import ReminderSettingsPanel from '../reminders/ReminderSettingsPanel'
import { plants as stages } from '../plant/plantVisual'
import { type ConfiguredState, format } from './dashboardFormat'
import { Glass } from './parts'
import CameraView from './CameraView'

const platform = window.hanzanhae?.platform ?? 'darwin'
const support = platformSupport(platform)
// 이 OS에서 동작하지 않는 위젯 기능을 조용히 빼지 않고 설정 화면에 알린다.
const unsupportedWidgetFeatures = [
  !support.gardenClickThrough &&
    '정원 창의 빈 곳 클릭 통과(정원 창 영역은 아래 창을 클릭할 수 없어요)',
  !support.screenLockEvents && '화면 잠금 감지(잠금 중에도 생기가 평소 속도로 줄어요)'
].filter((feature): feature is string => !!feature)

export default function Settings({
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
  const [resetting, setResetting] = useState(false)
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
  async function exportRecords(): Promise<void> {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const result = await window.hanzanhae.exportRecords()
      if (!result.ok) setError('기록을 내보내지 못했어요. 다시 시도해 주세요.')
      else if (result.saved) setMessage('기록을 CSV 파일로 저장했어요.')
    } catch {
      setError('기록을 내보내지 못했어요. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }
  async function resetData(): Promise<void> {
    setBusy(true)
    try {
      const result = await window.hanzanhae.resetData()
      if (!result.ok) setError('기록을 지우지 못했어요. 데이터는 그대로예요.')
    } catch {
      setError('기록을 지우지 못했어요. 데이터는 그대로예요.')
    } finally {
      setBusy(false)
      setResetting(false)
    }
    // 성공하면 첫 설정 화면으로 바뀐다.
    await refresh()
  }
  return (
    <section className="view on settings-view" aria-label="설정">
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
              <b>{dockName(platform)} 위</b>
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
                  <span className="set-sub">
                    {support.loginItem
                      ? '설치한 앱에서 바꿀 수 있어요'
                      : `${platformName(platform)}에서는 지원하지 않아요`}
                  </span>
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
            {unsupportedWidgetFeatures.length > 0 && (
              <p className="preview-note">
                {platformName(platform)}에서는 지원하지 않아요:{' '}
                {unsupportedWidgetFeatures.join(', ')}
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
                <span id="camera-privacy-description" className="camera-sub">
                  창을 닫아도 감지해요. 메뉴 막대에서 끌 수 있어요. 영상은 이 Mac에서만 분석하고
                  저장하지 않아요.
                </span>
              </div>
              <button
                className="switch"
                role="switch"
                aria-checked={camera.status !== 'off'}
                aria-label="카메라 감지"
                aria-describedby="camera-privacy-description"
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
        <section className="sset wide">
          <div className="sset-head">
            <h2>기록 관리</h2>
          </div>
          <div className="group">
            <div className="set">
              <div>
                <b>기록 내보내기</b>
                <span className="set-sub">마신 횟수와 텀블러 기록을 CSV 파일로 저장해요</span>
              </div>
              <button className="btn line" disabled={busy} onClick={() => void exportRecords()}>
                CSV로 저장
              </button>
            </div>
            <div className="set">
              <div>
                <b>모든 기록 지우기</b>
                <span className="set-sub">화분과 설정까지 지우고 첫 설정부터 다시 시작해요</span>
              </div>
              <button
                className="btn ghost danger"
                disabled={busy}
                onClick={() => {
                  setError('')
                  setMessage('')
                  setResetting(true)
                }}
              >
                지우기
              </button>
            </div>
          </div>
        </section>
        {resetting && (
          <ResetDataDialog
            busy={busy}
            onDismiss={() => setResetting(false)}
            onConfirm={resetData}
          />
        )}
      </div>
    </section>
  )
}
