import { useState } from 'react'
import type { AppState, SettingsInput } from '../../../../shared/appState'
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
import stage1 from '../../assets/stage1.webp'
import stage2 from '../../assets/stage2.webp'
import stage3 from '../../assets/stage3.webp'
import stage4 from '../../assets/stage4.webp'
import './dashboard.css'

// 대시보드에서 선택할 수 있는 화면을 세 가지로 제한한다.
type View = 'today' | 'history' | 'settings'

// 성장 여정에 보여줄 이미지 순서다. 단계가 바뀌는 성장량은 아직 정하지 않았다.
const stages = [
  { name: '새싹', image: stage1 },
  { name: '어린 잎', image: stage2 },
  { name: '무성한 잎', image: stage3 },
  { name: '꽃', image: stage4 }
]

const navItems: { view: View; label: string; icon: string }[] = [
  { view: 'today', label: '오늘', icon: navToday },
  { view: 'history', label: '기록', icon: navHistory },
  { view: 'settings', label: '설정', icon: navSettings }
]

const format = (value: number): string => value.toLocaleString('ko-KR')

function getDayLabels(): { label: string; full: string }[] {
  // 앱의 하루 기준인 한국 시간으로 6일 전부터 오늘까지의 날짜를 표시한다.
  const now = Date.now()
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now - (6 - index) * 24 * 60 * 60 * 1000)
    const full = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    }).format(date)
    const weekday = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      weekday: 'short'
    }).format(date)
    return { label: index === 6 ? '오늘' : weekday, full }
  })
}

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

// 기록 기능 연결 전에는 저장된 목표와 빈 기록 상태만 보여준다.
function Today({
  onSettings,
  goalMl,
  cupMl,
  todayMl
}: {
  onSettings: () => void
  goalMl: number
  cupMl: number
  todayMl: number
}): React.JSX.Element {
  const preview = { goal: goalMl, cup: cupMl, today: [] as { time: string; amount: number }[] }
  const amount = todayMl
  const today = getDayLabels()[6].full
  const percent = Math.min(100, Math.round((amount / preview.goal) * 100))

  return (
    <section className="view on" aria-label="오늘">
      <div className="today-grid">
        <div className="col main-col">
          <div className="hero">
            <div className="msg">
              <div className="hi">{today}</div>
              <h1>
                오늘 <em>{preview.today.length}잔</em> 마셨어요
                <br />
                새싹이 기다리고 있어요
              </h1>
              <p>목표까지 {format(Math.max(0, preview.goal - amount))}ml 남았어요.</p>
              <div className="grow">
                <div className="steps" aria-hidden="true">
                  <i className="on" />
                  <i />
                  <i />
                  <i />
                </div>
                <span>새싹 · 성장을 준비하고 있어요</span>
              </div>
            </div>
            <div className="pot">
              <img src={stage1} alt="새싹 화분" />
            </div>
          </div>
          <div className="card today">
            <div className="today-top">
              <div>
                <h2>오늘 마신 물</h2>
                <div className="big num">
                  <b>{format(amount)}</b>
                  <span>ml</span>
                </div>
                <div className="sub">
                  목표까지 {format(Math.max(0, preview.goal - amount))}ml 남았어요
                </div>
              </div>
              <div className="today-actions">
                <button className="goal-link" onClick={onSettings}>
                  목표 <span className="num">{format(preview.goal)}</span>ml ›
                </button>
                <button className="drink" disabled>
                  <img src={drop} alt="" width="20" height="20" /> 한 잔 마셨어요{' '}
                  <small>+{preview.cup}ml</small>
                </button>
              </div>
            </div>
            <div className="track" aria-label={`목표 진행률 ${percent}%`}>
              <div className="fill" style={{ width: `${percent}%` }} />
              <div className="thumb" style={{ left: `${percent}%` }}>
                <b className="num">{percent}%</b>
                <img src={drop} alt="" width="38" height="38" />
              </div>
            </div>
            <div className="ends">
              <span>0</span>
              <span className="num">{format(preview.goal)}ml</span>
            </div>
          </div>
          <div className="tiles">
            <Metric
              icon={statLeft}
              label="남은 양"
              value={format(Math.max(0, preview.goal - amount))}
              unit="ml"
            />
            <Metric icon={statCups} label="오늘 마신 잔" value={preview.today.length} unit="잔" />
            <Metric icon={statStreak} label="연속 달성" value="—" unit="" />
            <Metric icon={statVitality} label="화분 생기" value="—" unit="" />
          </div>
        </div>
        <div className="col side-col">
          <div className="card plain">
            <h2>
              최근 7일 <small>점선은 하루 목표</small>
            </h2>
            <p>물 기록 기능을 준비하고 있어요.</p>
          </div>
          <div className="card plain stretch">
            <h2>
              오늘 기록{' '}
              <button className="plain-action" disabled>
                전체 취소
              </button>
            </h2>
            <p>물 기록 기능을 준비하고 있어요.</p>
            <ul className="records">
              {/* 원본 순서를 바꾸지 않고 최근 기록부터 보여준다. */}
              {[...preview.today].reverse().map((record, index) => (
                <li key={record.time}>
                  <span className="dot">
                    <img src={drop} alt="" />
                  </span>
                  <span className="num">{record.amount}ml</span>
                  <span className="t num">{record.time}</span>
                  {index === 0 && <button disabled>최근 한 잔 취소</button>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

// 저장된 기록이 없는 동안 성장 여정과 통계의 준비 상태를 표시한다.
function History(): React.JSX.Element {
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
              <div key={stage.name} className={`stage ${index === 0 ? 'done now' : 'todo'}`}>
                <img src={stage.image} alt={`${stage.name} 화분`} />
                <b>{stage.name}</b>
                <span>{index === 0 ? '시작' : '성장 단계'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card plain week-cups">
          <h2>최근 7일 물컵</h2>
          <p>물 기록과 통계 기능을 준비하고 있어요.</p>
        </div>
        <div className="col summary">
          <Metric icon={statCups} label="하루 평균" value="—" unit="" />
          <Metric icon={statStreak} label="목표 달성" value="—" unit="" />
          <Metric icon={statLeft} label="가장 많이 마신 날" value="—" unit="" />
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
  const positive = (value: string): boolean =>
    /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0
  const nonnegative = (value: string): boolean =>
    /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= 0
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
    if (!positive(goal) || !nonnegative(total)) {
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
    if (!positive(cup)) {
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
                <img src={stage3} alt="" className="on-dock" />
              </span>
              <b>Dock 위</b>
            </button>
            <button className="place" disabled>
              <span className="mini">
                <i className="dock" />
                <img src={stage3} alt="" className="on-floor" />
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
          로그인 없이 사용 중<div className="preview-note">물 기록 기능을 준비하고 있어요.</div>
        </div>
      </aside>
      <main>
        {view === 'today' &&
          (state.status === 'ready' ? (
            <Today
              onSettings={() => setView('settings')}
              goalMl={state.goalMl}
              cupMl={state.cupMl}
              todayMl={state.todayMl}
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
        {view === 'history' && <History />}
        {view === 'settings' && <Settings state={state} refresh={refresh} />}
      </main>
    </div>
  )
}

export default Dashboard
