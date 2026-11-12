import { useState } from 'react'
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

type View = 'today' | 'history' | 'settings'

// 화면을 확인하기 위한 예시이며, 실제 기록이나 성장 기준이 아니다.
const preview = {
  goal: 1500,
  cup: 250,
  vitality: 72,
  today: [
    { time: '09:12', amount: 250 },
    { time: '10:40', amount: 250 },
    { time: '13:05', amount: 250 }
  ],
  previousDays: [1250, 1500, 1750, 900, 1600, 1500]
}

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

const amount = preview.today.reduce((sum, record) => sum + record.amount, 0)
const weeklyAmounts = [...preview.previousDays, amount]
const format = (value: number): string => value.toLocaleString('ko-KR')

function getDayLabels(): { label: string; full: string }[] {
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

function WeeklyChart(): React.JSX.Element {
  const labels = getDayLabels()
  const width = 520
  const height = 180
  const left = 38
  const bottom = 26
  const top = 14
  const max = Math.max(preview.goal * 1.3, ...weeklyAmounts)
  const y = (value: number): number => top + (height - top - bottom) * (1 - value / max)
  const step = (width - left) / 7
  const barWidth = Math.min(26, step * 0.42)

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="최근 7일 마신 물의 양 예시">
        {[0, 500, 1000, 1500, 2000]
          .filter((value) => value <= max)
          .map((value) => (
            <g key={value}>
              <line x1={left} x2={width} y1={y(value)} y2={y(value)} stroke="var(--line)" />
              <text
                x={left - 8}
                y={y(value) + 4}
                textAnchor="end"
                fontSize="10"
                fill="var(--text-muted)"
              >
                {format(value)}
              </text>
            </g>
          ))}
        {weeklyAmounts.map((value, index) => {
          const x = left + step * index + (step - barWidth) / 2
          const barTop = y(value)
          const base = y(0)
          return (
            <g key={labels[index].full}>
              <title>{`${labels[index].full}: ${format(value)}ml`}</title>
              <rect
                x={x}
                y={barTop}
                width={barWidth}
                height={base - barTop}
                rx="4"
                fill={index === 6 ? 'var(--brand)' : 'var(--brand-mid)'}
              />
              <text
                x={x + barWidth / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize="11"
                fill={index === 6 ? 'var(--text)' : 'var(--text-sub)'}
                fontWeight={index === 6 ? 700 : 400}
              >
                {labels[index].label}
              </text>
            </g>
          )
        })}
        <line
          x1={left}
          x2={width}
          y1={y(preview.goal)}
          y2={y(preview.goal)}
          stroke="var(--text-sub)"
          strokeWidth="1.2"
          strokeDasharray="4 4"
        />
      </svg>
    </div>
  )
}

function Glass({ percent, height }: { percent: number; height?: number }): React.JSX.Element {
  return (
    <span className="glass" style={height ? { height } : undefined} aria-hidden="true">
      <i style={{ height: `${Math.min(100, percent)}%` }} />
    </span>
  )
}

function Today({ onSettings }: { onSettings: () => void }): React.JSX.Element {
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
                화분이 생생해요
              </h1>
              <p>목표까지 {format(preview.goal - amount)}ml 남았어요.</p>
              <div className="grow">
                <div className="steps" aria-hidden="true">
                  <i className="on" />
                  <i className="on" />
                  <i className="on" />
                  <i />
                </div>
                <span>무성한 잎 · 다음 단계까지 성장 중</span>
              </div>
            </div>
            <div className="pot">
              <img src={stage3} alt="무성한 잎 화분" />
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
                <div className="sub">목표까지 {format(preview.goal - amount)}ml 남았어요</div>
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
            <div className="track" aria-label={`목표 진행률 예시 ${percent}%`}>
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
              value={format(preview.goal - amount)}
              unit="ml"
            />
            <Metric icon={statCups} label="오늘 마신 잔" value={preview.today.length} unit="잔" />
            <Metric icon={statStreak} label="연속 달성" value={2} unit="일" />
            <Metric icon={statVitality} label="화분 생기" value={preview.vitality} unit="%" />
          </div>
        </div>
        <div className="col side-col">
          <div className="card plain">
            <h2>
              최근 7일 <small>점선은 하루 목표</small>
            </h2>
            <WeeklyChart />
          </div>
          <div className="card plain stretch">
            <h2>
              오늘 기록{' '}
              <button className="plain-action" disabled>
                전체 취소
              </button>
            </h2>
            <ul className="records">
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

function History(): React.JSX.Element {
  const labels = getDayLabels()
  const average = Math.round(weeklyAmounts.reduce((sum, value) => sum + value, 0) / 7 / 10) * 10
  const best = weeklyAmounts.indexOf(Math.max(...weeklyAmounts))

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
                className={`stage ${index < 2 ? 'done' : index === 2 ? 'done now' : 'todo'}`}
              >
                <img src={stage.image} alt={`${stage.name} 화분`} />
                <b>{stage.name}</b>
                <span>{index === 0 ? '시작' : '성장 단계'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card plain week-cups">
          <h2>
            최근 7일 물컵 <small>컵이 가득 차면 그날 목표 달성</small>
          </h2>
          <div className="cups">
            {weeklyAmounts.map((value, index) => (
              <div className={`cupday ${index === 6 ? 'today' : ''}`} key={labels[index].full}>
                <span className="ml num">{format(value)}ml</span>
                <Glass percent={(value / preview.goal) * 100} />
                <span className="day">{labels[index].label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="col summary">
          <Metric icon={statCups} label="하루 평균" value={format(average)} unit="ml" />
          <Metric icon={statStreak} label="목표 달성" value={4} unit="/ 7일" />
          <Metric
            icon={statLeft}
            label="가장 많이 마신 날"
            value={labels[best].label}
            unit={`${format(weeklyAmounts[best])}ml`}
          />
        </div>
      </div>
    </section>
  )
}

function Settings(): React.JSX.Element {
  return (
    <section className="view on" aria-label="설정">
      <div className="head">
        <h1>설정</h1>
        <span>기록은 이 Mac에만 저장돼요</span>
      </div>
      <div className="settings">
        <section className="sset">
          <div className="sset-head">
            <h2>하루 목표</h2>
            <p>
              목표를 바꾸려면 지금 목표를 멈추고 새로 만들어요. 지금까지의 기록과 화분은 그대로
              남아요.
            </p>
          </div>
          <div className="goal-row">
            <div className="goal-big num">
              <b>{format(preview.goal)}</b>
              <span>ml</span>
            </div>
            <button className="btn danger" disabled>
              목표 멈추기
            </button>
          </div>
        </section>
        <section className="sset">
          <div className="sset-head">
            <h2>한 잔 용량</h2>
            <p>물 마셨어요 버튼을 한 번 누를 때 기록되는 양이에요.</p>
          </div>
          <div className="cup-pick">
            {[150, 200, 250, 300, 500].map((cup) => (
              <button
                className={`cup-opt ${cup === preview.cup ? 'on' : ''}`}
                key={cup}
                disabled
                aria-label={`${cup}ml`}
              >
                <Glass percent={85} height={24 + cup / 10} />
                <b className="num">{cup}</b>
              </button>
            ))}
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
            <div className="set">
              <div>
                <b>기록 카드 열기</b>
                <small>화분 위에 뜨는 작은 기록 창</small>
              </div>
              <div className="seg">
                <button className="on" disabled>
                  클릭 시
                </button>
                <button disabled>마우스 올릴 때</button>
              </div>
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

function Dashboard(): React.JSX.Element {
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
          로그인 없이 사용 중
          <div className="preview-note">화면 미리보기 · 기록과 설정은 아직 저장되지 않아요.</div>
        </div>
      </aside>
      <main>
        {view === 'today' && <Today onSettings={() => setView('settings')} />}
        {view === 'history' && <History />}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  )
}

export default Dashboard
